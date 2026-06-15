import type { FastifyInstance } from 'fastify';
import { JudgeTrackController } from './judge-track.controller';
import { JudgeTrackService } from './judge-track.service';
import { JudgeTrackRepository } from './judge-track.repository';
import { AuditLogRepository } from '../audit-log/audit-log.repository';
import { getDatabaseConnection } from '../../config/database';
import { authenticate, authorize } from '../../common/middleware/auth.middleware';

const Sec = [{ bearerAuth: [] }];

export async function judgeTrackRoutes(app: FastifyInstance): Promise<void> {
  const db = getDatabaseConnection();
  const repo = new JudgeTrackRepository(db);
  const auditLog = new AuditLogRepository(db);
  const service = new JudgeTrackService(repo, auditLog);
  const ctrl = new JudgeTrackController(service);

  app.get('/hackathons/:hackathonId/judges', {
    onRequest: [authenticate, authorize('admin', 'organizer')],
    schema: {
      tags: ['JudgeTrack'],
      summary: 'List judge→track assignments for a hackathon — admin only',
      security: Sec,
      params: { type: 'object', required: ['hackathonId'], properties: { hackathonId: { type: 'string', format: 'uuid' } } },
    },
  }, (req, reply) => ctrl.listByHackathon(req, reply));

  app.post('/hackathons/:hackathonId/judges', {
    onRequest: [authenticate, authorize('admin', 'organizer')],
    schema: {
      tags: ['JudgeTrack'],
      summary: 'Assign a judge to a track — admin only',
      security: Sec,
      params: { type: 'object', required: ['hackathonId'], properties: { hackathonId: { type: 'string', format: 'uuid' } } },
      body: {
        type: 'object',
        required: ['userId', 'trackId'],
        properties: {
          userId: { type: 'string', format: 'uuid' },
          trackId: { type: 'string', format: 'uuid' },
          isHeadJudge: { type: 'boolean', default: false },
        },
      },
    },
  }, (req, reply) => ctrl.assign(req, reply));

  app.patch('/hackathons/:hackathonId/judges/:judgeTrackId', {
    onRequest: [authenticate, authorize('admin', 'organizer')],
    schema: {
      tags: ['JudgeTrack'],
      summary: 'Toggle isHeadJudge on an assignment — admin only',
      security: Sec,
      params: {
        type: 'object',
        required: ['hackathonId', 'judgeTrackId'],
        properties: {
          hackathonId: { type: 'string', format: 'uuid' },
          judgeTrackId: { type: 'string', format: 'uuid' },
        },
      },
      body: {
        type: 'object',
        required: ['isHeadJudge'],
        properties: { isHeadJudge: { type: 'boolean' } },
      },
    },
  }, (req, reply) => ctrl.update(req, reply));

  app.delete('/hackathons/:hackathonId/judges/:judgeTrackId', {
    onRequest: [authenticate, authorize('admin', 'organizer')],
    schema: {
      tags: ['JudgeTrack'],
      summary: 'Remove a judge→track assignment — admin only',
      security: Sec,
      params: {
        type: 'object',
        required: ['hackathonId', 'judgeTrackId'],
        properties: {
          hackathonId: { type: 'string', format: 'uuid' },
          judgeTrackId: { type: 'string', format: 'uuid' },
        },
      },
    },
  }, (req, reply) => ctrl.unassign(req, reply));

  app.get('/hackathons/:hackathonId/tracks/:trackId/judges', {
    onRequest: [authenticate],
    schema: {
      tags: ['JudgeTrack'],
      summary: 'List judges for a specific track',
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

  app.get('/judging/my-tracks', {
    onRequest: [authenticate, authorize('judge')],
    schema: {
      tags: ['JudgeTrack'],
      summary: 'Get tracks assigned to the current judge',
      security: Sec,
      querystring: {
        type: 'object',
        required: ['hackathonId'],
        properties: { hackathonId: { type: 'string', format: 'uuid' } },
      },
    },
  }, (req, reply) => ctrl.getMyTracks(req, reply));
}
