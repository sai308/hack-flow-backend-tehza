import type { FastifyRequest, FastifyReply } from 'fastify';
import type { JudgingService } from './judging.service';
import {
  CreateCriteriaSchema,
  UpdateCriteriaSchema,
  SubmitScoreSchema,
  ReportConflictSchema,
  UuidParamSchema,
  AllConflictsQuerySchema,
} from './judging.schema';
import type { JwtPayload } from '../../common/middleware/auth.middleware';
import { getRedisClient } from '../../config/redis';

export class JudgingController {
  constructor(private readonly service: JudgingService) {}

  async listCriteria(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { id } = UuidParamSchema.parse(request.params);
    return reply.send({ success: true, data: await this.service.listCriteria(id) });
  }

  async createCriteria(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const body = CreateCriteriaSchema.parse(request.body);
    return reply.status(201).send({ success: true, data: await this.service.createCriteria(body) });
  }

  async deleteCriteria(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { id } = UuidParamSchema.parse(request.params);
    await this.service.deleteCriteria(id);
    return reply.status(204).send();
  }

  async updateCriteria(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { id } = UuidParamSchema.parse(request.params);
    const body = UpdateCriteriaSchema.parse(request.body);
    return reply.send({ success: true, data: await this.service.updateCriteria(id, body) });
  }

  async getProjectScores(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { id } = UuidParamSchema.parse(request.params);
    return reply.send({ success: true, data: await this.service.getScoresForProject(id) });
  }

  async getMyScores(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { sub } = request.user as JwtPayload;
    return reply.send({ success: true, data: await this.service.getMyScores(sub) });
  }

  async submitScore(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { sub } = request.user as JwtPayload;
    const body = SubmitScoreSchema.parse(request.body);
    return reply.send({ success: true, data: await this.service.submitScore(sub, body) });
  }

  async listConflicts(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { sub } = request.user as JwtPayload;
    return reply.send({ success: true, data: await this.service.listConflicts(sub) });
  }

  async reportConflict(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { sub } = request.user as JwtPayload;
    const body = ReportConflictSchema.parse(request.body);
    return reply.status(201).send({ success: true, data: await this.service.reportConflict(sub, body) });
  }

  async listAllConflicts(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const query = AllConflictsQuerySchema.parse(request.query);
    const result = await this.service.listAllConflicts(query);
    return reply.send({ success: true, ...result });
  }

  async adminDeleteConflict(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { id } = UuidParamSchema.parse(request.params);
    await this.service.deleteConflict(id);
    return reply.status(204).send();
  }

  async adminUpdateConflict(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { id } = UuidParamSchema.parse(request.params);
    const { reason } = request.body as { reason: string };
    const row = await this.service.updateConflictReason(id, reason);
    return reply.send({ success: true, data: row });
  }

  async adminCreateConflict(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { judgeId, teamId, reason } = request.body as { judgeId: string; teamId: string; reason?: string };
    const row = await this.service.adminCreateConflict(judgeId, teamId, reason);
    return reply.status(201).send({ success: true, data: row });
  }

  async getLeaderboard(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { id } = UuidParamSchema.parse(request.params);
    const redis = getRedisClient();
    const leaderboard = await this.service.getLeaderboard(id, redis);
    return reply.send({ success: true, data: leaderboard });
  }

  async getFullResults(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { id } = UuidParamSchema.parse(request.params);
    const data = await this.service.getFullResults(id);
    return reply.send({ success: true, data });
  }

  async listAwards(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { id } = UuidParamSchema.parse(request.params);
    return reply.send({ success: true, data: await this.service.listAwards(id) });
  }

  async createAward(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { id } = UuidParamSchema.parse(request.params);
    const body = request.body as { name: string; place: number; description?: string };
    return reply.status(201).send({ success: true, data: await this.service.createAward({ hackathonId: id, ...body }) });
  }

  async assignAward(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { teamId, awardId } = request.params as { teamId: string; awardId: string };
    return reply.send({ success: true, data: await this.service.assignAward(teamId, awardId) });
  }

  async removeAward(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { teamId, awardId } = request.params as { teamId: string; awardId: string };
    await this.service.removeAward(teamId, awardId);
    return reply.status(204).send();
  }
}

