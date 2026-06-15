import type { FastifyRequest, FastifyReply } from 'fastify';
import type { UsersService } from './users.service';
import {
  UpdateProfileSchema,
  AddSocialSchema,
  UuidParamSchema,
  MatchmakingQuerySchema,
  UserPaginationSchema,
} from './users.schema';
import type { JwtPayload } from '../../common/middleware/auth.middleware';

export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  async list(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const query = UserPaginationSchema.parse(request.query);
    const result = await this.usersService.list(query.page, query.limit, query.search, query.role, query.lookingForTeam);
    return reply.send({ success: true, ...result });
  }

  async getMe(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { sub } = request.user as JwtPayload;
    const user = await this.usersService.getProfile(sub);
    return reply.send({ success: true, data: user });
  }

  async getById(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { id } = UuidParamSchema.parse(request.params);
    const user = await this.usersService.getProfile(id);
    return reply.send({ success: true, data: user });
  }

  async updateRole(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { id } = UuidParamSchema.parse(request.params);
    const { role } = request.body as { role: string };
    const user = await this.usersService.updateRole(id, role);
    return reply.send({ success: true, data: user });
  }

  async updateMe(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { sub } = request.user as JwtPayload;
    const body = UpdateProfileSchema.parse(request.body);
    const user = await this.usersService.updateProfile(sub, body);
    return reply.send({ success: true, data: user });
  }

  async getSocials(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { sub } = request.user as JwtPayload;
    const socials = await this.usersService.getSocials(sub);
    return reply.send({ success: true, data: socials });
  }

  async addSocial(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { sub } = request.user as JwtPayload;
    const body = AddSocialSchema.parse(request.body);
    const social = await this.usersService.addSocial(sub, body);
    return reply.status(201).send({ success: true, data: social });
  }

  async deleteSocial(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { id } = UuidParamSchema.parse(request.params);
    await this.usersService.deleteSocial(id);
    return reply.status(204).send();
  }

  async lookingForTeam(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const q = MatchmakingQuerySchema.parse(request.query);
    const users = await this.usersService.lookingForTeam(q.hackathon_id, q.skills);
    return reply.send({ success: true, data: users });
  }
}

