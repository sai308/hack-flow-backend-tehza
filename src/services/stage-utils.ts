/**
 * Pure function: given a list of stages and a reference time, returns:
 *   - The currently active stage (startDate <= now <= endDate)
 *   - If none is active, the next upcoming stage (closest startDate in future)
 *   - If all stages are past, the last stage by orderIndex
 *   - null if no stages provided
 *
 * This is a pure function with no DB dependency — easy to unit test.
 */
export interface StageSnapshot {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  orderIndex: number;
}

export function findActiveStageForHackathon(
  stages: StageSnapshot[],
  now: Date,
): StageSnapshot | null {
  if (stages.length === 0) return null;

  // 1. Stage currently in progress
  const active = stages.find((s) => s.startDate <= now && s.endDate >= now);
  if (active) return active;

  // 2. Next upcoming stage (closest start in future)
  const upcoming = stages
    .filter((s) => s.startDate > now)
    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())[0];
  if (upcoming) return upcoming;

  // 3. All stages are in the past — return last by orderIndex
  return stages.slice().sort((a, b) => b.orderIndex - a.orderIndex)[0] ?? null;
}

/** Hackathon lifecycle statuses stored in the DB. */
export type HackathonLifecycleStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

/** Stage names that trigger automatic status transitions. */
export const STAGE_REGISTRATION = 'REGISTRATION';
export const STAGE_FINISHED = 'FINISHED';
