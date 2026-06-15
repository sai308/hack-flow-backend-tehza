import type { Database } from '../../config/database';
import { userActionLogs } from '../../drizzle/schema';
import { desc, eq } from 'drizzle-orm';

export type AuditAction =
  | 'login'
  | 'register'
  | 'refresh_token'
  | 'create_team'
  | 'update_team'
  | 'delete_team'
  | 'join_team'
  | 'submit_project'
  | 'submit_score'
  | 'book_mentor_slot'
  | 'move_team_stage'
  | 'assign_judge_track'
  | 'unassign_judge_track'
  | 'hackathon_status_override'
  | 'leave_team'
  | 'transfer_captain'
  | 'assign_mentor'
  | 'unassign_mentor';

export type AuditEntity =
  | 'user'
  | 'team'
  | 'project'
  | 'score'
  | 'mentor_slot'
  | 'judge_track'
  | 'mentor_track'
  | 'hackathon';

export class AuditLogRepository {
  constructor(private readonly db: Database) {}

  async log(
    userId: string,
    action: AuditAction,
    entity: AuditEntity,
    entityId?: string,
  ): Promise<void> {
    await this.db
      .insert(userActionLogs)
      .values({ userId, action, entity, entityId })
      .execute();
  }

  async findByUser(userId: string, limit = 50) {
    return this.db
      .select()
      .from(userActionLogs)
      .where(eq(userActionLogs.userId, userId))
      .orderBy(desc(userActionLogs.createdAt))
      .limit(limit);
  }
}
