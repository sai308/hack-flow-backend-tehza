import type { MentorTrackRepository } from './mentor-track.repository';
import { ConflictError, NotFoundError } from '../../common/errors/http-errors';
import type { AssignMentorDto } from './mentor-track.schema';
import type { AuditLogRepository } from '../audit-log/audit-log.repository';

export class MentorTrackService {
  constructor(
    private readonly repo: MentorTrackRepository,
    private readonly auditLog?: AuditLogRepository,
  ) {}

  async listByHackathon(hackathonId: string) {
    return this.repo.findByHackathon(hackathonId);
  }

  async listByTrack(trackId: string) {
    return this.repo.findByTrack(trackId);
  }

  async getMyTracks(userId: string, hackathonId: string) {
    return this.repo.findByUser(userId, hackathonId);
  }

  async assign(hackathonId: string, assignedBy: string, dto: AssignMentorDto) {
    // Check if already assigned
    const existing = await this.repo.findByUserAndTrack(dto.userId, dto.trackId);
    if (existing) {
      throw new ConflictError('Mentor is already assigned to this track');
    }

    const assignment = await this.repo.assign({ ...dto, hackathonId, assignedBy });
    this.auditLog?.log(assignedBy, 'assign_mentor', 'mentor_track', assignment.id).catch(() => undefined);
    return assignment;
  }

  async unassign(id: string, requesterId: string) {
    const assignment = await this.repo.findById(id);
    if (!assignment) throw new NotFoundError('Mentor Assignment');

    await this.repo.unassign(id);
    this.auditLog?.log(requesterId, 'unassign_mentor', 'mentor_track', id).catch(() => undefined);
  }
}
