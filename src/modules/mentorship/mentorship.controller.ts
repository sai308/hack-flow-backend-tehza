import type { FastifyRequest, FastifyReply } from 'fastify';
import type { MentorshipService } from './mentorship.service';
import {
  CreateAvailabilitySchema,
  AvailabilityQuerySchema,
  CreateMentorshipRequestSchema,
  AcceptMentorshipRequestSchema,
  BlockMentorshipSlotSchema,
  UuidParamSchema,
} from './mentorship.schema';
import type { JwtPayload } from '../../common/middleware/auth.middleware';

export class MentorshipController {
  constructor(private readonly service: MentorshipService) {}

  async getMyAvailabilities(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { sub } = request.user as JwtPayload;
    const { hackathonId } = AvailabilityQuerySchema.parse(request.query);
    return reply.send({ success: true, data: await this.service.listAvailabilities(sub, hackathonId) });
  }

  async listAvailabilities(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { id } = UuidParamSchema.parse(request.params);
    const { hackathonId } = AvailabilityQuerySchema.parse(request.query);
    return reply.send({ success: true, data: await this.service.listAvailabilities(id, hackathonId) });
  }

  async listAllAvailabilities(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { hackathonId } = AvailabilityQuerySchema.parse(request.query);
    return reply.send({ success: true, data: await this.service.listAllAvailabilities(hackathonId) });
  }

  async createAvailability(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { sub } = request.user as JwtPayload;
    const body = CreateAvailabilitySchema.parse(request.body);
    return reply.status(201).send({ success: true, data: await this.service.createAvailability(sub, body) });
  }

  async deleteAvailability(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { id } = UuidParamSchema.parse(request.params);
    const result = await this.service.deleteAvailability(id);
    return reply.send({ success: true, data: result });
  }

  async getRequests(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { id } = UuidParamSchema.parse(request.params);
    return reply.send({ success: true, data: await this.service.getRequestsByAvailability(id) });
  }

  async getTeamRequests(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { teamId } = request.query as { teamId?: string };
    if (!teamId) return reply.status(400).send({ success: false, message: 'teamId is required' });
    return reply.send({ success: true, data: await this.service.getRequestsByTeam(teamId) });
  }

  async getAdminRequests(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    return reply.send({ success: true, data: await this.service.getAllRequests() });
  }

  async createRequest(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const body = CreateMentorshipRequestSchema.parse(request.body);
    return reply.status(201).send({ success: true, data: await this.service.createRequest(body) });
  }

  async acceptRequest(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { id } = UuidParamSchema.parse(request.params);
    const body = AcceptMentorshipRequestSchema.parse(request.body);
    return reply.send({ success: true, data: await this.service.acceptRequest(id, body.meetingLink, (request.user as JwtPayload).sub) });
  }

  async rejectRequest(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { id } = UuidParamSchema.parse(request.params);
    return reply.send({ success: true, data: await this.service.rejectRequest(id, (request.user as JwtPayload).sub) });
  }

  async cancelRequest(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { id } = UuidParamSchema.parse(request.params);
    return reply.send({ success: true, data: await this.service.cancelRequest(id, (request.user as JwtPayload).sub) });
  }

  async completeRequest(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { id } = UuidParamSchema.parse(request.params);
    return reply.send({ success: true, data: await this.service.completeRequest(id, (request.user as JwtPayload).sub) });
  }

  async blockSlot(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { id } = UuidParamSchema.parse(request.params);
    const body = BlockMentorshipSlotSchema.parse(request.body);
    return reply.send({ success: true, data: await this.service.blockSlot(id, body.startDatetime, body.durationMinute, (request.user as JwtPayload).sub) });
  }

  async unblockSlot(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { id } = UuidParamSchema.parse(request.params);
    return reply.send({ success: true, data: await this.service.unblockSlot(id, (request.user as JwtPayload).sub) });
  }
}
