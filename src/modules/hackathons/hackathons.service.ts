import type { HackathonsRepository, HackathonStatus } from './hackathons.repository';
import { BadRequestError, NotFoundError } from '../../common/errors/http-errors';
import type {
  CreateHackathonDto,
  UpdateHackathonDto,
  CreateTrackDto,
  CreateStageDto,
} from './hackathons.schema';
import type { HackathonTagsRepository } from '../hackathon-tags/hackathon-tags.repository';
import { getRedisClient } from '../../config/redis';
import { activeStageKey, ACTIVE_STAGE_CACHE_TTL } from '../../services/status-transition.service';
import { findActiveStageForHackathon } from '../../services/stage-utils';
import type { AuditLogRepository } from '../audit-log/audit-log.repository';

// Error thrown when an organizer tries to access a hackathon they don't own
class ForbiddenError extends Error {
  statusCode = 403;
  constructor(msg = 'Forbidden') { super(msg); this.name = 'ForbiddenError'; }
}

export class HackathonsService {
  constructor(
    private readonly repo: HackathonsRepository,
    private readonly tagsRepo?: HackathonTagsRepository,
    private readonly auditLog?: AuditLogRepository,
  ) {}

  async list(
    page: number,
    limit: number,
    status?: HackathonStatus,
    tagNames?: string[],
    publishStatus?: string,
    search?: string,
    createdBy?: string, // organizer sees only their own hackathons
  ) {
    let tagIds: string[] | undefined;
    if (tagNames && tagNames.length > 0 && this.tagsRepo) {
      tagIds = await this.tagsRepo.findHackathonsByTags(tagNames);
      if (tagIds.length === 0) {
        return { data: [], meta: { total: 0, page, limit, totalPages: 0 } };
      }
    }

    const { rows, total } = await this.repo.findAll(page, limit, status, tagIds, publishStatus, search, createdBy);

    let enriched: Array<(typeof rows)[number] & { tags: Array<{ id: string; name: string }> }> = [];
    if (this.tagsRepo && rows.length > 0) {
      const tagsMap = await this.tagsRepo.findTagsForHackathons(rows.map((r) => r.id));
      enriched = rows.map((r) => ({ ...r, tags: tagsMap.get(r.id) ?? [] }));
    } else {
      enriched = rows.map((r) => ({ ...r, tags: [] }));
    }

    return {
      data: enriched,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async getById(id: string) {
    const h = await this.repo.findById(id);
    if (!h) throw new NotFoundError('Hackathon');

    const tags = this.tagsRepo
      ? (await this.tagsRepo.findTagsForHackathons([id])).get(id) ?? []
      : [];

    let activeStage: object | null = null;
    try {
      const redis = getRedisClient();
      const cached = await redis.get(activeStageKey(id));
      if (cached) {
        activeStage = JSON.parse(cached) as object;
      } else {
        const withStages = await this.repo.findWithStages(id);
        if (withStages?.stages?.length) {
          const stageSnapshots = withStages.stages.map((s) => ({
            id: s.id,
            name: s.name,
            startDate: s.startDate,
            endDate: s.endDate,
            orderIndex: s.orderIndex,
          }));
          activeStage = findActiveStageForHackathon(stageSnapshots, new Date());
          if (activeStage) {
            void redis
              .set(activeStageKey(id), JSON.stringify(activeStage), 'EX', ACTIVE_STAGE_CACHE_TTL)
              .catch(() => undefined);
          }
        }
      }
    } catch {
      // Redis unavailable
    }

    return { ...h, tags, activeStage };
  }

  /** Assert the caller owns the hackathon (admins are always allowed). */
  private async assertOwner(hackathonId: string, userId: string, isAdmin: boolean) {
    if (isAdmin) return;
    const h = await this.repo.findById(hackathonId);
    if (!h) throw new NotFoundError('Hackathon');
    if (h.createdBy !== userId) {
      throw new ForbiddenError('You can only manage your own hackathons');
    }
  }

  async create(dto: CreateHackathonDto, createdBy?: string) {
    const created = await this.repo.create({ ...dto, createdBy });
    
    if (dto.tags && dto.tags.length > 0 && this.tagsRepo) {
      const tagNames = dto.tags.filter(t => t.trim().length > 0);
      if (tagNames.length > 0) {
        const finalTagIds: string[] = [];
        for (const name of tagNames) {
          let tag = await this.tagsRepo.findTagByName(name);
          if (!tag) tag = await this.tagsRepo.createTag(name);
          finalTagIds.push(tag.id);
        }
        await this.tagsRepo.attachTags(created.id, finalTagIds);
      }
    }
    
    return created;
  }

  async update(id: string, dto: UpdateHackathonDto, userId?: string, isAdmin = true) {
    await this.assertOwner(id, userId ?? '', isAdmin);
    const updated = await this.repo.update(id, dto);
    if (!updated) throw new NotFoundError('Hackathon');
    return updated;
  }

  async remove(id: string, userId?: string, isAdmin = true) {
    await this.assertOwner(id, userId ?? '', isAdmin);
    await this.repo.remove(id);
  }

  async listTracks(hackathonId: string) {
    await this.getById(hackathonId);
    return this.repo.findTracks(hackathonId);
  }

  async createTrack(hackathonId: string, dto: CreateTrackDto, userId?: string, isAdmin = true) {
    await this.assertOwner(hackathonId, userId ?? '', isAdmin);
    return this.repo.createTrack(hackathonId, dto);
  }

  async deleteTrack(id: string, userId?: string, isAdmin = true) {
    if (!isAdmin && userId) {
      // Resolve hackathon from track
      const track = await this.repo.findTrackById(id);
      if (track) await this.assertOwner(track.hackathonId, userId, false);
    }
    await this.repo.deleteTrack(id);
  }

  async updateTrack(id: string, dto: any, userId?: string, isAdmin = true) {
    if (!isAdmin && userId) {
      const track = await this.repo.findTrackById(id);
      if (track) await this.assertOwner(track.hackathonId, userId, false);
    }
    return this.repo.updateTrack(id, dto);
  }

  async listStages(hackathonId: string) {
    await this.getById(hackathonId);
    return this.repo.findStages(hackathonId);
  }

  async createStage(hackathonId: string, dto: CreateStageDto, userId?: string, isAdmin = true) {
    await this.assertOwner(hackathonId, userId ?? '', isAdmin);
    const h = await this.getById(hackathonId);

    const stageStart = new Date(dto.startDate);
    const stageEnd   = new Date(dto.endDate);
    const hackStart  = new Date(h.startDate);
    const hackEnd    = new Date(h.endDate);

    if (stageStart >= stageEnd) {
      throw new BadRequestError('Дата початку стадії має бути раніше дати завершення');
    }
    if (stageStart < hackStart || stageEnd > hackEnd) {
      throw new BadRequestError(
        `Стадія виходить за межі хакатону (${hackStart.toLocaleDateString('uk')} — ${hackEnd.toLocaleDateString('uk')})`,
      );
    }

    return this.repo.createStage(hackathonId, dto);
  }

  async deleteStage(id: string, userId?: string, isAdmin = true) {
    if (!isAdmin && userId) {
      const stage = await this.repo.findStageById(id);
      if (stage) await this.assertOwner(stage.hackathonId, userId, false);
    }
    await this.repo.deleteStage(id);
  }

  async updateStage(id: string, dto: any, userId?: string, isAdmin = true) {
    if (!isAdmin && userId) {
      const stage = await this.repo.findStageById(id);
      if (stage) await this.assertOwner(stage.hackathonId, userId, false);
    }

    if (dto.startDate || dto.endDate) {
      const existing = await this.repo.findStageById(id);
      if (existing) {
        const stageStart = dto.startDate ? new Date(dto.startDate) : existing.startDate;
        const stageEnd   = dto.endDate   ? new Date(dto.endDate)   : existing.endDate;
        const h = await this.repo.findById(existing.hackathonId);

        if (h) {
          const hackStart = new Date(h.startDate);
          const hackEnd   = new Date(h.endDate);

          if (stageStart >= stageEnd) {
            throw new BadRequestError('Дата початку стадії має бути раніше дати завершення');
          }
          if (stageStart < hackStart || stageEnd > hackEnd) {
            throw new BadRequestError(
              `Стадія виходить за межі хакатону (${hackStart.toLocaleDateString('uk')} — ${hackEnd.toLocaleDateString('uk')})`,
            );
          }
        }
      }
    }

    const stageDto = { ...dto };
    if (stageDto.startDate) stageDto.startDate = new Date(stageDto.startDate);
    if (stageDto.endDate)   stageDto.endDate   = new Date(stageDto.endDate);
    return this.repo.updateStage(id, stageDto);
  }

  async updateAward(id: string, dto: any) {
    return this.repo.updateAward(id, dto);
  }

  async overrideStatus(
    hackathonId: string,
    newStatus: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED',
    userId: string,
    isAdmin = true,
  ) {
    await this.assertOwner(hackathonId, userId, isAdmin);
    const h = await this.repo.findById(hackathonId);
    if (!h) throw new NotFoundError('Hackathon');

    if (newStatus === 'PUBLISHED') {
      const stageCount = await this.repo.countStages(hackathonId);
      if (stageCount === 0) {
        throw new BadRequestError('Cannot publish hackathon with no stages defined');
      }
    }

    const updated = await this.repo.updateStatus(hackathonId, newStatus);

    try {
      const redis = getRedisClient();
      await redis.del(activeStageKey(hackathonId));
    } catch { /* Redis unavailable */ }

    this.auditLog
      ?.log(userId, 'hackathon_status_override', 'hackathon', hackathonId)
      .catch(() => undefined);

    console.info(`[status-override] User ${userId}: hackathon ${hackathonId} → ${newStatus}`);
    return updated;
  }
}
