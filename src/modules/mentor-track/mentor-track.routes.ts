import type { FastifyInstance } from 'fastify';
import { MentorTrackController } from './mentor-track.controller';
import { MentorTrackService } from './mentor-track.service';
import { MentorTrackRepository } from './mentor-track.repository';
import { AuditLogRepository } from '../audit-log/audit-log.repository';
import { getDatabaseConnection } from '../../config/database';
import { authenticate, authorize } from '../../common/middleware/auth.middleware';

const Sec = [{ bearerAuth: [] }];

export async function mentorTrackRoutes(app: FastifyInstance): Promise<void> {
  const db = getDatabaseConnection();
  const repo = new MentorTrackRepository(db);
  const auditLog = new AuditLogRepository(db);
  const service = new MentorTrackService(repo, auditLog);
  const ctrl = new MentorTrackController(service);

  app.get('/hackathons/:hackathonId/mentors', {
    onRequest: [authenticate, authorize('admin', 'organizer')],
    schema: {
      tags: ['MentorTrack'],
      summary: 'List mentor→track assignments for a hackathon — admin only',
      security: Sec,
      params: { type: 'object', required: ['hackathonId'], properties: { hackathonId: { type: 'string', format: 'uuid' } } },
    },
  }, (req, reply) => ctrl.listByHackathon(req, reply));

  app.post('/hackathons/:hackathonId/mentors', {
    onRequest: [authenticate, authorize('admin', 'organizer')],
    schema: {
      tags: ['MentorTrack'],
      summary: 'Assign a mentor to a track — admin only',
      security: Sec,
      params: { type: 'object', required: ['hackathonId'], properties: { hackathonId: { type: 'string', format: 'uuid' } } },
      body: {
        type: 'object',
        required: ['userId', 'trackId'],
        properties: {
          userId: { type: 'string', format: 'uuid' },
          trackId: { type: 'string', format: 'uuid' },
        },
      },
    },
  }, (req, reply) => ctrl.assign(req, reply));

  app.delete('/hackathons/:hackathonId/mentors/:mentorTrackId', {
    onRequest: [authenticate, authorize('admin', 'organizer')],
    schema: {
      tags: ['MentorTrack'],
      summary: 'Remove a mentor→track assignment — admin only',
      security: Sec,
      params: {
        type: 'object',
        required: ['hackathonId', 'mentorTrackId'],
        properties: {
          hackathonId: { type: 'string', format: 'uuid' },
          mentorTrackId: { type: 'string', format: 'uuid' },
        },
      },
    },
  }, (req, reply) => ctrl.unassign(req, reply));

  app.get('/hackathons/:hackathonId/tracks/:trackId/mentors', {
    onRequest: [authenticate],
    schema: {
      tags: ['MentorTrack'],
      summary: 'List mentors for a specific track',
      security: Sec,
      params: {
        type: 'object',
        required: ['hackathonId', 'trackId'],
        properties: {
          hackathonId: { type: 'string', format: 'uuid' },
          trackId: { type: 'string', format: 'uuid' },
        },
      },
    },
  }, (req, reply) => ctrl.listByTrack(req, reply));

  app.get('/mentorship/my-tracks', {
    onRequest: [authenticate, authorize('mentor')],
    schema: {
      tags: ['MentorTrack'],
      summary: 'Get tracks assigned to the current mentor',
      security: Sec,
      querystring: {
        type: 'object',
        required: ['hackathonId'],
        properties: { hackathonId: { type: 'string', format: 'uuid' } },
      },
    },
  }, (req, reply) => ctrl.getMyTracks(req, reply));
}
