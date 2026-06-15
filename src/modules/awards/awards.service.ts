import { AwardsRepository } from './awards.repository';
import { NotFoundError, ConflictError } from '../../common/errors/http-errors';
import type { CreateAwardDto, UpdateAwardDto, CreatePhysicalGiftDto } from './awards.schema';

export class AwardsService {
  constructor(private readonly repo: AwardsRepository) {}

  // ── Awards ────────────────────────────────────────────────────

  async listByHackathon(hackathonId: string) {
    return this.repo.findByHackathon(hackathonId);
  }

  async create(hackathonId: string, dto: CreateAwardDto) {
    return this.repo.create(hackathonId, dto);
  }

  async update(hackathonId: string, id: string, dto: UpdateAwardDto) {
    const award = await this.repo.findById(id);
    if (!award) throw new NotFoundError('Award not found');
    if (award.hackathonId !== hackathonId) throw new NotFoundError('Award not found in this hackathon');
    const updated = await this.repo.update(id, dto);
    return updated!;
  }

  async remove(hackathonId: string, id: string) {
    const award = await this.repo.findById(id);
    if (!award) throw new NotFoundError('Award not found');
    if (award.hackathonId !== hackathonId) throw new NotFoundError('Award not found in this hackathon');
    await this.repo.remove(id);
  }

  // ── Physical Gifts ─────────────────────────────────────────────

  async addGift(hackathonId: string, awardId: string, dto: CreatePhysicalGiftDto) {
    const award = await this.repo.findById(awardId);
    if (!award) throw new NotFoundError('Award not found');
    if (award.hackathonId !== hackathonId) throw new NotFoundError('Award not found in this hackathon');
    return this.repo.addGift(awardId, dto);
  }

  async removeGift(hackathonId: string, awardId: string, giftId: string) {
    const award = await this.repo.findById(awardId);
    if (!award) throw new NotFoundError('Award not found');
    if (award.hackathonId !== hackathonId) throw new NotFoundError('Award not found in this hackathon');
    const gift = await this.repo.findGiftById(giftId);
    if (!gift || gift.awardId !== awardId) throw new NotFoundError('Physical gift not found');
    await this.repo.removeGift(giftId);
  }

  // ── Team Awards ────────────────────────────────────────────────

  async assignToTeam(teamId: string, awardId: string) {
    const award = await this.repo.findById(awardId);
    if (!award) throw new NotFoundError('Award not found');
    const existing = await this.repo.findTeamAward(teamId, awardId);
    if (existing) throw new ConflictError('Award already assigned to this team');
    return this.repo.assignToTeam(teamId, awardId);
  }
}
