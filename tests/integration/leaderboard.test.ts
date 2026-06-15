/**
 * Tests for score normalization logic and the leaderboard endpoint.
 *
 * Pure unit tests: JudgingService.normalizeScores()
 * Integration tests: GET /api/v1/judging/leaderboard/:hackathonId
 */
import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { getTestApp, inject } from '../helpers/app';
import {
  createTestUser,
  cleanupUsers,
  cleanupHackathons,
} from '../helpers/db';
import type { FastifyInstance } from 'fastify';
import { JudgingService } from '../../src/modules/judging/judging.service';

// ── Pure unit tests for normalizeScores ────────────────────────────
describe('JudgingService.normalizeScores (unit)', () => {
  // Pass bare minimum — only normalizeScores is used, no DB/Redis needed
  const service = new JudgingService({} as never);

  it('returns empty array for empty input', () => {
    expect(service.normalizeScores([])).toEqual([]);
  });

  it('does not adjust scores when all judges average the same', () => {
    const scores = [
      { judgeId: 'j1', projectId: 'p1', criteriaId: 'c1', assessment: '8' },
      { judgeId: 'j2', projectId: 'p2', criteriaId: 'c1', assessment: '8' },
    ];
    const result = service.normalizeScores(scores);
    expect(result[0]!.normalized).toBeCloseTo(8, 3);
    expect(result[1]!.normalized).toBeCloseTo(8, 3);
  });

  it('pulls a lenient judge down toward the global average', () => {
    // j1 always gives 10, j2 always gives 6  →  global_avg = 8
    const scores = [
      { judgeId: 'j1', projectId: 'p1', criteriaId: 'c1', assessment: '10' },
      { judgeId: 'j1', projectId: 'p2', criteriaId: 'c1', assessment: '10' },
      { judgeId: 'j2', projectId: 'p1', criteriaId: 'c1', assessment: '6' },
      { judgeId: 'j2', projectId: 'p2', criteriaId: 'c1', assessment: '6' },
    ];
    const result = service.normalizeScores(scores);
    // j1 avg=10, multiplier=8/10=0.8  →  10*0.8=8
    for (const s of result.filter((r) => r.judgeId === 'j1')) {
      expect(s.normalized).toBeCloseTo(8, 3);
    }
    // j2 avg=6, multiplier=8/6≈1.333  →  6*1.333≈8
    for (const s of result.filter((r) => r.judgeId === 'j2')) {
      expect(s.normalized).toBeCloseTo(8, 3);
    }
  });

  it('handles a single judge without dividing by zero', () => {
    const scores = [{ judgeId: 'j1', projectId: 'p1', criteriaId: 'c1', assessment: '7' }];
    const result = service.normalizeScores(scores);
    expect(result[0]!.normalized).toBeCloseTo(7, 3);
  });
});

// ── Integration — leaderboard endpoint ────────────────────────────
describe('GET /api/v1/judging/leaderboard/:id', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let adminUserId: string;
  let hackathonId: string;
  let trackId: string;
  let stageId: string;
  let criteriaId: string;
  let team1Id: string;
  let team2Id: string;
  let project1Id: string;
  let project2Id: string;

  beforeAll(async () => {
    app = await getTestApp();
    const suffix = Date.now();

    // Create admin user in DB so we have the 'admin' role
    const admin = await createTestUser({
      email: `lb-admin-${suffix}@hackflow.test`,
      username: `lbadmin${suffix}`,
      role: 'admin',
    });
    adminUserId = admin.id;

    const adminRes = await inject(app, 'POST', '/api/v1/auth/login', {
      body: { email: admin.email, password: 'Test1234!' },
    });
    adminToken = (adminRes.body.data as Record<string, unknown>).accessToken as string;

    // Hackathon (active)
    const hRes = await inject(app, 'POST', '/api/v1/hackathons', {
      token: adminToken,
      body: {
        title: 'LB Hackathon',
        online: true,
        startDate: new Date(Date.now() - 86_400_000).toISOString(),
        endDate: new Date(Date.now() + 86_400_000).toISOString(),
      },
    });
    hackathonId = (hRes.body.data as Record<string, unknown>).id as string;

    // Track
    const trRes = await inject(app, 'POST', `/api/v1/hackathons/${hackathonId}/tracks`, {
      token: adminToken,
      body: { name: 'LB Track' },
    });
    trackId = (trRes.body.data as Record<string, unknown>).id as string;

    // Stage
    const stRes = await inject(app, 'POST', `/api/v1/hackathons/${hackathonId}/stages`, {
      token: adminToken,
      body: {
        name: 'Stage 1',
        orderIndex: 0,
        startDate: new Date(Date.now() - 86_400_000).toISOString(),
        endDate: new Date(Date.now() + 86_400_000).toISOString(),
      },
    });
    stageId = (stRes.body.data as Record<string, unknown>).id as string;

    // Scoring criteria
    const cRes = await inject(app, 'POST', '/api/v1/judging/criteria', {
      token: adminToken,
      body: { trackId, name: 'Innovation', weight: 1, maxScore: 10 },
    });
    criteriaId = (cRes.body.data as Record<string, unknown>).id as string;

    // Teams
    const t1 = await inject(app, 'POST', '/api/v1/teams', {
      token: adminToken,
      body: { name: 'LB Team One', hackathonId, trackId },
    });
    team1Id = (t1.body.data as Record<string, unknown>).id as string;

    const t2 = await inject(app, 'POST', '/api/v1/teams', {
      token: adminToken,
      body: { name: 'LB Team Two', hackathonId, trackId },
    });
    team2Id = (t2.body.data as Record<string, unknown>).id as string;

    // Projects
    const p1 = await inject(app, 'POST', '/api/v1/projects', {
      token: adminToken,
      body: { teamId: team1Id, stageId },
    });
    project1Id = (p1.body.data as Record<string, unknown>).id as string;

    const p2 = await inject(app, 'POST', '/api/v1/projects', {
      token: adminToken,
      body: { teamId: team2Id, stageId },
    });
    project2Id = (p2.body.data as Record<string, unknown>).id as string;

    // Admin submits scores (admin has full access in this test env)
    // project1 → 9, project2 → 5  ⟹ project1 should rank #1
    await inject(app, 'POST', '/api/v1/judging/scores', {
      token: adminToken,
      body: { projectId: project1Id, criteriaId, assessment: 9 },
    });
    await inject(app, 'POST', '/api/v1/judging/scores', {
      token: adminToken,
      body: { projectId: project2Id, criteriaId, assessment: 5 },
    });
  });

  afterAll(async () => {
    if (hackathonId) await cleanupHackathons([hackathonId]);
    await cleanupUsers([adminUserId]);
  });

  it('returns 200 with an array of ranked entries', async () => {
    const { status, body } = await inject(
      app, 'GET', `/api/v1/judging/leaderboard/${hackathonId}`,
    );
    expect(status).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
    expect((body.data as unknown[]).length).toBeGreaterThanOrEqual(1);
  });

  it('entries are sorted by totalScore DESC', async () => {
    const { body } = await inject(
      app, 'GET', `/api/v1/judging/leaderboard/${hackathonId}`,
    );
    const data = body.data as Array<{ rank: number; totalScore: number; projectId: string }>;
    for (let i = 1; i < data.length; i++) {
      expect(data[i - 1]!.totalScore).toBeGreaterThanOrEqual(data[i]!.totalScore);
    }
  });

  it('every entry has rank, totalScore and projectId fields', async () => {
    const { body } = await inject(
      app, 'GET', `/api/v1/judging/leaderboard/${hackathonId}`,
    );
    for (const entry of body.data as Array<Record<string, unknown>>) {
      expect(typeof entry['rank']).toBe('number');
      expect(typeof entry['totalScore']).toBe('number');
      expect(typeof entry['projectId']).toBe('string');
    }
  });

  it('returns empty array for an unknown hackathon ID', async () => {
    const { status, body } = await inject(
      app, 'GET', '/api/v1/judging/leaderboard/00000000-0000-4000-8000-000000000000',
    );
    expect(status).toBe(200);
    expect(body.data).toEqual([]);
  });
});
