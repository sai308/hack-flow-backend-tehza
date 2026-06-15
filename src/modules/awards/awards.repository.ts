import type { Database } from '../../config/database';
import { awards, physicalGifts, teamAwards } from '../../drizzle/schema';
import { eq, and } from 'drizzle-orm';
import type { CreateAwardDto, UpdateAwardDto, CreatePhysicalGiftDto } from './awards.schema';

export class AwardsRepository {
  constructor(private readonly db: Database) {}

  // ── Awards ────────────────────────────────────────────────────

  async findByHackathon(hackathonId: string) {
    return this.db.select().from(awards).where(eq(awards.hackathonId, hackathonId));
  }

  async findById(id: string) {
    const [row] = await this.db.select().from(awards).where(eq(awards.id, id)).limit(1);
    return row ?? null;
  }

  async create(hackathonId: string, data: CreateAwardDto) {
    const [row] = await this.db.insert(awards).values({ hackathonId, ...data }).returning();
    return row;
  }

  async update(id: string, data: UpdateAwardDto) {
    const [row] = await this.db.update(awards).set(data).where(eq(awards.id, id)).returning();
    return row ?? null;
  }

  async remove(id: string) {
    await this.db.delete(awards).where(eq(awards.id, id));
  }

  // ── Physical Gifts ─────────────────────────────────────────────

  async findGiftsByAward(awardId: string) {
    return this.db.select().from(physicalGifts).where(eq(physicalGifts.awardId, awardId));
  }

  async addGift(awardId: string, data: CreatePhysicalGiftDto) {
    const [row] = await this.db.insert(physicalGifts).values({ awardId, ...data }).returning();
    return row;
  }

  async findGiftById(giftId: string) {
    const [row] = await this.db.select().from(physicalGifts).where(eq(physicalGifts.id, giftId)).limit(1);
    return row ?? null;
  }

  async removeGift(giftId: string) {
    await this.db.delete(physicalGifts).where(eq(physicalGifts.id, giftId));
  }

  // ── Team Awards ────────────────────────────────────────────────

  async findTeamAward(teamId: string, awardId: string) {
    const [row] = await this.db
      .select()
      .from(teamAwards)
      .where(and(eq(teamAwards.teamId, teamId), eq(teamAwards.awardId, awardId)))
      .limit(1);
    return row ?? null;
  }

  async assignToTeam(teamId: string, awardId: string) {
    const [row] = await this.db.insert(teamAwards).values({ teamId, awardId }).returning();
    return row;
  }

  async removeTeamAward(teamId: string, awardId: string) {
    await this.db
      .delete(teamAwards)
      .where(and(eq(teamAwards.teamId, teamId), eq(teamAwards.awardId, awardId)));
  }
}
