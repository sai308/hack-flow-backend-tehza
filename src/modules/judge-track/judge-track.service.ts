import type { JudgeTrackRepository } from './judge-track.repository';
import type { AuditLogRepository } from '../audit-log/audit-log.repository';
import { ConflictError, ForbiddenError, NotFoundError } from '../../common/errors/http-errors';
import type { AssignJudgeDto, UpdateJudgeTrackDto } from './judge-track.schema';
import { getDatabaseConnection } from '../../config/database';
import { userRoles, roles, tracks } from '../../drizzle/schema';
import { eq, and } from 'drizzle-orm';

export class JudgeTrackService {
  constructor(
    private readonly repo: JudgeTrackRepository,
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

  async assign(hackathonId: string, dto: AssignJudgeDto, actorId: string) {
    const db = getDatabaseConnection();

    // 1. Verify user has judge role (globally or hackathon-scoped)
    const [judgeRole] = await db
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.name, 'judge'))
      .limit(1);

    if (!judgeRole) throw new NotFoundError('Judge role not configured');

    const [assignment] = await db
      .select({ id: userRoles.id })
      .from(userRoles)
      .where(
        and(
          eq(userRoles.userId, dto.userId),
          eq(userRoles.roleId, judgeRole.id),
        ),
      )
      .limit(1);

    if (!assignment) {
      throw new ForbiddenError('User does not have the judge role');
    }

    // 2. Verify track belongs to this hackathon
    const [track] = await db
      .select({ id: tracks.id })
      .from(tracks)
      .where(and(eq(tracks.id, dto.trackId), eq(tracks.hackathonId, hackathonId)))
      .limit(1);

    if (!track) {
      throw new NotFoundError('Track not found in this hackathon');
    }

    // 3. Insert — catch unique violation (pg error code 23505)
    try {
      const record = await this.repo.assign({ ...dto, hackathonId, assignedBy: actorId });
      this.auditLog
        ?.log(actorId, 'assign_judge_track', 'judge_track', record.id)
        .catch(() => undefined);
      return record;
    } catch (err: unknown) {
      // Drizzle propagates pg errors; check the code property
      if (
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code: string }).code === '23505'
      ) {
        throw new ConflictError('Judge already assigned to this track');
      }
      throw err;
    }
  }

  async update(id: string, dto: UpdateJudgeTrackDto) {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundError('Judge track assignment not found');
    return this.repo.update(id, dto);
  }

  async unassign(id: string, actorId: string) {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundError('Judge track assignment not found');
    await this.repo.unassign(id);
    this.auditLog
      ?.log(actorId, 'unassign_judge_track', 'judge_track', id)
      .catch(() => undefined);
  }
}
