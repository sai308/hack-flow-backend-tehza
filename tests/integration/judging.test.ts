/**
 * JUDGING FLOW integration tests
 * Covers: criteria creation, score submission, score upsert, conflict reporting
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestApp, inject } from '../helpers/app';
import { createTestUser, cleanupUsers, cleanupHackathons, testDb } from '../helpers/db';
import * as schema from '../../src/drizzle/schema';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;
let adminToken: string;
let judgeToken: string;
let judge2Token: string;
let participantToken: string;
let adminId: string;
let judgeId: string;
let judge2Id: string;
let participantId: string;
let hackathonId: string;
let trackId: string;
let stageId: string;
let teamId: string;
let projectId: string;
let criteriaId: string;

describe('JUDGING FLOW', () => {
  beforeAll(async () => {
    app = await getTestApp();
    const suffix = Date.now();

    const admin = await createTestUser({
      email: `jud-admin-${suffix}@hackflow.test`,
      username: `judadmin${suffix}`,
      role: 'admin',
    });
    adminId = admin.id;

    const judge = await createTestUser({
      email: `judge1-${suffix}@hackflow.test`,
      username: `judge1${suffix}`,
      role: 'judge',
    });
    judgeId = judge.id;

    const judge2 = await createTestUser({
      email: `judge2-${suffix}@hackflow.test`,
      username: `judge2${suffix}`,
      role: 'judge',
    });
    judge2Id = judge2.id;

    const participant = await createTestUser({
      email: `jud-part-${suffix}@hackflow.test`,
      username: `judpart${suffix}`,
      role: 'participant',
    });
    participantId = participant.id;

    // Login all
    const al = await inject(app, 'POST', '/api/v1/auth/login', { body: { email: admin.email, password: 'Test1234!' } });
    adminToken = (al.body.data as Record<string, unknown>).accessToken as string;

    const jl = await inject(app, 'POST', '/api/v1/auth/login', { body: { email: judge.email, password: 'Test1234!' } });
    judgeToken = (jl.body.data as Record<string, unknown>).accessToken as string;

    const j2l = await inject(app, 'POST', '/api/v1/auth/login', { body: { email: judge2.email, password: 'Test1234!' } });
    judge2Token = (j2l.body.data as Record<string, unknown>).accessToken as string;

    const pl = await inject(app, 'POST', '/api/v1/auth/login', { body: { email: participant.email, password: 'Test1234!' } });
    participantToken = (pl.body.data as Record<string, unknown>).accessToken as string;

    // Build hackathon + track + stage + team + project
    const hackRes = await inject(app, 'POST', '/api/v1/hackathons', {
      token: adminToken,
      body: {
        title: `Judging Hackathon ${suffix}`,
        online: true,
        startDate: new Date(Date.now() + 86400000).toISOString(),
        endDate: new Date(Date.now() + 3 * 86400000).toISOString(),
        minTeamSize: 1,
        maxTeamSize: 5,
      },
    });
    hackathonId = (hackRes.body.data as Record<string, unknown>).id as string;

    const trackRes = await inject(app, 'POST', `/api/v1/hackathons/${hackathonId}/tracks`, {
      token: adminToken,
      body: { name: `AI Track ${suffix}` },
    });
    trackId = (trackRes.body.data as Record<string, unknown>).id as string;

    const stageRes = await inject(app, 'POST', `/api/v1/hackathons/${hackathonId}/stages`, {
      token: adminToken,
      body: {
        name: 'Final',
        orderIndex: 1,
        startDate: new Date(Date.now() + 86400000).toISOString(),
        endDate: new Date(Date.now() + 2 * 86400000).toISOString(),
      },
    });
    stageId = (stageRes.body.data as Record<string, unknown>).id as string;

    const teamRes = await inject(app, 'POST', '/api/v1/teams', {
      token: participantToken,
      body: { name: `Judging Team ${suffix}`, hackathonId },
    });
    teamId = (teamRes.body.data as Record<string, unknown>).id as string;

    const [rt] = await testDb
      .insert(schema.projectResourceTypes)
      .values({ name: `RT-${suffix}` })
      .returning();

    const projRes = await inject(app, 'POST', '/api/v1/projects', {
      token: participantToken,
      body: { teamId, stageId },
    });
    projectId = (projRes.body.data as Record<string, unknown>).id as string;
  });

  afterAll(async () => {
    if (hackathonId) await cleanupHackathons([hackathonId]);
    await cleanupUsers([adminId, judgeId, judge2Id, participantId]);
  });

  it('POST /judging/criteria → 401 as participant', async () => {
    const { status } = await inject(app, 'POST', '/api/v1/judging/criteria', {
      token: participantToken,
      body: { trackId, name: 'Innovation', weight: 30, maxScore: 10 },
    });
    expect(status).toBe(401);
  });

  it('POST /judging/criteria → 201 as admin', async () => {
    const { status, body } = await inject(app, 'POST', '/api/v1/judging/criteria', {
      token: adminToken,
      body: { trackId, name: 'Innovation', weight: 30, maxScore: 10 },
    });
    expect(status).toBe(201);
    criteriaId = (body.data as Record<string, unknown>).id as string;
    expect(criteriaId).toBeTruthy();
  });

  it('GET /judging/criteria/track/:id → 200 with criteria', async () => {
    const { status, body } = await inject(app, 'GET', `/api/v1/judging/criteria/track/${trackId}`);
    expect(status).toBe(200);
    expect((body.data as unknown[]).length).toBeGreaterThan(0);
  });

  it('POST /judging/scores → 401 as participant (not judge)', async () => {
    const { status } = await inject(app, 'POST', '/api/v1/judging/scores', {
      token: participantToken,
      body: { projectId, criteriaId, assessment: 8 },
    });
    expect(status).toBe(401);
  });

  it('POST /judging/scores → 200 as judge (first submission)', async () => {
    const { status, body } = await inject(app, 'POST', '/api/v1/judging/scores', {
      token: judgeToken,
      body: { projectId, criteriaId, assessment: 7, comment: 'Good idea' },
    });
    expect(status).toBe(200);
    expect(Number((body.data as Record<string, unknown>).assessment)).toBe(7);
  });

  it('POST /judging/scores → 200 upsert — score updated (not duplicated)', async () => {
    const { status, body } = await inject(app, 'POST', '/api/v1/judging/scores', {
      token: judgeToken,
      body: { projectId, criteriaId, assessment: 9, comment: 'Revised — very innovative' },
    });
    expect(status).toBe(200);
    expect(Number((body.data as Record<string, unknown>).assessment)).toBe(9);
  });

  it('GET /judging/scores/project/:id → scores contain 1 entry (upsert worked)', async () => {
    const { status, body } = await inject(
      app, 'GET', `/api/v1/judging/scores/project/${projectId}`,
      { token: judgeToken },
    );
    expect(status).toBe(200);
    // Only 1 score per judge per criteria (upsert, not insert)
    const scores = body.data as unknown[];
    expect(scores.length).toBe(1);
  });

  it('POST /judging/conflicts → 201 — report conflict', async () => {
    const { status, body } = await inject(app, 'POST', '/api/v1/judging/conflicts', {
      token: judge2Token,
      body: { teamId, reason: 'MENTORED' },
    });
    expect(status).toBe(201);
    expect((body.data as Record<string, unknown>).judgeId).toBe(judge2Id);
  });

  it('POST /judging/conflicts → 403 — duplicate conflict report blocked', async () => {
    const { status } = await inject(app, 'POST', '/api/v1/judging/conflicts', {
      token: judge2Token,
      body: { teamId, reason: 'RELATIVE' },
    });
    expect(status).toBe(403);
  });

  it('GET /judging/conflicts → 200 — judge sees own conflicts', async () => {
    const { status, body } = await inject(app, 'GET', '/api/v1/judging/conflicts', {
      token: judge2Token,
    });
    expect(status).toBe(200);
    expect((body.data as unknown[]).length).toBe(1);
  });

  // ── Admin: GET /judging/conflicts/all ─────────────────────────

  it('GET /judging/conflicts/all → 401 for judge (not admin)', async () => {
    const { status } = await inject(app, 'GET', '/api/v1/judging/conflicts/all', {
      token: judgeToken,
    });
    expect(status).toBe(401);
  });

  it('GET /judging/conflicts/all → 200 for admin — returns paginated list with judge/team info', async () => {
    const { status, body } = await inject(app, 'GET', '/api/v1/judging/conflicts/all', {
      token: adminToken,
    });
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    // Pagination envelope
    expect(typeof body.total).toBe('number');
    expect(body.total).toBeGreaterThan(0);
    expect(Array.isArray(body.data)).toBe(true);
    // Enriched fields
    const first = (body.data as Record<string, unknown>[])[0];
    expect(first).toHaveProperty('judge');
    expect(first).toHaveProperty('team');
    const judge = first.judge as Record<string, unknown>;
    expect(judge).toHaveProperty('id');
    expect(judge).toHaveProperty('email');
    const team = first.team as Record<string, unknown>;
    expect(team).toHaveProperty('id');
    expect(team).toHaveProperty('name');
  });

  it('GET /judging/conflicts/all?hackathonId=... → 200 filtered by hackathon', async () => {
    const { status, body } = await inject(
      app,
      'GET',
      `/api/v1/judging/conflicts/all?hackathonId=${hackathonId}`,
      { token: adminToken },
    );
    expect(status).toBe(200);
    expect(body.total).toBeGreaterThan(0);
    // All returned conflicts must belong to this hackathon's teams
    for (const row of body.data as Record<string, unknown>[]) {
      expect((row.team as Record<string, unknown>).hackathonId).toBe(hackathonId);
    }
  });

  it('GET /judging/conflicts/all?hackathonId=unknown → 200 with empty list', async () => {
    const { status, body } = await inject(
      app,
      'GET',
      '/api/v1/judging/conflicts/all?hackathonId=00000000-0000-4000-8000-000000000000',
      { token: adminToken },
    );
    expect(status).toBe(200);
    expect(body.total).toBe(0);
    expect((body.data as unknown[]).length).toBe(0);
  });
});
