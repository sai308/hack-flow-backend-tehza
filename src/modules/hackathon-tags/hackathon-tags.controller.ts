import type { FastifyRequest, FastifyReply } from 'fastify';
import type { HackathonTagsService } from './hackathon-tags.service';
import {
  CreateTagSchema,
  AttachTagsSchema,
  HackathonTagParamsSchema,
  TagParamsSchema,
  HackathonTagByIdParamsSchema,
} from './hackathon-tags.schema';

export class HackathonTagsController {
  constructor(private readonly service: HackathonTagsService) {}

  async listTags(_req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    return reply.send({ success: true, data: await this.service.listTags() });
  }

  async createTag(req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { name } = CreateTagSchema.parse(req.body);
    return reply.status(201).send({ success: true, data: await this.service.createTag(name) });
  }

  async deleteTag(req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { tagId } = TagParamsSchema.parse(req.params);
    await this.service.deleteTag(tagId);
    return reply.status(204).send();
  }

  async listHackathonTags(req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { hackathonId } = HackathonTagParamsSchema.parse(req.params);
    return reply.send({ success: true, data: await this.service.getTagsForHackathon(hackathonId) });
  }

  async attachTags(req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { hackathonId } = HackathonTagParamsSchema.parse(req.params);
    const { tagIds } = AttachTagsSchema.parse(req.body);
    const tags = await this.service.attachTags(hackathonId, tagIds);
    return reply.send({ success: true, data: tags });
  }

  async detachTag(req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { hackathonId, tagId } = HackathonTagByIdParamsSchema.parse(req.params);
    await this.service.detachTag(hackathonId, tagId);
    return reply.status(204).send();
  }
}
