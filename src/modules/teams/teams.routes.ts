import type { FastifyInstance } from 'fastify';
import { TeamsController } from './teams.controller';
import { TeamsService } from './teams.service';
import { TeamsRepository } from './teams.repository';
import { AuditLogRepository } from '../audit-log/audit-log.repository';
import { getDatabaseConnection } from '../../config/database';
import { authenticate, authorize, optionalAuthenticate } from '../../common/middleware/auth.middleware';
import type { JwtPayload } from '../../common/middleware/auth.middleware';
import { z } from 'zod';

const TeamListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  hackathon_id: z.string().uuid().optional(),
  track_id: z.string().uuid().optional(),
  search: z.string().optional(),
  status: z.string().optional(),
});

const Sec = [{ bearerAuth: [] }];

export async function teamsRoutes(app: FastifyInstance): Promise<void> {
  const db = getDatabaseConnection();
  const repository = new TeamsRepository(db);
  const auditLog = new AuditLogRepository(db);
  const service = new TeamsService(repository, auditLog);
  const ctrl = new TeamsController(service);

  // ── Public / read-only ────────────────────────────────────────

  // GET /teams/my-teams — all teams the user is a member of (across all hackathons)
  app.get('/my-teams', {
    onRequest: [authenticate],
    schema: {
      tags: ['Teams'],
      summary: "Get all teams the current user is a member of",
      security: Sec,
    },
  }, async (req, reply) => {
    const { sub } = req.user as { sub: string };
    const teams = await service.getMyTeams(sub);
    return reply.send({ success: true, data: teams });
  });

  // GET /teams/my-team?hackathonId=<uuid> — returns the current user's team
  // (with approvals!) for a given hackathon. Must come BEFORE /:id routes.
  app.get('/my-team', {
    onRequest: [authenticate],
    schema: {
      tags: ['Teams'],
      summary: "Get current user's team for a hackathon (includes approvals)",
      security: Sec,
      querystring: {
        type: 'object',
        required: ['hackathonId'],
        properties: { hackathonId: { type: 'string', format: 'uuid' } },
      },
    },
  }, async (req, reply) => {
    const { sub } = req.user as { sub: string };
    const { hackathonId } = req.query as { hackathonId: string };
    const team = await service.getMyTeamForHackathon(hackathonId, sub);
    return reply.send({ success: true, data: team ?? null });
  });

  app.get('/', {
    onRequest: [optionalAuthenticate],
    schema: {
      tags: ['Teams'],
      summary: 'List teams (paginated, filterable)',
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1, default: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          hackathon_id: { type: 'string', format: 'uuid' },
          track_id: { type: 'string', format: 'uuid' },
          status: { type: 'string' },
          search: { type: 'string' },
        },
      },
    },
  }, async (req, reply) => {
    const q = TeamListQuerySchema.parse(req.query);
    const user = req.user as JwtPayload | undefined;
    const isOrganizer = user?.roles?.includes('organizer') ?? false;
    const isAdmin = user?.roles?.includes('admin') ?? false;
    // Organizer sees only teams from their own hackathons
    const createdByUserId = (!isAdmin && isOrganizer && user?.sub) ? user.sub : undefined;
    const result = await service.list(q.page, q.limit, q.hackathon_id, q.track_id, q.status, q.search, createdByUserId);
    return reply.send({ success: true, ...result });
  });

  app.get('/:id', {
    schema: {
      tags: ['Teams'],
      summary: 'Get team by ID',
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
    },
  }, (req, reply) => ctrl.getById(req, reply));

  app.get('/:id/members', {
    schema: {
      tags: ['Teams'],
      summary: 'List team members',
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
    },
  }, (req, reply) => ctrl.getMembers(req, reply));

  // ── Authenticated ─────────────────────────────────────────────
  app.post('/', {
    onRequest: [authenticate],
    schema: {
      tags: ['Teams'],
      summary: 'Create a new team (requester becomes captain)',
      security: Sec,
      body: {
        type: 'object',
        required: ['name', 'hackathonId'],
        properties: {
          name: { type: 'string', minLength: 2, maxLength: 100 },
          description: { type: 'string', maxLength: 500 },
          logo: { type: 'string' },
          hackathonId: { type: 'string', format: 'uuid' },
          trackId: { type: 'string', format: 'uuid' },
        },
      },
    },
  }, (req, reply) => ctrl.create(req, reply));

  app.patch('/:id', {
    onRequest: [authenticate],
    schema: {
      tags: ['Teams'],
      summary: 'Update team (captain only)',
      security: Sec,
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 2, maxLength: 100 },
          description: { type: 'string' },
          logo: { type: 'string' },
          trackId: { type: 'string', format: 'uuid' },
        },
      },
    },
  }, (req, reply) => ctrl.update(req, reply));

  app.delete('/:id', {
    onRequest: [authenticate],
    schema: {
      tags: ['Teams'],
      summary: 'Delete team (captain only)',
      security: Sec,
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
    },
  }, (req, reply) => ctrl.remove(req, reply));

  app.delete('/:id/members/:userId', {
    onRequest: [authenticate],
    schema: {
      tags: ['Teams'],
      summary: 'Remove a member from the team (captain only)',
      security: Sec,
      params: {
        type: 'object',
        required: ['id', 'userId'],
        properties: { id: { type: 'string', format: 'uuid' }, userId: { type: 'string', format: 'uuid' } },
      },
    },
  }, (req, reply) => ctrl.removeMember(req, reply));

  app.delete('/:id/leave', {
    onRequest: [authenticate],
    schema: {
      tags: ['Teams'],
      summary: 'Leave a team (non-captain members only)',
      security: Sec,
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
    },
  }, (req, reply) => ctrl.leaveTeam(req, reply));

  app.get('/:id/invites/active', {
    onRequest: [authenticate],
    schema: {
      tags: ['Teams'],
      summary: 'Get active invite link for a team (captain only)',
      security: Sec,
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
    },
  }, (req, reply) => ctrl.getActiveInvite(req, reply));

  app.post('/:id/invites', {
    onRequest: [authenticate],
    schema: {
      tags: ['Teams'],
      summary: 'Generate a new invite link (captain only — invalidates previous)',
      security: Sec,
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
      body: {
        type: 'object',
        properties: {
          maxUses: { type: 'integer', minimum: 1, default: 10 },
          expiresInHours: { type: 'integer', minimum: 1, default: 24 },
        },
      },
    },
  }, (req, reply) => ctrl.createInvite(req, reply));

  app.patch('/:id/transfer-captain', {
    onRequest: [authenticate],
    schema: {
      tags: ['Teams'],
      summary: 'Transfer captain role to another member',
      security: Sec,
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
      body: {
        type: 'object',
        required: ['newCaptainId'],
        properties: { newCaptainId: { type: 'string', format: 'uuid' } },
      },
    },
  }, (req, reply) => ctrl.transferCaptain(req, reply));

  // Public: preview team info for an invite token (used by /join/:token page)
  app.get('/invite-info/:token', {
    schema: {
      tags: ['Teams'],
      summary: 'Get team info for an invite token (unauthenticated)',
      params: { type: 'object', required: ['token'], properties: { token: { type: 'string' } } },
    },
  }, async (req, reply) => {
    const { token } = req.params as { token: string };
    const invite = await repository.findInviteByToken(token);
    if (!invite || !invite.active || invite.expiresAt < new Date()) {
      return reply.status(404).send({ success: false, message: 'Запрошення не знайдено або застаріле' });
    }
    const team = await repository.findById(invite.teamId);
    if (!team) return reply.status(404).send({ success: false, message: 'Команда не знайдена' });
    return reply.send({
      success: true,
      data: {
        id: team.id,
        name: team.name,
        hackathon: (team as any).hackathon,
        track: (team as any).track,
        invite: { expiresAt: invite.expiresAt, maxUses: invite.maxUses, usesCount: invite.usesCount },
      },
    });
  });

  app.post('/join', {
    onRequest: [authenticate],
    schema: {
      tags: ['Teams'],
      summary: 'Join a team via invite token',
      security: Sec,
      body: {
        type: 'object',
        required: ['token'],
        properties: { token: { type: 'string' } },
      },
    },
  }, (req, reply) => ctrl.joinViaToken(req, reply));

  app.patch('/:id/approval', {
    onRequest: [authenticate, authorize('admin', 'organizer')],
    schema: {
      tags: ['Teams'],
      summary: 'Update team approval status — admin only',
      security: Sec,
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
      body: {
        type: 'object',
        required: ['status'],
        properties: {
          status: { type: 'string', enum: ['PENDING', 'APPROVED', 'REJECTED', 'DISQUALIFIED'] },
          comment: { type: 'string' },
        },
      },
    },
  }, (req, reply) => ctrl.updateApproval(req, reply));

  // Admin: change team track (without requiring captain role)
  app.patch('/:id/track', {
    onRequest: [authenticate, authorize('admin', 'organizer')],
    schema: {
      tags: ['Teams'],
      summary: 'Change team track — admin only',
      security: Sec,
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
      body: {
        type: 'object',
        required: ['trackId'],
        properties: { trackId: { type: 'string', format: 'uuid' } },
      },
    },
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { trackId } = req.body as { trackId: string };
    const updated = await repository.update(id, { trackId });
    return reply.send({ success: true, data: updated });
  });

  // ── Join Requests ───────────────────────────────────────────

  app.post('/:id/requests', {
    onRequest: [authenticate],
    schema: {
      tags: ['Teams'],
      summary: 'Send a join request to a team',
      security: Sec,
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
      body: {
        type: 'object',
        properties: { message: { type: 'string', maxLength: 300 } },
      },
    },
  }, (req, reply) => ctrl.sendJoinRequest(req, reply));

  app.get('/:id/requests', {
    onRequest: [authenticate],
    schema: {
      tags: ['Teams'],
      summary: 'Get pending join requests (captain only)',
      security: Sec,
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
    },
  }, (req, reply) => ctrl.getJoinRequests(req, reply));

  app.patch('/requests/:requestId', {
    onRequest: [authenticate],
    schema: {
      tags: ['Teams'],
      summary: 'Accept or reject a join request (captain only)',
      security: Sec,
      params: { type: 'object', required: ['requestId'], properties: { requestId: { type: 'string', format: 'uuid' } } },
      body: {
        type: 'object',
        required: ['action'],
        properties: { action: { type: 'string', enum: ['accepted', 'rejected'] } },
      },
    },
  }, (req, reply) => ctrl.respondToJoinRequest(req, reply));
}

