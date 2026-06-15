import { env } from '../config/env';
import { getRedisClient } from '../config/redis';

/** Redis sorted-set key for reminder jobs. */
export const REMINDER_KEY = 'mentor:reminders';

/** Payload stored per job in the ZSET. */
export interface ReminderJob {
  slotId: string;
  teamId: string;
  mentorId: string;
  startTime: string; // ISO string
  meetingLink: string | null;
}

/**
 * Schedule a reminder email for a mentor slot.
 * Score = Unix-ms timestamp at which the reminder should be sent.
 * Silently skips if the slot starts in less than REMINDER_MINUTES_BEFORE minutes.
 */
export async function scheduleReminder(job: ReminderJob): Promise<void> {
  const minutesBefore = env.REMINDER_MINUTES_BEFORE;
  const sendAt = new Date(job.startTime).getTime() - minutesBefore * 60_000;

  if (sendAt <= Date.now()) {
    // Slot is too soon or already past — skip quietly
    return;
  }

  const redis = getRedisClient();
  await redis.zadd(REMINDER_KEY, sendAt, JSON.stringify(job));
}

/**
 * Remove a reminder from the ZSET by slotId.
 * Used when a slot is cancelled after being scheduled.
 * Does nothing if the slotId is not found.
 */
export async function cancelReminder(slotId: string): Promise<void> {
  const redis = getRedisClient();
  const members = await redis.zrange(REMINDER_KEY, 0, -1);
  const toRemove = members.filter((m) => {
    try {
      const job = JSON.parse(m) as Partial<ReminderJob>;
      return job.slotId === slotId;
    } catch {
      return false;
    }
  });
  if (toRemove.length > 0) {
    await redis.zrem(REMINDER_KEY, ...toRemove);
  }
}

/**
 * Atomically fetch and remove all jobs due by now.
 * Uses a MULTI/EXEC transaction so no job is processed twice even under
 * concurrent worker instances.
 */
export async function popDueReminders(): Promise<ReminderJob[]> {
  const redis = getRedisClient();
  const nowMs = Date.now();

  // Use a pipeline to fetch + remove atomically
  const pipeline = redis.multi();
  pipeline.zrangebyscore(REMINDER_KEY, 0, nowMs, 'LIMIT', 0, 50);
  pipeline.zremrangebyscore(REMINDER_KEY, 0, nowMs);
  const results = await pipeline.exec();

  // results[0] is the ZRANGEBYSCORE result
  const members = (results?.[0]?.[1] as string[]) ?? [];
  return members
    .map((m) => {
      try {
        return JSON.parse(m) as ReminderJob;
      } catch {
        return null;
      }
    })
    .filter((j): j is ReminderJob => j !== null);
}
