import type { FastifyInstance } from 'fastify';
import { TeamStageService } from './team-stage.service';
import { TeamStageRepository } from './team-stage.repository';
import { AuditLogRepository } from '../audit-log/audit-log.repository';
import { getDatabaseConnection } from '../../config/database';
import { authenticate, authorize } from '../../common/middleware/auth.middleware';
import type { JwtPayload } from '../../common/middleware/auth.middleware';
import { z } from 'zod';

const MoveStageBodySchema = z.object({ stageId: z.string().uuid() });

export async function teamStageRoutes(app: FastifyInstance): Promise<void> {
  const db = getDatabaseConnection();
  const repo = new TeamStageRepository(db);
  const auditLog = new AuditLogRepository(db);
  const service = new TeamStageService(repo, auditLog);

  // ── GET /teams/:teamId/stage ───────────────────────────────────
  // Public — anyone can see what stage a team is in.
  app.get('/teams/:teamId/stage', {
    schema: {
      tags: ['Team Stage'],
      summary: 'Get the current stage of a team',
      params: {
        type: 'object',
        required: ['teamId'],
        properties: { teamId: { type: 'string', format: 'uuid' } },
      },
    },
  }, async (req, reply) => {
    const { teamId } = req.params as { teamId: string };
    const data = await service.getTeamStage(teamId);
    return reply.send({ success: true, data });
  });

  // ── POST /teams/:teamId/stage ─────────────────────────────────
  // Admin or Judge only — moves team to a new stage.
  app.post('/teams/:teamId/stage', {
    onRequest: [authenticate, authorize('admin', 'judge')],
    schema: {
      tags: ['Team Stage'],
      summary: 'Move a team to a stage (admin/judge)',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['teamId'],
        properties: { teamId: { type: 'string', format: 'uuid' } },
      },
      body: {
        type: 'object',
        required: ['stageId'],
        properties: { stageId: { type: 'string', format: 'uuid' } },
      },
    },
  }, async (req, reply) => {
    const { teamId } = req.params as { teamId: string };
    const { stageId } = MoveStageBodySchema.parse(req.body);
    const actor = (req.user as JwtPayload).sub;
    const data = await service.moveTeamToStage(teamId, stageId, actor);
    return reply.status(201).send({ success: true, data });
  });

  // ── GET /hackathons/:hackathonId/stages/:stageId/teams ─────────
  // Admin only — list all teams currently in a stage.
  app.get('/hackathons/:hackathonId/stages/:stageId/teams', {
    onRequest: [authenticate, authorize('admin')],
    schema: {
      tags: ['Team Stage'],
      summary: 'List teams currently in a stage (admin)',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['hackathonId', 'stageId'],
        properties: {
          hackathonId: { type: 'string', format: 'uuid' },
          stageId: { type: 'string', format: 'uuid' },
        },
      },
    },
  }, async (req, reply) => {
    const { stageId } = req.params as { hackathonId: string; stageId: string };
    const data = await service.getTeamsInStage(stageId);
    return reply.send({ success: true, data });
  });
}
