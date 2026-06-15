import type { FastifyInstance } from 'fastify';
import { AwardsController } from './awards.controller';
import { AwardsService } from './awards.service';
import { AwardsRepository } from './awards.repository';
import { getDatabaseConnection } from '../../config/database';
import { authenticate, authorize } from '../../common/middleware/auth.middleware';

/**
 * Awards routes — registered under the API_PREFIX (/api/v1) so we can
 * span two resource roots:  /hackathons/:hackathonId/awards  and
 *                           /teams/:teamId/awards/:awardId
 */
export async function awardsRoutes(app: FastifyInstance): Promise<void> {
  const db = getDatabaseConnection();
  const repo = new AwardsRepository(db);
  const service = new AwardsService(repo);
  const ctrl = new AwardsController(service);

  // ── /hackathons/:hackathonId/awards ───────────────────────────

  app.get('/hackathons/:hackathonId/awards', {
    schema: {
      tags: ['Awards'],
      summary: 'List all awards for a hackathon (public)',
      params: {
        type: 'object',
        properties: { hackathonId: { type: 'string', format: 'uuid' } },
        required: ['hackathonId'],
      },
    },
  }, (req, reply) => ctrl.list(req, reply));

  app.post('/hackathons/:hackathonId/awards', {
    onRequest: [authenticate, authorize('admin', 'organizer')],
    schema: {
      tags: ['Awards'],
      summary: 'Create an award for a hackathon (admin)',
      params: {
        type: 'object',
        properties: { hackathonId: { type: 'string', format: 'uuid' } },
        required: ['hackathonId'],
      },
      body: {
        type: 'object',
        required: ['name', 'place'],
        properties: {
          name: { type: 'string' },
          place: { type: 'integer', minimum: 1 },
          certificate: { type: 'string' },
          description: { type: 'string' },
        },
      },
    },
  }, (req, reply) => ctrl.create(req, reply));

  app.patch('/hackathons/:hackathonId/awards/:id', {
    onRequest: [authenticate, authorize('admin', 'organizer')],
    schema: {
      tags: ['Awards'],
      summary: 'Update an award (admin)',
      params: {
        type: 'object',
        properties: {
          hackathonId: { type: 'string', format: 'uuid' },
          id: { type: 'string', format: 'uuid' },
        },
        required: ['hackathonId', 'id'],
      },
    },
  }, (req, reply) => ctrl.update(req, reply));

  app.delete('/hackathons/:hackathonId/awards/:id', {
    onRequest: [authenticate, authorize('admin', 'organizer')],
    schema: {
      tags: ['Awards'],
      summary: 'Delete an award (admin)',
      params: {
        type: 'object',
        properties: {
          hackathonId: { type: 'string', format: 'uuid' },
          id: { type: 'string', format: 'uuid' },
        },
        required: ['hackathonId', 'id'],
      },
    },
  }, (req, reply) => ctrl.remove(req, reply));

  // ── /hackathons/:hackathonId/awards/:id/physical-gifts ─────────

  app.post('/hackathons/:hackathonId/awards/:id/physical-gifts', {
    onRequest: [authenticate, authorize('admin', 'organizer')],
    schema: {
      tags: ['Awards'],
      summary: 'Add a physical gift to an award (admin)',
      params: {
        type: 'object',
        properties: {
          hackathonId: { type: 'string', format: 'uuid' },
          id: { type: 'string', format: 'uuid' },
        },
        required: ['hackathonId', 'id'],
      },
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          image: { type: 'string' },
        },
      },
    },
  }, (req, reply) => ctrl.addGift(req, reply));

  app.delete('/hackathons/:hackathonId/awards/:id/physical-gifts/:giftId', {
    onRequest: [authenticate, authorize('admin', 'organizer')],
    schema: {
      tags: ['Awards'],
      summary: 'Remove a physical gift from an award (admin)',
      params: {
        type: 'object',
        properties: {
          hackathonId: { type: 'string', format: 'uuid' },
          id: { type: 'string', format: 'uuid' },
          giftId: { type: 'string', format: 'uuid' },
        },
        required: ['hackathonId', 'id', 'giftId'],
      },
    },
  }, (req, reply) => ctrl.removeGift(req, reply));

  // ── /teams/:teamId/awards/:awardId ────────────────────────────

  app.post('/teams/:teamId/awards/:awardId', {
    onRequest: [authenticate, authorize('admin', 'organizer')],
    schema: {
      tags: ['Awards'],
      summary: 'Assign an award to a team (admin)',
      params: {
        type: 'object',
        properties: {
          teamId: { type: 'string', format: 'uuid' },
          awardId: { type: 'string', format: 'uuid' },
        },
        required: ['teamId', 'awardId'],
      },
    },
  }, (req, reply) => ctrl.assignToTeam(req, reply));
}
