/**
 * Status-transition service.
 *
 * Runs every minute (called by status-cron.worker) to automatically
 * transition hackathon lifecycle statuses based on stage dates:
 *
 *   DRAFT → PUBLISHED  when REGISTRATION stage startDate <= now
 *   PUBLISHED → ARCHIVED  when FINISHED stage endDate <= now
 *
 * Also writes the currently-active stage to Redis for fast enrichment.
 */
import { getDatabaseConnection } from '../config/database';
import { getRedisClient } from '../config/redis';
import { hackathons, stages } from '../drizzle/schema';
import { ne, eq } from 'drizzle-orm';
import {
  findActiveStageForHackathon,
  STAGE_REGISTRATION,
  STAGE_FINISHED,
  type HackathonLifecycleStatus,
} from './stage-utils';

export const ACTIVE_STAGE_CACHE_TTL = 60; // seconds

/** Redis cache key for a hackathon's active stage. */
export function activeStageKey(hackathonId: string): string {
  return `hackathon:${hackathonId}:active_stage`;
}

export interface TransitionResult {
  hackathonId: string;
  title: string;
  previousStatus: HackathonLifecycleStatus;
  newStatus: HackathonLifecycleStatus;
  triggeredBy: string;
  at: Date;
}

export async function runStatusTransitions(): Promise<TransitionResult[]> {
  const db = getDatabaseConnection();
  const redis = getRedisClient();
  const now = new Date();
  const results: TransitionResult[] = [];

  // Fetch all non-ARCHIVED hackathons with their stages in one query
  const hackathonsWithStages = await db
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

  // Group into map
  const map = new Map<string, {
    id: string;
    title: string;
    status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
    stages: Array<{ id: string; name: string; startDate: Date; endDate: Date; orderIndex: number }>;
  }>();

  for (const row of hackathonsWithStages) {
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

  for (const hackathon of map.values()) {
    try {
      let newStatus: HackathonLifecycleStatus | null = null;
      let triggeredBy: string | null = null;

      if (hackathon.status === 'DRAFT') {
        const regStage = hackathon.stages.find((s) => s.name === STAGE_REGISTRATION);
        if (regStage && now >= regStage.startDate) {
          newStatus = 'PUBLISHED';
          triggeredBy = 'REGISTRATION stage started';
        }
      } else if (hackathon.status === 'PUBLISHED') {
        const finishedStage = hackathon.stages.find((s) => s.name === STAGE_FINISHED);
        if (finishedStage && now >= finishedStage.endDate) {
          newStatus = 'ARCHIVED';
          triggeredBy = 'FINISHED stage ended';
        }
      }

      if (newStatus !== null && newStatus !== hackathon.status) {
        await db
          .update(hackathons)
          .set({ status: newStatus, updatedAt: now })
          .where(eq(hackathons.id, hackathon.id));

        const result: TransitionResult = {
          hackathonId: hackathon.id,
          title: hackathon.title,
          previousStatus: hackathon.status,
          newStatus,
          triggeredBy: triggeredBy!,
          at: now,
        };
        results.push(result);
        console.info(
          `[status-cron] "${hackathon.title}": ${hackathon.status} → ${newStatus} (${triggeredBy})`,
        );
      }

      // Update active-stage Redis cache regardless of status change
      const activeStage = findActiveStageForHackathon(hackathon.stages, now);
      if (activeStage) {
        void redis
          .set(activeStageKey(hackathon.id), JSON.stringify(activeStage), 'EX', ACTIVE_STAGE_CACHE_TTL)
          .catch((err: unknown) => console.error('[status-cron] Redis set failed:', err));
      }
    } catch (err) {
      // Isolate per-hackathon failures — one failure won't block others
      console.error(`[status-cron] Error processing hackathon ${hackathon.id}:`, err);
    }
  }

  return results;
}
