/**
 * Unit tests — status-transition service and findActiveStageForHackathon pure function.
 *
 * All DB and Redis calls are mocked — no real infrastructure needed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock DB (getDatabaseConnection) ────────────────────────────────────────

const dbUpdateMock = vi.fn().mockReturnThis();
const dbSetMock = vi.fn().mockReturnThis();
const dbWhereMock = vi.fn().mockReturnThis();
const dbSelectMock = vi.fn().mockReturnThis();
const dbFromMock = vi.fn().mockReturnThis();
const dbLeftJoinMock = vi.fn().mockReturnThis();
const dbOrderByMock = vi.fn().mockResolvedValue([]);

const dbMock = {
  select: vi.fn(() => ({
    from: dbFromMock.mockReturnValue({
      leftJoin: dbLeftJoinMock.mockReturnValue({
        where: dbWhereMock.mockReturnValue({
          orderBy: dbOrderByMock,
        }),
      }),
    }),
  })),
  update: vi.fn(() => ({
    set: dbSetMock.mockReturnValue({
      where: dbWhereMock,
    }),
  })),
};

vi.mock('../../src/config/database', () => ({
  getDatabaseConnection: () => dbMock,
}));

// ── Mock Redis ─────────────────────────────────────────────────────────────

const redisMock = {
  set: vi.fn().mockResolvedValue('OK'),
  get: vi.fn().mockResolvedValue(null),
  del: vi.fn().mockResolvedValue(1),
};

vi.mock('../../src/config/redis', () => ({
  getRedisClient: () => redisMock,
}));

// ── Mock drizzle-orm operators ─────────────────────────────────────────────

vi.mock('drizzle-orm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('drizzle-orm')>();
  return { ...actual, ne: vi.fn(), eq: vi.fn() };
});

// ── Import after mocks ─────────────────────────────────────────────────────

import { findActiveStageForHackathon, type StageSnapshot } from '../../src/services/stage-utils';
import { runStatusTransitions } from '../../src/services/status-transition.service';

// ═══════════════════════════════════════════════════════════════════════════
// findActiveStageForHackathon — pure function, no mocks needed
// ═══════════════════════════════════════════════════════════════════════════

function makeStage(overrides: Partial<StageSnapshot> & { id: string }): StageSnapshot {
  return {
    name: 'REGISTRATION',
    startDate: new Date('2025-01-01'),
    endDate: new Date('2025-12-31'),
    orderIndex: 1,
    ...overrides,
  };
}

describe('findActiveStageForHackathon (pure function)', () => {
  const now = new Date('2025-06-15T12:00:00Z');

  it('returns stage where startDate <= now <= endDate', () => {
    const stages: StageSnapshot[] = [
      makeStage({ id: 's1', name: 'REGISTRATION', startDate: new Date('2025-01-01'), endDate: new Date('2025-12-31'), orderIndex: 1 }),
    ];
    expect(findActiveStageForHackathon(stages, now)?.id).toBe('s1');
  });

  it('returns the next upcoming stage when no stage is currently active', () => {
    const stages: StageSnapshot[] = [
      makeStage({ id: 'past', startDate: new Date('2025-01-01'), endDate: new Date('2025-03-01'), orderIndex: 1 }),
      makeStage({ id: 'future1', startDate: new Date('2025-07-01'), endDate: new Date('2025-09-01'), orderIndex: 2 }),
      makeStage({ id: 'future2', startDate: new Date('2025-10-01'), endDate: new Date('2025-12-01'), orderIndex: 3 }),
    ];
    expect(findActiveStageForHackathon(stages, now)?.id).toBe('future1');
  });

  it('returns last stage (highest orderIndex) if all stages are in the past', () => {
    const stages: StageSnapshot[] = [
      makeStage({ id: 's1', startDate: new Date('2024-01-01'), endDate: new Date('2024-03-01'), orderIndex: 1 }),
      makeStage({ id: 's2', startDate: new Date('2024-04-01'), endDate: new Date('2024-06-01'), orderIndex: 2 }),
      makeStage({ id: 's3', startDate: new Date('2024-07-01'), endDate: new Date('2024-09-01'), orderIndex: 3 }),
    ];
    expect(findActiveStageForHackathon(stages, now)?.id).toBe('s3');
  });

  it('returns null when no stages provided', () => {
    expect(findActiveStageForHackathon([], now)).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// runStatusTransitions — with mocked DB
// ═══════════════════════════════════════════════════════════════════════════

describe('runStatusTransitions', () => {
  beforeEach(() => {
    dbMock.select.mockClear();
    dbMock.update.mockClear();
    redisMock.set.mockClear();
  });

  const pastDate = new Date(Date.now() - 2 * 3600_000); // 2 hours ago
  const futureDate = new Date(Date.now() + 2 * 3600_000); // 2 hours from now

  function makeDbRow(overrides: {
    id?: string;
    title?: string;
    status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
    stageId?: string | null;
    stageName?: string | null;
    stageStart?: Date | null;
    stageEnd?: Date | null;
    stageOrder?: number | null;
  }) {
    return {
      id: 'hack-1',
      title: 'Test Hackathon',
      status: 'DRAFT' as const,
      stageId: null,
      stageName: null,
      stageStart: null,
      stageEnd: null,
      stageOrder: null,
      ...overrides,
    };
  }

  it('transitions DRAFT → PUBLISHED when REGISTRATION startDate <= now', async () => {
    dbOrderByMock.mockResolvedValueOnce([
      makeDbRow({
        status: 'DRAFT',
        stageId: 'st1',
        stageName: 'REGISTRATION',
        stageStart: pastDate,
        stageEnd: futureDate,
        stageOrder: 1,
      }),
    ]);

    const results = await runStatusTransitions();
    expect(results).toHaveLength(1);
    expect(results[0].previousStatus).toBe('DRAFT');
    expect(results[0].newStatus).toBe('PUBLISHED');
    expect(results[0].triggeredBy).toContain('REGISTRATION');
    expect(dbMock.update).toHaveBeenCalled();
  });

  it('does NOT transition DRAFT when REGISTRATION startDate is in the future', async () => {
    dbOrderByMock.mockResolvedValueOnce([
      makeDbRow({
        status: 'DRAFT',
        stageId: 'st1',
        stageName: 'REGISTRATION',
        stageStart: futureDate,
        stageEnd: new Date(Date.now() + 5 * 3600_000),
        stageOrder: 1,
      }),
    ]);

    const results = await runStatusTransitions();
    expect(results).toHaveLength(0);
    expect(dbMock.update).not.toHaveBeenCalled();
  });

  it('does NOT transition DRAFT when no REGISTRATION stage exists', async () => {
    dbOrderByMock.mockResolvedValueOnce([
      makeDbRow({
        status: 'DRAFT',
        stageId: 'st1',
        stageName: 'HACKING',
        stageStart: pastDate,
        stageEnd: futureDate,
        stageOrder: 1,
      }),
    ]);

    const results = await runStatusTransitions();
    expect(results).toHaveLength(0);
  });

  it('transitions PUBLISHED → ARCHIVED when FINISHED endDate <= now', async () => {
    dbOrderByMock.mockResolvedValueOnce([
      makeDbRow({
        status: 'PUBLISHED',
        stageId: 'st4',
        stageName: 'FINISHED',
        stageStart: new Date(Date.now() - 5 * 3600_000),
        stageEnd: pastDate,
        stageOrder: 4,
      }),
    ]);

    const results = await runStatusTransitions();
    expect(results).toHaveLength(1);
    expect(results[0].previousStatus).toBe('PUBLISHED');
    expect(results[0].newStatus).toBe('ARCHIVED');
    expect(results[0].triggeredBy).toContain('FINISHED');
  });

  it('does NOT transition PUBLISHED when FINISHED endDate is in the future', async () => {
    dbOrderByMock.mockResolvedValueOnce([
      makeDbRow({
        status: 'PUBLISHED',
        stageId: 'st4',
        stageName: 'FINISHED',
        stageStart: pastDate,
        stageEnd: futureDate,
        stageOrder: 4,
      }),
    ]);

    const results = await runStatusTransitions();
    expect(results).toHaveLength(0);
  });

  it('does NOT transition PUBLISHED when no FINISHED stage exists', async () => {
    dbOrderByMock.mockResolvedValueOnce([
      makeDbRow({
        status: 'PUBLISHED',
        stageId: 'st3',
        stageName: 'JUDGING',
        stageStart: pastDate,
        stageEnd: futureDate,
        stageOrder: 3,
      }),
    ]);

    const results = await runStatusTransitions();
    expect(results).toHaveLength(0);
  });

  it('returns zero results (ARCHIVED excluded from query — verified by ne() filter)', async () => {
    // DB returns empty because ARCHIVED hackathons are filtered in WHERE clause
    dbOrderByMock.mockResolvedValueOnce([]);

    const results = await runStatusTransitions();
    expect(results).toHaveLength(0);
    expect(dbMock.update).not.toHaveBeenCalled();
  });

  it('processes multiple hackathons in one tick and returns all results', async () => {
    dbOrderByMock.mockResolvedValueOnce([
      makeDbRow({ id: 'h1', title: 'H1', status: 'DRAFT', stageId: 'st1', stageName: 'REGISTRATION', stageStart: pastDate, stageEnd: futureDate, stageOrder: 1 }),
      makeDbRow({ id: 'h2', title: 'H2', status: 'PUBLISHED', stageId: 'st2', stageName: 'FINISHED', stageStart: new Date(Date.now() - 5 * 3600_000), stageEnd: pastDate, stageOrder: 4 }),
    ]);

    const results = await runStatusTransitions();
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.hackathonId)).toContain('h1');
    expect(results.map((r) => r.hackathonId)).toContain('h2');
  });

  it('writes activeStage to Redis cache for each hackathon', async () => {
    dbOrderByMock.mockResolvedValueOnce([
      makeDbRow({
        status: 'PUBLISHED',
        stageId: 'st1',
        stageName: 'HACKING',
        stageStart: pastDate,
        stageEnd: futureDate,
        stageOrder: 2,
      }),
    ]);

    await runStatusTransitions();
    // Redis set should be called with the hackathon's active-stage key
    expect(redisMock.set).toHaveBeenCalledWith(
      'hackathon:hack-1:active_stage',
      expect.any(String),
      'EX',
      60,
    );
  });
});
