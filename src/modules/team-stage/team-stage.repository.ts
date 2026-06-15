import type { Database } from '../../config/database';
import { teamStage, teamApprovals, stages, teams } from '../../drizzle/schema';
import { eq, and } from 'drizzle-orm';

export class TeamStageRepository {
  constructor(private readonly db: Database) {}

  /** Get the current stage record for a team (null = not in any stage). */
  async findByTeam(teamId: string) {
    const [row] = await this.db
      .select()
      .from(teamStage)
      .where(eq(teamStage.teamId, teamId))
      .limit(1);
    return row ?? null;
  }

  /** List all team-stage records for a given stage. */
  async findByStage(stageId: string) {
    return this.db
      .select({
        id: teamStage.id,
        teamId: teamStage.teamId,
        stageId: teamStage.stageId,
        enteredAt: teamStage.enteredAt,
        createdAt: teamStage.createdAt,
        teamName: teams.name,
        hackathonId: teams.hackathonId,
      })
      .from(teamStage)
      .innerJoin(teams, eq(teamStage.teamId, teams.id))
      .where(eq(teamStage.stageId, stageId));
  }

  /** Upsert: remove any existing stage record for team, then insert the new one. */
  async upsert(teamId: string, stageId: string) {
    // Delete the current stage assignment (if any)
    await this.db.delete(teamStage).where(eq(teamStage.teamId, teamId));
    // Insert the new one
    const [row] = await this.db
      .insert(teamStage)
      .values({ teamId, stageId })
      .returning();
    return row;
  }

  /** Get the latest team approval record. */
  async findTeamApproval(teamId: string) {
    const [row] = await this.db
      .select()
      .from(teamApprovals)
      .where(eq(teamApprovals.teamId, teamId))
      .orderBy(teamApprovals.approvedAt)
      .limit(1);
    return row ?? null;
  }

  /** Verify a stage belongs to a specific hackathon. */
  async findStage(stageId: string) {
    const [row] = await this.db
      .select()
      .from(stages)
      .where(eq(stages.id, stageId))
      .limit(1);
    return row ?? null;
  }

  /** Verify a team exists. */
  async findTeam(teamId: string) {
    const [row] = await this.db
      .select()
      .from(teams)
      .where(and(eq(teams.id, teamId)))
      .limit(1);
    return row ?? null;
  }
}
