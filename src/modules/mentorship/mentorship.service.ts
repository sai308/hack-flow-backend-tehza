import type { MentorshipRepository } from './mentorship.repository';
import { getRedisClient } from '../../config/redis';
import { ConflictError, NotFoundError, ForbiddenError } from '../../common/errors/http-errors';
import type { CreateAvailabilityDto, CreateMentorshipRequestDto } from './mentorship.schema';
import type { AuditLogRepository } from '../audit-log/audit-log.repository';
import { scheduleReminder, cancelReminder } from '../../services/reminder.service';

const LOCK_TTL_MS = 10_000; // 10 second Redis lock TTL

export class MentorshipService {
  constructor(
    private readonly repo: MentorshipRepository,
    private readonly auditLog?: AuditLogRepository,
  ) {}

  async listAvailabilities(mentorId: string, hackathonId?: string) {
    return this.repo.findAvailabilitiesByMentor(mentorId, hackathonId);
  }

  async listAllAvailabilities(hackathonId?: string) {
    return this.repo.findAllAvailabilities(hackathonId);
  }

  async createAvailability(mentorId: string, dto: CreateAvailabilityDto) {
    const start = new Date(dto.startDatetime);
    const end = new Date(dto.endDatetime);

    const overlapping = await this.repo.findOverlappingAvailabilities(mentorId, start, end);
    if (overlapping.length > 0) {
      throw new ConflictError('This availability overlaps with an existing one');
    }

    return this.repo.createAvailability(mentorId, dto);
  }

  async deleteAvailability(id: string) {
    // Find active bookings before deletion
    const activeRequests = await this.repo.findActiveRequestsByAvailabilityWithTeam(id);

    // Cancel each active request and stop reminders
    for (const req of activeRequests) {
      await this.repo.updateRequestStatus(req.id, 'cancelled');
      void cancelReminder(req.id);
    }

    await this.repo.deleteAvailability(id);

    return {
      cancelledRequests: activeRequests.map((r: any) => ({
        id: r.id,
        teamId: r.teamId,
        teamName: r.team?.name ?? 'Команда',
        startDatetime: r.startDatetime instanceof Date ? r.startDatetime.toISOString() : r.startDatetime,
        durationMinute: r.durationMinute,
      })),
    };
  }

  async getRequestsByAvailability(availabilityId: string) {
    return this.repo.findRequestsByAvailability(availabilityId);
  }

  async getRequestsByTeam(teamId: string) {
    return this.repo.findRequestsByTeam(teamId);
  }

  async getAllRequests() {
    return this.repo.findAllRequests();
  }

  async createRequest(dto: CreateMentorshipRequestDto, userId?: string) {
    const start = new Date(dto.startDatetime);
    const end = new Date(start.getTime() + dto.durationMinute * 60_000);
    const lockKey = `mentorship:lock:${dto.mentorAvailabilityId}:${start.toISOString()}`;

    const redis = getRedisClient();
    const acquired = await redis.set(lockKey, '1', 'PX', LOCK_TTL_MS, 'NX');

    if (!acquired) {
      throw new ConflictError('This slot is currently being requested — please try again in a moment');
    }

    try {
      const overlapping = await this.repo.findOverlappingRequests(
        dto.mentorAvailabilityId,
        start,
        end,
      );

      if (overlapping.length > 0) {
        throw new ConflictError('This time slot overlaps with an existing pending or accepted request');
      }

      return await this.repo.createRequest(dto);
    } finally {
      await redis.del(lockKey);
    }
  }

  async acceptRequest(id: string, meetingLink: string, mentorId: string) {
    const request = await this.repo.findRequestById(id);
    if (!request) throw new NotFoundError('Request');
    
    const availability = await this.repo.findAvailabilityById(request.mentorAvailabilityId);
    if (availability?.mentorId !== mentorId) throw new ForbiddenError('Not your availability');

    const start = new Date(request.startDatetime);
    const end = new Date(start.getTime() + request.durationMinute * 60_000);
    const overlapping = await this.repo.findOverlappingRequests(request.mentorAvailabilityId, start, end);
    const hasAccepted = overlapping.some(r => r.status === 'accepted' && r.id !== id);
    if (hasAccepted) {
      throw new ConflictError('This time slot has already been booked by another team.');
    }

    const updated = await this.repo.updateRequestStatus(id, 'accepted', meetingLink);
    if (!updated) throw new NotFoundError('Request');

    void scheduleReminder({
      slotId:      updated.id,
      teamId:      updated.teamId ?? '',
      mentorId:    availability?.mentorId ?? '',
      startTime:   updated.startDatetime.toISOString(),
      meetingLink: updated.meetingLink ?? null,
    });

    return updated;
  }

  async rejectRequest(id: string, mentorId: string) {
    const request = await this.repo.findRequestById(id);
    if (!request) throw new NotFoundError('Request');
    const availability = await this.repo.findAvailabilityById(request.mentorAvailabilityId);
    if (availability?.mentorId !== mentorId) throw new ForbiddenError('Not your availability');
    
    const updated = await this.repo.updateRequestStatus(id, 'rejected');
    if (!updated) throw new NotFoundError('Request');
    return updated;
  }

  async cancelRequest(id: string, userId: string) {
    const request = await this.repo.findRequestById(id);
    if (!request) throw new NotFoundError('Request');
    
    const updated = await this.repo.updateRequestStatus(id, 'cancelled');
    if (!updated) throw new NotFoundError('Request');

    void cancelReminder(id);

    return updated;
  }

  async completeRequest(id: string, mentorId: string) {
    const request = await this.repo.findRequestById(id);
    if (!request) throw new NotFoundError('Request');
    const availability = await this.repo.findAvailabilityById(request.mentorAvailabilityId);
    if (availability?.mentorId !== mentorId) throw new ForbiddenError('Not your availability');
    
    const updated = await this.repo.updateRequestStatus(id, 'completed');
    if (!updated) throw new Error('Request not found');
    return updated;
  }

  async blockSlot(availabilityId: string, startDatetime: string, durationMinute: number, mentorId: string) {
    const availability = await this.repo.findAvailabilityById(availabilityId);
    if (!availability) throw new NotFoundError('Availability not found');
    if (availability.mentorId !== mentorId) throw new ForbiddenError('Not your availability');

    const start = new Date(startDatetime);
    const end = new Date(start.getTime() + durationMinute * 60000);
    const overlapping = await this.repo.findOverlappingRequests(availabilityId, start, end);
    if (overlapping.length > 0) {
      throw new ConflictError('Slot is already booked or requested');
    }

    return this.repo.createRequest({
      mentorAvailabilityId: availabilityId,
      startDatetime,
      durationMinute,
      teamId: undefined, // undefined maps to null in repo
    });
  }

  async unblockSlot(requestId: string, mentorId: string) {
    const request = await this.repo.findRequestById(requestId);
    if (!request) throw new NotFoundError('Slot block not found');
    if (request.status !== 'blocked') throw new ConflictError('Request is not a blocked slot');
    
    const availability = await this.repo.findAvailabilityById(request.mentorAvailabilityId);
    if (availability?.mentorId !== mentorId) throw new ForbiddenError('Not your availability');

    await this.repo.deleteRequest(requestId);
    return { success: true };
  }
}

