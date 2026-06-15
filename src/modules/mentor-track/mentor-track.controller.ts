import type { FastifyRequest, FastifyReply } from 'fastify';
import type { MentorTrackService } from './mentor-track.service';
import { AssignMentorDtoSchema } from './mentor-track.schema';
import type { JwtPayload } from '../../common/middleware/auth.middleware';
import { z } from 'zod';

const ParamsSchema = z.object({
  hackathonId: z.string().uuid(),
});

const TrackParamsSchema = z.object({
  hackathonId: z.string().uuid(),
  trackId: z.string().uuid(),
});

const AssignmentParamsSchema = z.object({
  hackathonId: z.string().uuid(),
  mentorTrackId: z.string().uuid(),
});

export class MentorTrackController {
  constructor(private readonly service: MentorTrackService) {}

  async listByHackathon(req: FastifyRequest, reply: FastifyReply) {
    const { hackathonId } = ParamsSchema.parse(req.params);
    const assignments = await this.service.listByHackathon(hackathonId);
    return reply.send({ success: true, data: assignments });
  }

  async listByTrack(req: FastifyRequest, reply: FastifyReply) {
    const { trackId } = TrackParamsSchema.parse(req.params);
    const judges = await this.service.listByTrack(trackId);
    return reply.send({ success: true, data: judges });
  }

  async getMyTracks(req: FastifyRequest, reply: FastifyReply) {
    const { sub: userId } = req.user as JwtPayload;
    const { hackathonId } = ParamsSchema.parse(req.query);
    const tracks = await this.service.getMyTracks(userId, hackathonId);
    return reply.send({ success: true, data: tracks });
  }

  async assign(req: FastifyRequest, reply: FastifyReply) {
    const { hackathonId } = ParamsSchema.parse(req.params);
    const dto = AssignMentorDtoSchema.parse(req.body);
    const { sub: assignedBy } = req.user as JwtPayload;

    const assignment = await this.service.assign(hackathonId, assignedBy, dto);
    return reply.status(201).send({ success: true, data: assignment });
  }

  async unassign(req: FastifyRequest, reply: FastifyReply) {
    const { mentorTrackId } = AssignmentParamsSchema.parse(req.params);
    const { sub: requesterId } = req.user as JwtPayload;

    await this.service.unassign(mentorTrackId, requesterId);
    return reply.status(204).send();
  }
}
