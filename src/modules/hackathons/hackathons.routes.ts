import type { FastifyInstance } from 'fastify';
import { HackathonsController } from './hackathons.controller';
import { HackathonsService } from './hackathons.service';
import { HackathonsRepository } from './hackathons.repository';
import { HackathonTagsRepository } from '../hackathon-tags/hackathon-tags.repository';
import { AuditLogRepository } from '../audit-log/audit-log.repository';
import { getDatabaseConnection } from '../../config/database';
import { authenticate, authorize, optionalAuthenticate } from '../../common/middleware/auth.middleware';

const Sec = [{ bearerAuth: [] }];

export async function hackathonsRoutes(app: FastifyInstance): Promise<void> {
  const db = getDatabaseConnection();
  const repository = new HackathonsRepository(db);
  const tagsRepository = new HackathonTagsRepository(db);
  const auditLog = new AuditLogRepository(db);
  const service = new HackathonsService(repository, tagsRepository, auditLog);
  const ctrl = new HackathonsController(service);

  app.get('/', {
    onRequest: [optionalAuthenticate],
    schema: {
      tags: ['Hackathons'],
      summary: 'List hackathons (paginated, filterable)',
      description: 'Filter by ?status=upcoming|active|past and/or ?tags=tag1,tag2 (AND logic).',
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1, default: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          status: { type: 'string', enum: ['upcoming', 'active', 'past'] },
          publishStatus: { type: 'string', enum: ['DRAFT', 'PUBLISHED', 'ARCHIVED'] },
          tags: { type: 'string', description: 'Comma-separated tag names, e.g. "AI,climate"' },
          search: { type: 'string' },
        },
      },
    },
  }, (req, reply) => ctrl.list(req, reply));

  app.get('/:id', {
    schema: {
      tags: ['Hackathons'],
      summary: 'Get hackathon by ID',
      description: 'Includes tags array and activeStage (from Redis cache, DB fallback). Status: DRAFT | PUBLISHED | ARCHIVED.',
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
    },
  }, (req, reply) => ctrl.getById(req, reply));

  app.get('/:id/tracks', {
    schema: {
      tags: ['Hackathons'],
      summary: 'List tracks for a hackathon',
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
    },
  }, (req, reply) => ctrl.listTracks(req, reply));

  app.get('/:id/stages', {
    schema: {
      tags: ['Hackathons'],
      summary: 'List stages for a hackathon',
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
    },
  }, (req, reply) => ctrl.listStages(req, reply));

  app.post('/', {
    onRequest: [authenticate, authorize('admin', 'organizer')],
    schema: {
      tags: ['Hackathons'],
      summary: 'Create a new hackathon — admin only',
      security: Sec,
      body: {
        type: 'object',
        required: ['title', 'startDate', 'endDate'],
        properties: {
          title: { type: 'string', minLength: 3, maxLength: 255 },
          subtitle: { type: 'string', maxLength: 500 },
          description: { type: 'string' },
          location: { type: 'string', maxLength: 255 },
          online: { type: 'boolean', default: false },
          startDate: { type: 'string', format: 'date-time' },
          endDate: { type: 'string', format: 'date-time' },
          minTeamSize: { type: 'integer', minimum: 1, default: 1 },
          maxTeamSize: { type: 'integer', minimum: 1, default: 5 },
          banner: { type: 'string' },
          rulesUrl: { type: 'string' },
          contactEmail: { type: 'string', format: 'email' },
          tags: { type: 'array', items: { type: 'string' } },
          tracks: { type: 'array', items: { type: 'object', required: ['name'], properties: { name: { type: 'string' }, description: { type: 'string' }, guidelines: { type: 'string' } } } },
          stages: { type: 'array', items: { type: 'object', required: ['name', 'orderIndex', 'startDate', 'endDate'], properties: { name: { type: 'string' }, type: { type: 'string', enum: ['REGISTRATION', 'HACKING', 'PRESENTATION', 'JUDGING', 'FINISHED', 'CUSTOM'], default: 'CUSTOM' }, orderIndex: { type: 'integer' }, startDate: { type: 'string', format: 'date-time' }, endDate: { type: 'string', format: 'date-time' } } } },
          awards: { type: 'array', items: { type: 'object', required: ['name', 'place'], properties: { name: { type: 'string' }, place: { type: 'integer' }, description: { type: 'string' }, certificate: { type: 'string' } } } },
        },
      },
    },
  }, (req, reply) => ctrl.create(req, reply));

  app.patch('/:id', {
    onRequest: [authenticate, authorize('admin', 'organizer')],
    schema: {
      tags: ['Hackathons'],
      summary: 'Update a hackathon — admin only',
      security: Sec,
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
      body: {
        type: 'object',
        properties: {
          title: { type: 'string', minLength: 3, maxLength: 255 },
          subtitle: { type: 'string' },
          description: { type: 'string' },
          location: { type: 'string' },
          online: { type: 'boolean' },
          startDate: { type: 'string', format: 'date-time' },
          endDate: { type: 'string', format: 'date-time' },
          minTeamSize: { type: 'integer', minimum: 1 },
          maxTeamSize: { type: 'integer', minimum: 1 },
          banner: { type: 'string' },
          rulesUrl: { type: 'string' },
          contactEmail: { type: 'string', format: 'email' },
        },
      },
    },
  }, (req, reply) => ctrl.update(req, reply));

  app.delete('/:id', {
    onRequest: [authenticate, authorize('admin', 'organizer')],
    schema: {
      tags: ['Hackathons'],
      summary: 'Delete a hackathon — admin only',
      security: Sec,
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
    },
  }, (req, reply) => ctrl.remove(req, reply));

  app.post('/:id/tracks', {
    onRequest: [authenticate, authorize('admin', 'organizer')],
    schema: {
      tags: ['Hackathons'],
      summary: 'Add a track to a hackathon — admin only',
      security: Sec,
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name:                { type: 'string', minLength: 2, maxLength: 100 },
          description:         { type: 'string', maxLength: 500 },
          guidelines:          { type: 'string' },
          allowedTechnologies: { type: 'string' },
          expectedOutcome:     { type: 'string' },
          externalUrl:         { type: 'string', maxLength: 500 },
        },
      },
    },
  }, (req, reply) => ctrl.createTrack(req, reply));

  app.delete('/tracks/:id', {
    onRequest: [authenticate, authorize('admin', 'organizer')],
    schema: {
      tags: ['Hackathons'],
      summary: 'Delete a track — admin only',
      security: Sec,
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
    },
  }, (req, reply) => ctrl.deleteTrack(req, reply));

  app.put('/tracks/:id', {
    onRequest: [authenticate, authorize('admin', 'organizer')],
    schema: {
      tags: ['Hackathons'],
      summary: 'Update a track — admin only',
      security: Sec,
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
      body: {
        type: 'object',
        properties: {
          name:                { type: 'string', minLength: 2, maxLength: 100 },
          description:         { type: 'string', maxLength: 500 },
          guidelines:          { type: 'string' },
          allowedTechnologies: { type: 'string' },
          expectedOutcome:     { type: 'string' },
          externalUrl:         { type: 'string', maxLength: 500 },
        },
      },
    },
  }, (req, reply) => ctrl.updateTrack(req, reply));

  app.post('/:id/stages', {
    onRequest: [authenticate, authorize('admin', 'organizer')],
    schema: {
      tags: ['Hackathons'],
      summary: 'Add a stage to a hackathon — admin only',
      description: 'Use type enum to define the semantic role of the stage. Dates drive date-based activation.',
      security: Sec,
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
      body: {
        type: 'object',
        required: ['name', 'startDate', 'endDate', 'orderIndex'],
        properties: {
          name:        { type: 'string', minLength: 1, maxLength: 100 },
          type:        { type: 'string', enum: ['REGISTRATION', 'HACKING', 'PRESENTATION', 'JUDGING', 'FINISHED', 'CUSTOM'], default: 'CUSTOM' },
          startDate:   { type: 'string', format: 'date-time' },
          endDate:     { type: 'string', format: 'date-time' },
          orderIndex:  { type: 'integer', minimum: 0 },
          description: { type: 'string' },
        },
      },
    },
  }, (req, reply) => ctrl.createStage(req, reply));

  app.put('/stages/:id', {
    onRequest: [authenticate, authorize('admin', 'organizer')],
    schema: {
      tags: ['Hackathons'],
      summary: 'Update a stage — admin only',
      security: Sec,
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
      body: {
        type: 'object',
        properties: {
          name:        { type: 'string', minLength: 1, maxLength: 100 },
          type:        { type: 'string', enum: ['REGISTRATION', 'HACKING', 'PRESENTATION', 'JUDGING', 'FINISHED', 'CUSTOM'] },
          startDate:   { type: 'string', format: 'date-time' },
          endDate:     { type: 'string', format: 'date-time' },
          orderIndex:  { type: 'integer', minimum: 0 },
          description: { type: 'string' },
        },
      },
    },
  }, (req, reply) => ctrl.updateStage(req, reply));

  app.delete('/stages/:id', {
    onRequest: [authenticate, authorize('admin', 'organizer')],
    schema: {
      tags: ['Hackathons'],
      summary: 'Delete a stage — admin only',
      security: Sec,
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
    },
  }, (req, reply) => ctrl.deleteStage(req, reply));

  app.post('/:hackathonId/status', {
    onRequest: [authenticate, authorize('admin', 'organizer')],
    schema: {
      tags: ['Hackathons'],
      summary: 'Manually override hackathon status — admin only',
      description:
        'Bypasses the automatic cron transition. PUBLISHED requires at least one stage defined. Invalidates Redis activeStage cache.',
      security: Sec,
      params: { type: 'object', required: ['hackathonId'], properties: { hackathonId: { type: 'string', format: 'uuid' } } },
      body: {
        type: 'object',
        required: ['status'],
        properties: { status: { type: 'string', enum: ['DRAFT', 'PUBLISHED', 'ARCHIVED'] } },
      },
    },
  }, (req, reply) => ctrl.setStatus(req, reply));
}
