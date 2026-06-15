import type { FastifyRequest, FastifyReply } from 'fastify';
import type { AwardsService } from './awards.service';
import {
  CreateAwardSchema,
  UpdateAwardSchema,
  CreatePhysicalGiftSchema,
  HackathonAwardParamsSchema,
  AwardGiftParamsSchema,
  TeamAwardParamsSchema,
} from './awards.schema';

export class AwardsController {
  constructor(private readonly service: AwardsService) {}

  // ── Awards ────────────────────────────────────────────────────

  async list(req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { hackathonId } = HackathonAwardParamsSchema.parse(req.params);
    const data = await this.service.listByHackathon(hackathonId);
    return reply.send({ success: true, data });
  }

  async create(req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { hackathonId } = HackathonAwardParamsSchema.parse(req.params);
    const body = CreateAwardSchema.parse(req.body);
    const data = await this.service.create(hackathonId, body);
    return reply.status(201).send({ success: true, data });
  }

  async update(req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { hackathonId, id } = HackathonAwardParamsSchema.parse(req.params);
    const body = UpdateAwardSchema.parse(req.body);
    const data = await this.service.update(hackathonId, id!, body);
    return reply.send({ success: true, data });
  }

  async remove(req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { hackathonId, id } = HackathonAwardParamsSchema.parse(req.params);
    await this.service.remove(hackathonId, id!);
    return reply.status(204).send();
  }

  // ── Physical Gifts ─────────────────────────────────────────────

  async addGift(req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { hackathonId, id } = HackathonAwardParamsSchema.parse(req.params);
    const body = CreatePhysicalGiftSchema.parse(req.body);
    const data = await this.service.addGift(hackathonId, id!, body);
    return reply.status(201).send({ success: true, data });
  }

  async removeGift(req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { hackathonId, id, giftId } = AwardGiftParamsSchema.parse(req.params);
    await this.service.removeGift(hackathonId, id, giftId);
    return reply.status(204).send();
  }

  // ── Team Awards ────────────────────────────────────────────────

  async assignToTeam(req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { teamId, awardId } = TeamAwardParamsSchema.parse(req.params);
    const data = await this.service.assignToTeam(teamId, awardId);
    return reply.status(201).send({ success: true, data });
  }
}
