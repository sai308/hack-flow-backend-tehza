import type { FastifyInstance } from 'fastify';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { ProjectsRepository } from './projects.repository';
import { AuditLogRepository } from '../audit-log/audit-log.repository';
import { getDatabaseConnection } from '../../config/database';
import { authenticate, authorize } from '../../common/middleware/auth.middleware';

const Sec = [{ bearerAuth: [] }];

export async function projectsRoutes(app: FastifyInstance): Promise<void> {
  const db = getDatabaseConnection();
  const repository = new ProjectsRepository(db);
  const auditLog = new AuditLogRepository(db);
  const service = new ProjectsService(repository, auditLog);
  const ctrl = new ProjectsController(service);

  // ── Resource types (public, no auth) ───────────────────────────────────
  app.get('/resource-types', {
    schema: { tags: ['Projects'], summary: 'List all project resource types (GitHub, Demo, etc.)' },
  }, (req, reply) => ctrl.getResourceTypes(req, reply));

  app.get('/', {
    schema: {
      tags: ['Projects'],
      summary: 'Get projects by query',
      querystring: { type: 'object', properties: { teamId: { type: 'string', format: 'uuid' } } },
    },
  }, (req, reply) => ctrl.list(req, reply));

  app.get('/:id', {
    schema: {
      tags: ['Projects'],
      summary: 'Get project by ID',
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
    },
  }, (req, reply) => ctrl.getById(req, reply));

  app.get('/:id/resources', {
    schema: {
      tags: ['Projects'],
      summary: 'List project resources (links, repos, demos)',
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
    },
  }, (req, reply) => ctrl.getResources(req, reply));

  app.post('/', {
    onRequest: [authenticate],
    schema: {
      tags: ['Projects'],
      summary: 'Create a project draft',
      security: Sec,
      body: {
        type: 'object',
        required: ['teamId', 'stageId'],
        properties: {
          teamId: { type: 'string', format: 'uuid' },
          stageId: { type: 'string', format: 'uuid' },
          title: { type: 'string', maxLength: 255 },
          description: { type: 'string' },
        },
      },
    },
  }, (req, reply) => ctrl.create(req, reply));

  app.patch('/:id', {
    onRequest: [authenticate],
    schema: {
      tags: ['Projects'],
      summary: 'Update project title / description (DRAFT only)',
      security: Sec,
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
      body: {
        type: 'object',
        properties: {
          title: { type: 'string', maxLength: 255 },
          description: { type: 'string' },
        },
      },
    },
  }, (req, reply) => ctrl.update(req, reply));

  app.post('/:id/submit', {
    onRequest: [authenticate],
    schema: {
      tags: ['Projects'],
      summary: 'Submit project for review (DRAFT → SUBMITTED)',
      security: Sec,
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
    },
  }, (req, reply) => ctrl.submit(req, reply));

  app.patch('/:id/review', {
    onRequest: [authenticate, authorize('admin', 'judge')],
    schema: {
      tags: ['Projects'],
      summary: 'Review a submitted project — admin/judge only',
      security: Sec,
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
      body: {
        type: 'object',
        required: ['status'],
        properties: {
          status: { type: 'string', enum: ['APPROVED', 'REJECTED'] },
          comment: { type: 'string', maxLength: 1000 },
        },
      },
    },
  }, (req, reply) => ctrl.review(req, reply));

  app.patch('/:id/reopen', {
    onRequest: [authenticate],
    schema: {
      tags: ['Projects'],
      summary: 'Reopen a REJECTED project back to DRAFT for editing and re-submission',
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } },
    },
  }, (req, reply) => ctrl.reopen(req, reply));

  app.post('/:id/resources', {
    onRequest: [authenticate],
    schema: {
      tags: ['Projects'],
      summary: 'Add a resource link to a project',
      security: Sec,
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
      body: {
        type: 'object',
        required: ['url', 'projectTypeId'],
        properties: {
          url: { type: 'string', format: 'uri' },
          projectTypeId: { type: 'string', format: 'uuid' },
          description: { type: 'string', maxLength: 300 },
        },
      },
    },
  }, (req, reply) => ctrl.addResource(req, reply));

  app.delete('/:id/resources/:resourceId', {
    onRequest: [authenticate],
    schema: {
      tags: ['Projects'],
      summary: 'Remove a resource from a project',
      security: Sec,
      params: {
        type: 'object',
        required: ['id', 'resourceId'],
        properties: { id: { type: 'string', format: 'uuid' }, resourceId: { type: 'string', format: 'uuid' } },
      },
    },
  }, (req, reply) => ctrl.removeResource(req, reply));
}
