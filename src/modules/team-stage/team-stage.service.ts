import { TeamStageRepository } from './team-stage.repository';
import { NotFoundError, ForbiddenError } from '../../common/errors/http-errors';
import type { AuditLogRepository } from '../audit-log/audit-log.repository';

export class TeamStageService {
  constructor(
    private readonly repo: TeamStageRepository,
    private readonly auditLog: AuditLogRepository,
  ) { }

  /** Return the current stage for a team (or null if not placed yet). */
  async getTeamStage(teamId: string) {
    const team = await this.repo.findTeam(teamId);
    if (!team) throw new NotFoundError('Team not found');
    return this.repo.findByTeam(teamId);
  }

  /**
   * Move a team to a specific stage.
   * Rules:
   *  1. Team must exist.
   *  2. Team must be APPROVED (latest approval record).
   *  3. Stage must exist.
   *  4. Stage must belong to the same hackathon as the team.
   */
  async moveTeamToStage(teamId: string, stageId: string, actorId: string) {
    // 1. Team exists?
    const team = await this.repo.findTeam(teamId);
    if (!team) throw new NotFoundError('Team not found');
    // 2. Team approved?
    const approval = await this.repo.findTeamApproval(teamId);
    if (!approval || approval.status !== 'APPROVED') {
      throw new ForbiddenError('Only teams with APPROVED status can be moved between stages');
    }
    // 3. Stage exists?
    const stage = await this.repo.findStage(stageId);
    if (!stage) throw new NotFoundError('Stage not found');
    // 4. Same hackathon?
    if (stage.hackathonId !== team.hackathonId) {
      throw new ForbiddenError('Stage does not belong to the team\'s hackathon');
    }
    const record = await this.repo.upsert(teamId, stageId);
    // Audit log — fire-and-forget
    this.auditLog
      .log(actorId, 'move_team_stage', 'team', teamId)
      .catch(() => undefined);

    return record;
  }



  /** List all teams currently placed in a given stage. */
  async getTeamsInStage(stageId: string) {
    const stage = await this.repo.findStage(stageId);
    if (!stage) throw new NotFoundError('Stage not found');
    return this.repo.findByStage(stageId);
  }
}
