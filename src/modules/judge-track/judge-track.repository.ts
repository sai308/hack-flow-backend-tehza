import type { Database } from '../../config/database';
import { judgeTrack, users, tracks } from '../../drizzle/schema';
import { eq, and } from 'drizzle-orm';
import type { AssignJudgeDto, UpdateJudgeTrackDto } from './judge-track.schema';

export class JudgeTrackRepository {
  constructor(private readonly db: Database) {}

  /** All judge→track assignments for a hackathon, enriched with user + track info. */
  async findByHackathon(hackathonId: string) {
    return this.db
      .select({
        id: judgeTrack.id,
        userId: judgeTrack.userId,
        trackId: judgeTrack.trackId,
        isHeadJudge: judgeTrack.isHeadJudge,
        assignedAt: judgeTrack.assignedAt,
        assignedBy: judgeTrack.assignedBy,
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
      .from(judgeTrack)
      .innerJoin(users, eq(judgeTrack.userId, users.id))
      .innerJoin(tracks, eq(judgeTrack.trackId, tracks.id))
      .where(eq(judgeTrack.hackathonId, hackathonId));
  }

  /** All judges assigned to a specific track, enriched with user info. */
  async findByTrack(trackId: string) {
    return this.db
      .select({
        id: judgeTrack.id,
        isHeadJudge: judgeTrack.isHeadJudge,
        assignedAt: judgeTrack.assignedAt,
        judge: {
          id: users.id,
          fullName: users.fullName,
          email: users.email,
        },
      })
      .from(judgeTrack)
      .innerJoin(users, eq(judgeTrack.userId, users.id))
      .where(eq(judgeTrack.trackId, trackId));
  }

  /** Tracks assigned to a judge in a hackathon (for "my tracks" view). */
  async findByUser(userId: string, hackathonId: string) {
    return this.db
      .select({
        id: judgeTrack.id,
        isHeadJudge: judgeTrack.isHeadJudge,
        assignedAt: judgeTrack.assignedAt,
        track: {
          id: tracks.id,
          name: tracks.name,
        },
      })
      .from(judgeTrack)
      .innerJoin(tracks, eq(judgeTrack.trackId, tracks.id))
      .where(and(eq(judgeTrack.userId, userId), eq(judgeTrack.hackathonId, hackathonId)));
  }

  /** Single assignment record by ID. */
  async findById(id: string) {
    const [row] = await this.db
      .select()
      .from(judgeTrack)
      .where(eq(judgeTrack.id, id))
      .limit(1);
    return row ?? null;
  }

  /**
   * Check if a judge is assigned to a specific track (used by scoring guard).
   */
  async findByUserAndTrack(userId: string, trackId: string) {
    const [row] = await this.db
      .select()
      .from(judgeTrack)
      .where(and(eq(judgeTrack.userId, userId), eq(judgeTrack.trackId, trackId)))
      .limit(1);
    return row ?? null;
  }

  /**
   * Insert a new judge→track assignment.
   * Does NOT handle the unique constraint — callers catch pg error code 23505.
   */
  async assign(data: AssignJudgeDto & { hackathonId: string; assignedBy: string }) {
    const [row] = await this.db
      .insert(judgeTrack)
      .values({
        userId: data.userId,
        trackId: data.trackId,
        hackathonId: data.hackathonId,
        isHeadJudge: data.isHeadJudge,
        assignedBy: data.assignedBy,
      })
      .returning();
    return row;
  }

  /** Toggle isHeadJudge on an existing assignment. */
  async update(id: string, dto: UpdateJudgeTrackDto) {
    const [row] = await this.db
      .update(judgeTrack)
      .set({ isHeadJudge: dto.isHeadJudge })
      .where(eq(judgeTrack.id, id))
      .returning();
    return row ?? null;
  }

  /** Remove an assignment. */
  async unassign(id: string) {
    await this.db.delete(judgeTrack).where(eq(judgeTrack.id, id));
  }
}
