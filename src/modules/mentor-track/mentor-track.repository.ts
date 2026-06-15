import type { Database } from '../../config/database';
import { mentorTrack, users, tracks } from '../../drizzle/schema';
import { eq, and } from 'drizzle-orm';
import type { AssignMentorDto } from './mentor-track.schema';

export class MentorTrackRepository {
  constructor(private readonly db: Database) {}

  /** All mentor→track assignments for a hackathon, enriched with user + track info. */
  async findByHackathon(hackathonId: string) {
    return this.db
      .select({
        id: mentorTrack.id,
        userId: mentorTrack.userId,
        trackId: mentorTrack.trackId,
        assignedAt: mentorTrack.assignedAt,
        assignedBy: mentorTrack.assignedBy,
        user: {
          id: users.id,
          fullName: users.fullName,
          email: users.email,
        },
        track: {
          id: tracks.id,
          name: tracks.name,
        },
      })
      .from(mentorTrack)
      .innerJoin(users, eq(mentorTrack.userId, users.id))
      .innerJoin(tracks, eq(mentorTrack.trackId, tracks.id))
      .where(eq(mentorTrack.hackathonId, hackathonId));
  }

  /** All mentors assigned to a specific track, enriched with user info. */
  async findByTrack(trackId: string) {
    return this.db
      .select({
        id: mentorTrack.id,
        assignedAt: mentorTrack.assignedAt,
        mentor: {
          id: users.id,
          fullName: users.fullName,
          email: users.email,
        },
      })
      .from(mentorTrack)
      .innerJoin(users, eq(mentorTrack.userId, users.id))
      .where(eq(mentorTrack.trackId, trackId));
  }

  /** Tracks assigned to a mentor in a hackathon (for "my tracks" view). */
  async findByUser(userId: string, hackathonId: string) {
    return this.db
      .select({
        id: mentorTrack.id,
        assignedAt: mentorTrack.assignedAt,
        track: {
          id: tracks.id,
          name: tracks.name,
        },
      })
      .from(mentorTrack)
      .innerJoin(tracks, eq(mentorTrack.trackId, tracks.id))
      .where(and(eq(mentorTrack.userId, userId), eq(mentorTrack.hackathonId, hackathonId)));
  }

  /** Single assignment record by ID. */
  async findById(id: string) {
    const [row] = await this.db
      .select()
      .from(mentorTrack)
      .where(eq(mentorTrack.id, id))
      .limit(1);
    return row ?? null;
  }

  /**
   * Check if a mentor is assigned to a specific track.
   */
  async findByUserAndTrack(userId: string, trackId: string) {
    const [row] = await this.db
      .select()
      .from(mentorTrack)
      .where(and(eq(mentorTrack.userId, userId), eq(mentorTrack.trackId, trackId)))
      .limit(1);
    return row ?? null;
  }

  /**
   * Insert a new mentor→track assignment.
   */
  async assign(data: AssignMentorDto & { hackathonId: string; assignedBy: string }) {
    const [row] = await this.db
      .insert(mentorTrack)
      .values({
        userId: data.userId,
        trackId: data.trackId,
        hackathonId: data.hackathonId,
        assignedBy: data.assignedBy,
      })
      .returning();
    return row;
  }

  /** Remove an assignment. */
  async unassign(id: string) {
    await this.db.delete(mentorTrack).where(eq(mentorTrack.id, id));
  }
}
