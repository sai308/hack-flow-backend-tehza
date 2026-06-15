import type { FastifyInstance } from 'fastify';
import { HackathonTagsController } from './hackathon-tags.controller';
import { HackathonTagsService } from './hackathon-tags.service';
import { HackathonTagsRepository } from './hackathon-tags.repository';
import { getDatabaseConnection } from '../../config/database';
import { authenticate, authorize } from '../../common/middleware/auth.middleware';

const Sec = [{ bearerAuth: [] }];

export async function hackathonTagsRoutes(app: FastifyInstance): Promise<void> {
  const db = getDatabaseConnection();
  const repo = new HackathonTagsRepository(db);
  const service = new HackathonTagsService(repo);
  const ctrl = new HackathonTagsController(service);

  app.get('/tags', {
    schema: { tags: ['Tags'], summary: 'List all tags (public, useful for autocomplete)' },
  }, (req, reply) => ctrl.listTags(req, reply));

  app.post('/tags', {
    onRequest: [authenticate, authorize('admin', 'organizer')],
    schema: {
      tags: ['Tags'],
      summary: 'Create a new global tag — admin only',
      description: 'Tag names are normalized to lowercase. Unique constraint enforced.',
      security: Sec,
      body: {
        type: 'object',
        required: ['name'],
        properties: { name: { type: 'string', minLength: 1, maxLength: 64 } },
      },
    },
  }, (req, reply) => ctrl.createTag(req, reply));

  app.delete('/tags/:tagId', {
    onRequest: [authenticate, authorize('admin', 'organizer')],
    schema: {
      tags: ['Tags'],
      summary: 'Delete a tag if unused — admin only',
      description: 'Returns 409 if the tag is still attached to one or more hackathons.',
      security: Sec,
      params: { type: 'object', required: ['tagId'], properties: { tagId: { type: 'string', format: 'uuid' } } },
    },
  }, (req, reply) => ctrl.deleteTag(req, reply));

  app.get('/hackathons/:hackathonId/tags', {
    schema: {
      tags: ['Tags'],
      summary: 'List tags attached to a hackathon (public)',
      params: { type: 'object', required: ['hackathonId'], properties: { hackathonId: { type: 'string', format: 'uuid' } } },
    },
  }, (req, reply) => ctrl.listHackathonTags(req, reply));

  app.post('/hackathons/:hackathonId/tags', {
    onRequest: [authenticate, authorize('admin', 'organizer')],
    schema: {
      tags: ['Tags'],
      summary: 'Attach tags to a hackathon — admin only',
      security: Sec,
      params: { type: 'object', required: ['hackathonId'], properties: { hackathonId: { type: 'string', format: 'uuid' } } },
      body: {
        type: 'object',
        required: ['tagIds'],
        properties: {
          tagIds: { type: 'array', items: { type: 'string', format: 'uuid' }, minItems: 1 },
        },
      },
    },
  }, (req, reply) => ctrl.attachTags(req, reply));

  app.delete('/hackathons/:hackathonId/tags/:tagId', {
    onRequest: [authenticate, authorize('admin', 'organizer')],
    schema: {
      tags: ['Tags'],
      summary: 'Detach a tag from a hackathon — admin only',
      security: Sec,
      params: {
        type: 'object',
        required: ['hackathonId', 'tagId'],
        properties: {
          hackathonId: { type: 'string', format: 'uuid' },
          tagId: { type: 'string', format: 'uuid' },
        },
      },
    },
  }, (req, reply) => ctrl.detachTag(req, reply));
}
