import type { UsersRepository } from './users.repository';
import { NotFoundError, ConflictError } from '../../common/errors/http-errors';
import type { UpdateProfileDto, AddSocialDto } from './users.schema';

export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  async list(page: number, limit: number, search?: string, role?: string, lookingForTeam?: boolean) {
    const { rows, total } = await this.usersRepository.findAll(page, limit, search, role, lookingForTeam);
    const safeRows = rows.map(({ passwordHash: _, ...u }) => u);
    return {
      data: safeRows,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getProfile(id: string) {
    const user = await this.usersRepository.findById(id);
    if (!user) throw new NotFoundError('User');
    const { passwordHash: _, ...safe } = user;
    return safe;
  }

  async updateProfile(id: string, dto: UpdateProfileDto) {
    if (dto.username) {
      const existing = await this.usersRepository.findByUsername(dto.username);
      if (existing && existing.id !== id) throw new ConflictError('Username is already taken');
    }
    const updated = await this.usersRepository.updateProfile(id, dto);
    if (!updated) throw new NotFoundError('User');
    return this.getProfile(id);
  }

  async updateRole(id: string, role: string) {
    const updated = await this.usersRepository.updateRole(id, role);
    if (!updated) throw new NotFoundError('User');
    const { passwordHash: _, ...safe } = updated as any; // findById returns type with optional passwordHash
    return safe;
  }

  async getSocials(userId: string) {
    return this.usersRepository.getSocials(userId);
  }

  async addSocial(userId: string, dto: AddSocialDto) {
    return this.usersRepository.addSocial(userId, dto);
  }

  async deleteSocial(socialId: string) {
    await this.usersRepository.deleteSocial(socialId);
  }

  async lookingForTeam(hackathonId?: string, skills?: string[]) {
    const rows = await this.usersRepository.findLookingForTeam(hackathonId, skills);
    return rows.map(({ passwordHash: _, ...u }) => u);
  }

  async softDelete(id: string) {
    await this.usersRepository.findById(id); // throws 404 if not found
    await this.usersRepository.softDelete(id);
  }
}

