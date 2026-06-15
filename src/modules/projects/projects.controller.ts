import type { FastifyRequest, FastifyReply } from 'fastify';
import type { ProjectsService } from './projects.service';
import {
  CreateProjectSchema,
  UpdateProjectSchema,
  AddResourceSchema,
  UuidParamSchema,
} from './projects.schema';
import { z } from 'zod';
import type { JwtPayload } from '../../common/middleware/auth.middleware';

const ResourceParamSchema = z.object({
  id: z.string().uuid(),
  resourceId: z.string().uuid(),
});

export class ProjectsController {
  constructor(private readonly service: ProjectsService) {}

  async getById(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { id } = UuidParamSchema.parse(request.params);
    return reply.send({ success: true, data: await this.service.getById(id) });
  }

  async list(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const query = request.query as { teamId?: string };
    if (!query.teamId) {
      return reply.send({ success: true, data: [] });
    }
    return reply.send({ success: true, data: await this.service.listByTeam(query.teamId) });
  }

  async create(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const body = CreateProjectSchema.parse(request.body);
    return reply.status(201).send({ success: true, data: await this.service.create(body) });
  }

  async update(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { id } = UuidParamSchema.parse(request.params);
    const body = UpdateProjectSchema.parse(request.body);
    return reply.send({ success: true, data: await this.service.update(id, body) });
  }

  async submit(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { id } = UuidParamSchema.parse(request.params);
    const userId = (request.user as JwtPayload | undefined)?.sub;
    return reply.send({ success: true, data: await this.service.submit(id, userId) });
  }

  async review(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { id } = UuidParamSchema.parse(request.params);
    const body = UpdateProjectSchema.parse(request.body);
    return reply.send({ success: true, data: await this.service.review(id, body) });
  }

  async reopen(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { id } = UuidParamSchema.parse(request.params);
    return reply.send({ success: true, data: await this.service.reopen(id) });
  }

  async getResources(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { id } = UuidParamSchema.parse(request.params);
    return reply.send({ success: true, data: await this.service.getResources(id) });
  }

  async addResource(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { id } = UuidParamSchema.parse(request.params);
    const body = AddResourceSchema.parse(request.body);
    return reply.status(201).send({ success: true, data: await this.service.addResource(id, body) });
  }

  async removeResource(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { id, resourceId } = ResourceParamSchema.parse(request.params);
    await this.service.removeResource(id, resourceId);
    return reply.status(204).send();
  }

  async getResourceTypes(_request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    return reply.send({ success: true, data: await this.service.getResourceTypes() });
  }
}

