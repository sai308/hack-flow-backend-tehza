import type { Database } from '../../config/database';
import { hackathons, stages, tracks, awards, teams, teamMembers, users } from '../../drizzle/schema';
import { eq, desc, count, lt, gt, and, or, lte, gte, inArray, ne, ilike, sql, countDistinct, exists, notExists } from 'drizzle-orm';
import type { CreateHackathonDto, UpdateHackathonDto, CreateTrackDto, CreateStageDto } from './hackathons.schema';

export type HackathonStatus = 'upcoming' | 'active' | 'past';

export class HackathonsRepository {
  constructor(private readonly db: Database) {}

  async findAll(
    page: number,
    limit: number,
    status?: HackathonStatus,
    tagIds?: string[],
    publishStatus?: string,
    search?: string,
    createdBy?: string, // if set, filter only hackathons owned by this user (organizer)
  ) {
    const offset = (page - 1) * limit;
    const now = new Date();

    const filters = [];

    if (status === 'upcoming') {
      filters.push(gt(hackathons.startDate, now));
    } else if (status === 'active') {
      filters.push(and(
        lte(hackathons.startDate, now),
        gte(hackathons.endDate, now),
        notExists(
          this.db.select()
            .from(stages)
            .where(and(
              eq(stages.hackathonId, hackathons.id),
              eq(stages.type, 'FINISHED'),
              lte(stages.startDate, now),
              gte(stages.endDate, now)
            ))
        )
      ));
    } else if (status === 'past') {
      filters.push(or(
        lt(hackathons.endDate, now),
        exists(
          this.db.select()
            .from(stages)
            .where(and(
              eq(stages.hackathonId, hackathons.id),
              eq(stages.type, 'FINISHED'),
              lte(stages.startDate, now),
              gte(stages.endDate, now)
            ))
        )
      ));
    }

    if (tagIds && tagIds.length > 0) filters.push(inArray(hackathons.id, tagIds));
    if (publishStatus) filters.push(eq(hackathons.status, publishStatus as any));
    if (search) filters.push(ilike(hackathons.title, `%${search}%`));
    if (createdBy) filters.push(eq(hackathons.createdBy, createdBy));

    const whereClause = filters.length > 0 ? and(...filters) : undefined;

    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select({
          hackathon: hackathons,
          teamsCount: countDistinct(teams.id),
          participantsCount: countDistinct(teamMembers.id),
          awardsCount: countDistinct(awards.id),
          activeStageType: sql<string | null>`(SELECT type FROM ${stages} WHERE ${stages.hackathonId} = ${hackathons.id} AND ${stages.startDate} <= ${now} AND ${stages.endDate} >= ${now} LIMIT 1)`,
          activeStageName: sql<string | null>`(SELECT name FROM ${stages} WHERE ${stages.hackathonId} = ${hackathons.id} AND ${stages.startDate} <= ${now} AND ${stages.endDate} >= ${now} LIMIT 1)`,
          ownerFullName: sql<string | null>`(SELECT full_name FROM users WHERE id = ${hackathons.createdBy} LIMIT 1)`,
          ownerRole: sql<string | null>`(SELECT r.name FROM user_roles ur JOIN roles r ON ur.role_id = r.id WHERE ur.user_id = ${hackathons.createdBy} LIMIT 1)`,
        })
        .from(hackathons)
        .leftJoin(teams, eq(hackathons.id, teams.hackathonId))
        .leftJoin(teamMembers, eq(teams.id, teamMembers.teamId))
        .leftJoin(awards, eq(hackathons.id, awards.hackathonId))
        .where(whereClause)
        .groupBy(hackathons.id)
        .orderBy(desc(hackathons.createdAt))
        .limit(limit)
        .offset(offset),
      this.db.select({ total: count() }).from(hackathons).where(whereClause),
    ]);
    
    return { 
      rows: rows.map(r => ({ 
        ...r.hackathon, 
        activeStage: (r.activeStageType && r.activeStageType !== 'null')
          ? { type: r.activeStageType, name: r.activeStageName }
          : undefined,
        ownerFullName: (r.ownerFullName && r.ownerFullName !== 'null') ? r.ownerFullName : null,
        ownerRole: (r.ownerRole && r.ownerRole !== 'null') ? r.ownerRole : null,
        _count: { 
          teams: Number(r.teamsCount),
          participants: Number(r.participantsCount),
          awards: Number(r.awardsCount)
        } 
      })), 
      total: Number(total) 
    };
  }

  async findById(id: string) {
    const [row, tracksList, stagesList, awardsList, teamsCountData, participantsCountData] = await Promise.all([
      this.db.select().from(hackathons).where(eq(hackathons.id, id)).limit(1),
      this.db.select().from(tracks).where(eq(tracks.hackathonId, id)),
      this.db.select().from(stages).where(eq(stages.hackathonId, id)).orderBy(stages.orderIndex),
      this.db.select().from(awards).where(eq(awards.hackathonId, id)),
      this.db.select({ count: count() }).from(teams).where(eq(teams.hackathonId, id)),
      this.db
        .select({ count: count() })
        .from(teamMembers)
        .innerJoin(teams, eq(teamMembers.teamId, teams.id))
        .where(eq(teams.hackathonId, id)),
    ]);

    const hackathonRow = row[0];
    if (!hackathonRow) return null;

    return {
      ...hackathonRow,
      tracks: tracksList,
      stages: stagesList,
      awards: awardsList,
      _count: {
        teams: Number(teamsCountData[0]?.count ?? 0),
        participants: Number(participantsCountData[0]?.count ?? 0),
        projects: 0,
      },
    };
  }

  async create(data: CreateHackathonDto & { createdBy?: string }) {
    return this.db.transaction(async (tx) => {
      const { tags, tracks: inputTracks, stages: inputStages, awards: inputAwards, createdBy, ...hackathonData } = data;

      const [row] = await tx
        .insert(hackathons)
        .values({
          ...hackathonData,
          createdBy: createdBy ?? null,
          startDate: new Date(hackathonData.startDate),
          endDate: new Date(hackathonData.endDate),
        })
        .returning();

      if (inputTracks && inputTracks.length > 0) {
        await tx.insert(tracks).values(
          inputTracks.map((t) => ({ ...t, hackathonId: row.id }))
        );
      }

      if (inputStages && inputStages.length > 0) {
        await tx.insert(stages).values(
          inputStages.map((s) => ({
            ...s,
            startDate: new Date(s.startDate),
            endDate: new Date(s.endDate),
            hackathonId: row.id,
          }))
        );
      }

      if (inputAwards && inputAwards.length > 0) {
        await tx.insert(awards).values(
          inputAwards.map((a) => ({ ...a, hackathonId: row.id }))
        );
      }

      return row;
    });
  }

  async update(id: string, data: UpdateHackathonDto) {
    const values: Record<string, unknown> = { ...data, updatedAt: new Date() };
    if (data.startDate) values.startDate = new Date(data.startDate);
    if (data.endDate) values.endDate = new Date(data.endDate);
    const [row] = await this.db.update(hackathons).set(values).where(eq(hackathons.id, id)).returning();
    return row ?? null;
  }

  async remove(id: string) {
    await this.db.delete(hackathons).where(eq(hackathons.id, id));
  }

  // ── Tracks ──────────────────────────────────────────────
  async findTracks(hackathonId: string) {
    return this.db.select().from(tracks).where(eq(tracks.hackathonId, hackathonId));
  }

  async createTrack(hackathonId: string, data: CreateTrackDto) {
    const [row] = await this.db.insert(tracks).values({ hackathonId, ...data }).returning();
    return row;
  }

  async deleteTrack(id: string) {
    await this.db.delete(tracks).where(eq(tracks.id, id));
  }

  // ── Stages ──────────────────────────────────────────────
  async findStages(hackathonId: string) {
    return this.db.select().from(stages).where(eq(stages.hackathonId, hackathonId));
  }

  async createStage(hackathonId: string, data: CreateStageDto) {
    const [row] = await this.db
      .insert(stages)
      .values({
        hackathonId,
        ...data,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
      })
      .returning();
    return row;
  }

  async deleteStage(id: string) {
    await this.db.delete(stages).where(eq(stages.id, id));
  }

  // ── Status transitions ──────────────────────────────────────

  async findHackathonsForStatusCheck() {
    const rows = await this.db
      .select({
        id: hackathons.id,
        title: hackathons.title,
        status: hackathons.status,
        stageId: stages.id,
        stageName: stages.name,
        stageStart: stages.startDate,
        stageEnd: stages.endDate,
        stageOrder: stages.orderIndex,
      })
      .from(hackathons)
      .leftJoin(stages, eq(stages.hackathonId, hackathons.id))
      .where(ne(hackathons.status, 'ARCHIVED'))
      .orderBy(hackathons.createdAt, stages.orderIndex);

    const map = new Map<string, {
      id: string;
      title: string;
      status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
      stages: Array<{ id: string; name: string; startDate: Date; endDate: Date; orderIndex: number }>;
    }>();

    for (const row of rows) {
      if (!map.has(row.id)) {
        map.set(row.id, { id: row.id, title: row.title, status: row.status, stages: [] });
      }
      if (row.stageId) {
        map.get(row.id)!.stages.push({
          id: row.stageId,
          name: row.stageName!,
          startDate: row.stageStart!,
          endDate: row.stageEnd!,
          orderIndex: row.stageOrder!,
        });
      }
    }

    return [...map.values()];
  }

  async updateStatus(id: string, status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED') {
    const [row] = await this.db
      .update(hackathons)
      .set({ status, updatedAt: new Date() })
      .where(eq(hackathons.id, id))
      .returning();
    return row ?? null;
  }

  async findWithStages(id: string) {
    const h = await this.findById(id);
    if (!h) return null;
    const hackathonStages = await this.db
      .select()
      .from(stages)
      .where(eq(stages.hackathonId, id))
      .orderBy(stages.orderIndex);
    return { ...h, stages: hackathonStages };
  }

  async countStages(hackathonId: string) {
    const [{ total }] = await this.db
      .select({ total: count() })
      .from(stages)
      .where(eq(stages.hackathonId, hackathonId));
    return Number(total);
  }

  async updateTrack(id: string, data: any) {
    const [row] = await this.db.update(tracks).set(data).where(eq(tracks.id, id)).returning();
    return row ?? null;
  }

  async findStageById(id: string) {
    const [row] = await this.db.select().from(stages).where(eq(stages.id, id)).limit(1);
    return row ?? null;
  }

  async updateStage(id: string, data: any) {
    const [row] = await this.db.update(stages).set(data).where(eq(stages.id, id)).returning();
    return row ?? null;
  }

  async updateAward(id: string, data: any) {
    const [row] = await this.db.update(awards).set(data).where(eq(awards.id, id)).returning();
    return row ?? null;
  }

  /** Find track by id (to resolve hackathon ownership for organizer checks) */
  async findTrackById(id: string) {
    const [row] = await this.db.select().from(tracks).where(eq(tracks.id, id)).limit(1);
    return row ?? null;
  }
}
