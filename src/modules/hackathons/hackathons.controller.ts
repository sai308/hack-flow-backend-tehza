import type { FastifyRequest, FastifyReply } from 'fastify';
import type { HackathonsService } from './hackathons.service';
import type { JwtPayload } from '../../common/middleware/auth.middleware';
import {
  CreateHackathonSchema,
  UpdateHackathonSchema,
  CreateTrackSchema,
  UpdateTrackSchema,
  CreateStageSchema,
  UpdateStageSchema,
  UpdateAwardSchema,
  UuidParamSchema,
  PaginationSchema,
  SetHackathonStatusSchema,
  UpdateStatusParamsSchema,
} from './hackathons.schema';

function getCallerInfo(request: FastifyRequest): { userId: string; isAdmin: boolean } {
  const user = (request as any).user as JwtPayload | undefined;
  const userId = user?.sub ?? '';
  const isAdmin = user?.roles?.includes('admin') ?? false;
  return { userId, isAdmin };
}

export class HackathonsController {
  constructor(private readonly service: HackathonsService) {}

  async list(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const query = PaginationSchema.parse(request.query);
    const tagNames = query.tags
      ? query.tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean)
      : undefined;

    // Organizer sees only their own hackathons
    const { userId, isAdmin } = getCallerInfo(request);
    const user = (request as any).user as JwtPayload | undefined;
    const isOrganizer = user?.roles?.includes('organizer') ?? false;
    const createdBy = (!isAdmin && isOrganizer) ? userId : undefined;

    const result = await this.service.list(
      query.page, query.limit, query.status, tagNames, query.publishStatus, query.search, createdBy,
    );
    return reply.send({ success: true, ...result });
  }

  async getById(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { id } = UuidParamSchema.parse(request.params);
    return reply.send({ success: true, data: await this.service.getById(id) });
  }

  async create(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const body = CreateHackathonSchema.parse(request.body);
    const { userId } = getCallerInfo(request);
    return reply.status(201).send({ success: true, data: await this.service.create(body, userId || undefined) });
  }

  async update(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { id } = UuidParamSchema.parse(request.params);
    const body = UpdateHackathonSchema.parse(request.body);
    const { userId, isAdmin } = getCallerInfo(request);
    return reply.send({ success: true, data: await this.service.update(id, body, userId, isAdmin) });
  }

  async remove(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { id } = UuidParamSchema.parse(request.params);
    const { userId, isAdmin } = getCallerInfo(request);
    await this.service.remove(id, userId, isAdmin);
    return reply.status(204).send();
  }

  async listTracks(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { id } = UuidParamSchema.parse(request.params);
    return reply.send({ success: true, data: await this.service.listTracks(id) });
  }

  async createTrack(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const { id } = UuidParamSchema.parse(request.params);
      const body = CreateTrackSchema.parse(request.body);
      const { userId, isAdmin } = getCallerInfo(request);
      return reply.status(201).send({ success: true, data: await this.service.createTrack(id, body, userId, isAdmin) });
    } catch (error: any) {
      if (error.statusCode === 403) return reply.status(403).send({ success: false, message: error.message });
      console.error("CREATE TRACK ERROR:", error);
      return reply.status(500).send({ success: false, error: error?.message || String(error), stack: error?.stack });
    }
  }

  async deleteTrack(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { id } = UuidParamSchema.parse(request.params);
    const { userId, isAdmin } = getCallerInfo(request);
    await this.service.deleteTrack(id, userId, isAdmin);
    return reply.status(204).send();
  }

  async listStages(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { id } = UuidParamSchema.parse(request.params);
    return reply.send({ success: true, data: await this.service.listStages(id) });
  }

  async createStage(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { id } = UuidParamSchema.parse(request.params);
    const body = CreateStageSchema.parse(request.body);
    const { userId, isAdmin } = getCallerInfo(request);
    return reply.status(201).send({ success: true, data: await this.service.createStage(id, body, userId, isAdmin) });
  }

  async deleteStage(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { id } = UuidParamSchema.parse(request.params);
    const { userId, isAdmin } = getCallerInfo(request);
    await this.service.deleteStage(id, userId, isAdmin);
    return reply.status(204).send();
  }

  async updateTrack(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { id } = UuidParamSchema.parse(request.params);
    const body = UpdateTrackSchema.parse(request.body);
    const { userId, isAdmin } = getCallerInfo(request);
    return reply.send({ success: true, data: await this.service.updateTrack(id, body, userId, isAdmin) });
  }

  async updateStage(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { id } = UuidParamSchema.parse(request.params);
    const body = UpdateStageSchema.parse(request.body);
    const { userId, isAdmin } = getCallerInfo(request);
    return reply.send({ success: true, data: await this.service.updateStage(id, body, userId, isAdmin) });
  }

  async updateAward(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { id } = UuidParamSchema.parse(request.params);
    const body = UpdateAwardSchema.parse(request.body);
    return reply.send({ success: true, data: await this.service.updateAward(id, body) });
  }

  async setStatus(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { hackathonId } = UpdateStatusParamsSchema.parse(request.params);
    const { status } = SetHackathonStatusSchema.parse(request.body);
    const { userId, isAdmin } = getCallerInfo(request);
    const updated = await this.service.overrideStatus(hackathonId, status, userId, isAdmin);
    return reply.send({ success: true, data: updated });
  }
}
