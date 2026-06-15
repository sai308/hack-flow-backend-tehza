import type { Database } from '../../config/database';
import { mentorAvailabilities, mentorRequests } from '../../drizzle/schema';
import { eq, and, gte, lte, lt, gt, ne, inArray, desc } from 'drizzle-orm';
import type { CreateAvailabilityDto, CreateMentorshipRequestDto } from './mentorship.schema';

export class MentorshipRepository {
  constructor(private readonly db: Database) {}

  /** Find all availabilities for a specific mentor, with optional hackathonId filter. */
  async findAvailabilitiesByMentor(mentorId: string, hackathonId?: string) {
    if (hackathonId) {
      return this.db.query.mentorAvailabilities.findMany({
        where: and(
          eq(mentorAvailabilities.mentorId, mentorId),
          eq(mentorAvailabilities.hackathonId, hackathonId),
        ),
        with: {
          slots: { with: { team: { with: { hackathon: true } } } },
          track: true,
        },
      });
    }
    return this.db.query.mentorAvailabilities.findMany({
      where: eq(mentorAvailabilities.mentorId, mentorId),
      with: {
        slots: { with: { team: { with: { hackathon: true } } } },
        track: true,
      },
    });
  }

  /** Find all availabilities across all mentors, with optional hackathonId filter. */
  async findAllAvailabilities(hackathonId?: string) {
    return this.db.query.mentorAvailabilities.findMany({
      where: hackathonId ? eq(mentorAvailabilities.hackathonId, hackathonId) : undefined,
      with: {
        mentor: true,
        track: true,
        slots: {
          with: { team: true }
        }
      }
    });
  }

  async findAvailabilityById(id: string) {
    const [row] = await this.db
      .select()
      .from(mentorAvailabilities)
      .where(eq(mentorAvailabilities.id, id))
      .limit(1);
    return row ?? null;
  }

  async findOverlappingAvailabilities(mentorId: string, start: Date, end: Date) {
    return this.db
      .select()
      .from(mentorAvailabilities)
      .where(
        and(
          eq(mentorAvailabilities.mentorId, mentorId),
          lt(mentorAvailabilities.startDatetime, end),
          gt(mentorAvailabilities.endDatetime, start),
        ),
      );
  }

  async createAvailability(mentorId: string, data: CreateAvailabilityDto) {
    const [row] = await this.db
      .insert(mentorAvailabilities)
      .values({
        mentorId,
        hackathonId: data.hackathonId ?? null,
        trackId: data.trackId,
        startDatetime: new Date(data.startDatetime),
        endDatetime: new Date(data.endDatetime),
        slotDuration: data.slotDuration,
      })
      .returning();
    return row;
  }

  async deleteAvailability(id: string) {
    await this.db.delete(mentorAvailabilities).where(eq(mentorAvailabilities.id, id));
  }

  async findActiveRequestsByAvailabilityWithTeam(availabilityId: string) {
    return this.db.query.mentorRequests.findMany({
      where: and(
        eq(mentorRequests.mentorAvailabilityId, availabilityId),
        inArray(mentorRequests.status, ['pending', 'accepted']),
      ),
      with: { team: true },
    });
  }

  // ── Requests ─────────────────────────────────────────────
  async findRequestsByAvailability(mentorAvailabilityId: string) {
    return this.db.query.mentorRequests.findMany({
      where: eq(mentorRequests.mentorAvailabilityId, mentorAvailabilityId),
      with: { team: true },
    });
  }

  /** Find all requests made by a team (for participant's booking view). */
  async findRequestsByTeam(teamId: string) {
    return this.db.query.mentorRequests.findMany({
      where: eq(mentorRequests.teamId, teamId),
      with: {
        availability: {
          with: { mentor: true, track: true },
        },
      },
      orderBy: [desc(mentorRequests.createdAt)],
    });
  }

  /** Admin: get ALL mentorship requests across all hackathons with full relations */
  async findAllRequests() {
    return this.db.query.mentorRequests.findMany({
      with: {
        availability: {
          with: { mentor: true, track: true, hackathon: true },
        },
        team: true,
      },
      orderBy: [desc(mentorRequests.createdAt)],
    });
  }

  async findRequestById(id: string) {
    const [row] = await this.db
      .select()
      .from(mentorRequests)
      .where(eq(mentorRequests.id, id))
      .limit(1);
    return row ?? null;
  }

  async findOverlappingRequests(mentorAvailabilityId: string, start: Date, end: Date) {
    // Only consider pending or accepted requests as overlapping
    return this.db
      .select()
      .from(mentorRequests)
      .where(
        and(
          eq(mentorRequests.mentorAvailabilityId, mentorAvailabilityId),
          lt(mentorRequests.startDatetime, end),
          gt(mentorRequests.startDatetime, start),
          ne(mentorRequests.status, 'rejected'),
          ne(mentorRequests.status, 'cancelled')
        ),
      );
  }

  async createRequest(data: CreateMentorshipRequestDto) {
    const [row] = await this.db
      .insert(mentorRequests)
      .values({
        mentorAvailabilityId: data.mentorAvailabilityId,
        teamId: data.teamId ?? null,
        startDatetime: new Date(data.startDatetime),
        durationMinute: data.durationMinute,
        message: data.message,
        status: data.teamId ? 'pending' : 'blocked',
      })
      .returning();
    return row;
  }

  async updateRequestStatus(id: string, status: 'pending' | 'accepted' | 'rejected' | 'completed' | 'cancelled' | 'blocked', meetingLink?: string) {
    const updateData: any = { status, updatedAt: new Date() };
    if (meetingLink !== undefined) {
      updateData.meetingLink = meetingLink;
    }
    const [row] = await this.db
      .update(mentorRequests)
      .set(updateData)
      .where(eq(mentorRequests.id, id))
      .returning();
    return row ?? null;
  }
  
  async deleteRequest(id: string) {
    await this.db.delete(mentorRequests).where(eq(mentorRequests.id, id));
  }
}
