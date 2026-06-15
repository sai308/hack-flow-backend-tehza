import type { FastifyInstance } from 'fastify';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UsersRepository } from './users.repository';
import { AuditLogRepository } from '../audit-log/audit-log.repository';
import { getDatabaseConnection } from '../../config/database';
import { authenticate } from '../../common/middleware/auth.middleware';

const Sec = [{ bearerAuth: [] }];

export async function usersRoutes(app: FastifyInstance): Promise<void> {
  const db = getDatabaseConnection();
  const auditRepo = new AuditLogRepository(db);
  const repository = new UsersRepository(db);
  const service = new UsersService(repository);
  const controller = new UsersController(service);

  // ── Public routes ───────────────────────────────────────────────────────
  app.get('/', {
    schema: {
      tags: ['Users'],
      summary: 'List users (paginated)',
      description: 'Excludes soft-deleted accounts.',
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1, default: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          search: { type: 'string' },
          role: { type: 'string' },
          lookingForTeam: { type: 'boolean' },
        },
      },
    },
  }, (req, reply) => controller.list(req, reply));

  app.get('/looking-for-team', {
    schema: {
      tags: ['Users'],
      summary: 'Matchmaking — find users looking for a team',
      description: 'Filter by ?hackathon_id=UUID and/or ?skills=js,python (comma-separated).',
      querystring: {
        type: 'object',
        properties: {
          hackathon_id: { type: 'string', format: 'uuid' },
          skills: { type: 'string', description: 'Comma-separated skill names' },
          page: { type: 'integer', minimum: 1, default: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        },
      },
    },
  }, (req, reply) => controller.lookingForTeam(req, reply));

  // ── Protected routes ────────────────────────────────────────────────────
  app.register(async (auth) => {
    auth.addHook('onRequest', authenticate);

    auth.get('/me', {
      schema: { tags: ['Users'], summary: 'Get current user profile', security: Sec },
    }, (req, reply) => controller.getMe(req, reply));

    auth.patch('/me', {
      schema: {
        tags: ['Users'],
        summary: 'Update current user profile',
        security: Sec,
        body: {
          type: 'object',
          properties: {
            fullName: { type: 'string', minLength: 2, maxLength: 100 },
            username: { type: 'string', minLength: 3, maxLength: 30 },
            description: { type: ['string', 'null'], maxLength: 1000 },
            isLookingForTeam: { type: 'boolean' },
            skills: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    }, (req, reply) => controller.updateMe(req, reply));

    auth.get('/:id', {
      schema: {
        tags: ['Users'],
        summary: 'Get user profile by ID',
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
      },
    }, (req, reply) => controller.getById(req, reply));

    auth.put('/:id/role', {
      schema: {
        tags: ['Users'],
        summary: 'Change user global role',
        security: Sec,
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
        body: {
          type: 'object',
          required: ['role'],
          properties: { role: { type: 'string', enum: ['admin', 'judge', 'mentor', 'participant', 'organizer'] } },
        },
      },
    }, (req, reply) => controller.updateRole(req, reply));

    auth.get('/me/socials', {
      schema: { tags: ['Users'], summary: 'List current user social links', security: Sec },
    }, (req, reply) => controller.getSocials(req, reply));

    auth.post('/me/socials', {
      schema: {
        tags: ['Users'],
        summary: 'Add a social link',
        security: Sec,
        body: {
          type: 'object',
          required: ['typeSocial', 'url'],
          properties: {
            typeSocial: { type: 'string', enum: ['discord', 'telegram', 'viber', 'github'] },
            url: { type: 'string', format: 'uri' },
          },
        },
      },
    }, (req, reply) => controller.addSocial(req, reply));

    auth.delete('/me/socials/:id', {
      schema: {
        tags: ['Users'],
        summary: 'Remove a social link',
        security: Sec,
        params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
      },
    }, (req, reply) => controller.deleteSocial(req, reply));

    // ── Activity log for a user (admin use) ────────────────────────────────
    auth.get('/:id/activity', {
      schema: {
        tags: ['Users'],
        summary: 'Get activity log for a user',
        security: Sec,
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          },
        },
      },
    }, async (req, reply) => {
      const { id } = req.params as { id: string };
      const { limit = 20 } = req.query as { limit?: number };
      const logs = await auditRepo.findByUser(id, limit);
      return reply.send({ success: true, data: logs });
    });
  });
}
