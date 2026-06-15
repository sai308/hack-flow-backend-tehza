import type { FastifyInstance } from 'fastify';
import { MentorshipController } from './mentorship.controller';
import { MentorshipService } from './mentorship.service';
import { MentorshipRepository } from './mentorship.repository';
import { AuditLogRepository } from '../audit-log/audit-log.repository';
import { getDatabaseConnection } from '../../config/database';
import { authenticate, authorize } from '../../common/middleware/auth.middleware';

const Sec = [{ bearerAuth: [] }];

export async function mentorshipRoutes(app: FastifyInstance): Promise<void> {
  const db = getDatabaseConnection();
  const repository = new MentorshipRepository(db);
  const auditLog = new AuditLogRepository(db);
  const service = new MentorshipService(repository, auditLog);
  const ctrl = new MentorshipController(service);

  app.get('/availabilities', {
    schema: {
      tags: ['Mentorship'],
      summary: 'List all mentor availabilities',
      description: 'Optionally filter by ?hackathonId=UUID.',
      querystring: { type: 'object', properties: { hackathonId: { type: 'string', format: 'uuid' } } },
    },
  }, (req, reply) => ctrl.listAllAvailabilities(req, reply));

  app.get('/availabilities/my', {
    onRequest: [authenticate, authorize('mentor')],
    schema: {
      tags: ['Mentorship'],
      summary: 'Get my availabilities (Mentor only)',
      security: Sec,
      querystring: { type: 'object', properties: { hackathonId: { type: 'string', format: 'uuid' } } },
    },
  }, (req, reply) => ctrl.getMyAvailabilities(req, reply));

  app.get('/availabilities/mentor/:id', {
    schema: {
      tags: ['Mentorship'],
      summary: "List a specific mentor's availabilities",
      querystring: { type: 'object', properties: { hackathonId: { type: 'string', format: 'uuid' } } },
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
    },
  }, (req, reply) => ctrl.listAvailabilities(req, reply));

  app.get('/availabilities/:id/requests', {
    onRequest: [authenticate],
    schema: {
      tags: ['Mentorship'],
      summary: 'Get mentor requests for an availability window',
      security: Sec,
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
    },
  }, (req, reply) => ctrl.getRequests(req, reply));

  app.post('/availabilities', {
    onRequest: [authenticate, authorize('mentor')],
    schema: {
      tags: ['Mentorship'],
      summary: 'Create a mentor availability window — mentor only',
      security: Sec,
      body: {
        type: 'object',
        required: ['startDatetime', 'endDatetime'],
        properties: {
          hackathonId: { type: 'string', format: 'uuid' },
          trackId: { type: 'string', format: 'uuid' },
          startDatetime: { type: 'string', format: 'date-time' },
          endDatetime: { type: 'string', format: 'date-time' },
          slotDuration: { type: 'integer', minimum: 15, maximum: 120 },
          maxConcurrentSessions: { type: 'integer', minimum: 1, default: 1 },
          meetingLink: { type: 'string' },
          topics: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  }, (req, reply) => ctrl.createAvailability(req, reply));

  app.delete('/availabilities/:id', {
    onRequest: [authenticate, authorize('mentor')],
    schema: {
      tags: ['Mentorship'],
      summary: 'Delete a mentor availability window — mentor only',
      security: Sec,
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
    },
  }, (req, reply) => ctrl.deleteAvailability(req, reply));

  app.get('/requests/all', {
    onRequest: [authenticate, authorize('admin', 'organizer')],
    schema: {
      tags: ['Mentorship'],
      summary: 'Get ALL mentorship requests — admin only',
      security: Sec,
    },
  }, (req, reply) => ctrl.getAdminRequests(req, reply));

  app.get('/requests', {
    onRequest: [authenticate],
    schema: {
      tags: ['Mentorship'],
      summary: 'Get mentorship requests for a team',
      security: Sec,
      querystring: { type: 'object', properties: { teamId: { type: 'string', format: 'uuid' } } },
    },
  }, (req, reply) => ctrl.getTeamRequests(req, reply));

  app.post('/requests', {
    onRequest: [authenticate],
    schema: {
      tags: ['Mentorship'],
      summary: 'Create a mentorship request',
      description: 'Uses a Redis lock to prevent concurrent overlapping requests.',
      security: Sec,
      body: {
        type: 'object',
        required: ['mentorAvailabilityId', 'teamId', 'startDatetime', 'durationMinute'],
        properties: {
          mentorAvailabilityId: { type: 'string', format: 'uuid' },
          teamId: { type: 'string', format: 'uuid' },
          startDatetime: { type: 'string', format: 'date-time' },
          durationMinute: { type: 'integer', minimum: 15, maximum: 120 },
          message: { type: 'string' },
        },
      },
    },
  }, (req, reply) => ctrl.createRequest(req, reply));

  app.patch('/requests/:id/accept', {
    onRequest: [authenticate, authorize('mentor')],
    schema: {
      tags: ['Mentorship'],
      summary: 'Accept a mentorship request',
      security: Sec,
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
      body: {
        type: 'object',
        required: ['meetingLink'],
        properties: { meetingLink: { type: 'string', format: 'uri' } },
      },
    },
  }, (req, reply) => ctrl.acceptRequest(req, reply));

  app.patch('/requests/:id/reject', {
    onRequest: [authenticate, authorize('mentor')],
    schema: {
      tags: ['Mentorship'],
      summary: 'Reject a mentorship request',
      security: Sec,
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
    },
  }, (req, reply) => ctrl.rejectRequest(req, reply));

  app.patch('/requests/:id/cancel', {
    onRequest: [authenticate],
    schema: {
      tags: ['Mentorship'],
      summary: 'Cancel a mentorship request',
      security: Sec,
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
    },
  }, (req, reply) => ctrl.cancelRequest(req, reply));

  app.patch('/requests/:id/complete', {
    onRequest: [authenticate, authorize('mentor', 'admin')],
    schema: {
      tags: ['Mentorship'],
      summary: 'Complete a mentorship session',
      security: Sec,
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
    },
  }, (req, reply) => ctrl.completeRequest(req, reply));

  app.post('/availabilities/:id/block', {
    onRequest: [authenticate, authorize('mentor')],
    schema: {
      tags: ['Mentorship'],
      summary: 'Block a specific slot within an availability',
      security: Sec,
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
      body: {
        type: 'object',
        required: ['startDatetime', 'durationMinute'],
        properties: {
          startDatetime: { type: 'string', format: 'date-time' },
          durationMinute: { type: 'integer', minimum: 15, maximum: 120 },
        },
      },
    },
  }, (req, reply) => ctrl.blockSlot(req, reply));

  app.delete('/requests/:id/unblock', {
    onRequest: [authenticate, authorize('mentor')],
    schema: {
      tags: ['Mentorship'],
      summary: 'Unblock a previously blocked slot',
      security: Sec,
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
    },
  }, (req, reply) => ctrl.unblockSlot(req, reply));
}
