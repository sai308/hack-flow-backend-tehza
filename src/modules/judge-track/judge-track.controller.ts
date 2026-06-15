import type { FastifyRequest, FastifyReply } from 'fastify';
import type { JudgeTrackService } from './judge-track.service';
import {
  AssignJudgeSchema,
  UpdateJudgeTrackSchema,
  JudgeTrackParamsSchema,
  JudgeTrackByIdParamsSchema,
  JudgeTrackByTrackParamsSchema,
} from './judge-track.schema';
import type { JwtPayload } from '../../common/middleware/auth.middleware';

export class JudgeTrackController {
  constructor(private readonly service: JudgeTrackService) {}

  async listByHackathon(req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { hackathonId } = JudgeTrackParamsSchema.parse(req.params);
    return reply.send({ success: true, data: await this.service.listByHackathon(hackathonId) });
  }

  async assign(req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { hackathonId } = JudgeTrackParamsSchema.parse(req.params);
    const dto = AssignJudgeSchema.parse(req.body);
    const actor = (req.user as JwtPayload).sub;
    return reply
      .status(201)
      .send({ success: true, data: await this.service.assign(hackathonId, dto, actor) });
  }

  async update(req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { judgeTrackId } = JudgeTrackByIdParamsSchema.parse(req.params);
    const dto = UpdateJudgeTrackSchema.parse(req.body);
    return reply.send({ success: true, data: await this.service.update(judgeTrackId, dto) });
  }

  async unassign(req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { judgeTrackId } = JudgeTrackByIdParamsSchema.parse(req.params);
    const actor = (req.user as JwtPayload).sub;
    await this.service.unassign(judgeTrackId, actor);
    return reply.status(204).send();
  }

  async listByTrack(req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { trackId } = JudgeTrackByTrackParamsSchema.parse(req.params);
    return reply.send({ success: true, data: await this.service.listByTrack(trackId) });
  }

  async getMyTracks(req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { sub: userId } = req.user as JwtPayload;
    const { hackathonId } = JudgeTrackParamsSchema.parse(req.query);
    return reply.send({ success: true, data: await this.service.getMyTracks(userId, hackathonId) });
  }
}
