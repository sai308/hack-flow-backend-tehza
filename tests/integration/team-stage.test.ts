/**
 * TEAM STAGE FLOW integration tests
 * Covers: GET current stage, POST move stage (RBAC + APPROVED rule), GET teams in stage
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestApp, inject } from '../helpers/app';
import { createTestUser, cleanupUsers, cleanupHackathons, testDb } from '../helpers/db';
import type { FastifyInstance } from 'fastify';
import * as schema from '../../src/drizzle/schema';
import { inArray } from 'drizzle-orm';

let app: FastifyInstance;
let adminToken: string;
let judgeToken: string;
let participantToken: string;
let adminUserId: string;
let judgeUserId: string;
let participantUserId: string;
let hackathonId: string;
let stageId: string;
let teamId: string;

const BASE = '/api/v1';

describe('TEAM STAGE FLOW', () => {
  beforeAll(async () => {
    app = await getTestApp();
    const suffix = Date.now();

    const admin = await createTestUser({
      email: `ts-admin-${suffix}@hackflow.test`,
      username: `tsadmin${suffix}`,
      role: 'admin',
    });
    adminUserId = admin.id;

    const judge = await createTestUser({
      email: `ts-judge-${suffix}@hackflow.test`,
      username: `tsjudge${suffix}`,
      role: 'judge',
    });
    judgeUserId = judge.id;

    const participant = await createTestUser({
      email: `ts-part-${suffix}@hackflow.test`,
      username: `tspart${suffix}`,
      role: 'participant',
    });
    participantUserId = participant.id;

    const adminLogin = await inject(app, 'POST', `${BASE}/auth/login`, {
      body: { email: admin.email, password: 'Test1234!' },
    });
    adminToken = (adminLogin.body.data as Record<string, unknown>).accessToken as string;

    const judgeLogin = await inject(app, 'POST', `${BASE}/auth/login`, {
      body: { email: judge.email, password: 'Test1234!' },
    });
    judgeToken = (judgeLogin.body.data as Record<string, unknown>).accessToken as string;

    const partLogin = await inject(app, 'POST', `${BASE}/auth/login`, {
      body: { email: participant.email, password: 'Test1234!' },
    });
    participantToken = (partLogin.body.data as Record<string, unknown>).accessToken as string;

    // Create hackathon + stage
    const hacRes = await inject(app, 'POST', `${BASE}/hackathons`, {
      token: adminToken,
      body: {
        title: 'Stage Test Hackathon',
        online: true,
        startDate: new Date(Date.now() + 86400000).toISOString(),
        endDate: new Date(Date.now() + 2 * 86400000).toISOString(),
        minTeamSize: 1,
        maxTeamSize: 4,
      },
    });
    hackathonId = (hacRes.body.data as Record<string, unknown>).id as string;

    const stageRes = await inject(app, 'POST', `${BASE}/hackathons/${hackathonId}/stages`, {
      token: adminToken,
      body: {
        name: 'Qualification',
        orderIndex: 1,
        startDate: new Date(Date.now() + 86400000).toISOString(),
        endDate: new Date(Date.now() + 2 * 86400000).toISOString(),
      },
    });
    stageId = (stageRes.body.data as Record<string, unknown>).id as string;

    // Create team + approve it
    const teamRes = await inject(app, 'POST', `${BASE}/teams`, {
      token: adminToken,
      body: { name: `StageTeam${suffix}`, hackathonId },
    });
    teamId = (teamRes.body.data as Record<string, unknown>).id as string;

    // Approve the team so stage moves are allowed
    await inject(app, 'PATCH', `${BASE}/teams/${teamId}/approval`, {
      token: adminToken,
      body: { status: 'APPROVED', comment: 'Ready' },
    });
  });

  afterAll(async () => {
    if (teamId) await testDb.delete(schema.teams).where(inArray(schema.teams.id, [teamId]));
    if (hackathonId) await cleanupHackathons([hackathonId]);
    await cleanupUsers([adminUserId, judgeUserId, participantUserId]);
  });

  // ── GET current stage ─────────────────────────────────────────

  it('GET /teams/:teamId/stage → 200 (null when not in any stage)', async () => {
    const { status, body } = await inject(app, 'GET', `${BASE}/teams/${teamId}/stage`);
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toBeNull();
  });

  it('GET /teams/:teamId/stage → 404 for unknown team', async () => {
    const { status } = await inject(
      app, 'GET', `${BASE}/teams/00000000-0000-4000-8000-000000000000/stage`,
    );
    expect(status).toBe(404);
  });

  // ── POST move stage — RBAC ─────────────────────────────────────

  it('POST /teams/:teamId/stage → 401 without auth', async () => {
    const { status } = await inject(app, 'POST', `${BASE}/teams/${teamId}/stage`, {
      body: { stageId },
    });
    expect(status).toBe(401);
  });

  it('POST /teams/:teamId/stage → 401 as participant', async () => {
    const { status } = await inject(app, 'POST', `${BASE}/teams/${teamId}/stage`, {
      token: participantToken,
      body: { stageId },
    });
    expect(status).toBe(401);
  });

  // ── POST move stage — business rules ───────────────────────────

  it('POST /teams/:teamId/stage → 201 as admin (APPROVED team)', async () => {
    const { status, body } = await inject(app, 'POST', `${BASE}/teams/${teamId}/stage`, {
      token: adminToken,
      body: { stageId },
    });
    expect(status).toBe(201);
    expect(body.success).toBe(true);
    const data = body.data as Record<string, unknown>;
    expect(data.teamId).toBe(teamId);
    expect(data.stageId).toBe(stageId);
  });

  it('GET /teams/:teamId/stage → 200 now returns the stage', async () => {
    const { status, body } = await inject(app, 'GET', `${BASE}/teams/${teamId}/stage`);
    expect(status).toBe(200);
    expect((body.data as Record<string, unknown>).stageId).toBe(stageId);
  });

  it('POST /teams/:teamId/stage → 201 as judge (can also move teams)', async () => {
    // Moving to the same stage again (upsert — idempotent)
    const { status } = await inject(app, 'POST', `${BASE}/teams/${teamId}/stage`, {
      token: judgeToken,
      body: { stageId },
    });
    expect(status).toBe(201);
  });

  it('POST /teams/:teamId/stage → 403 for PENDING team', async () => {
    // Create a new team that is NOT approved
    const suffix = Date.now() + 1;
    const pendingTeamRes = await inject(app, 'POST', `${BASE}/teams`, {
      token: adminToken,
      body: { name: `PendingTeam${suffix}`, hackathonId },
    });
    const pendingTeamId = (pendingTeamRes.body.data as Record<string, unknown>).id as string;

    const { status } = await inject(app, 'POST', `${BASE}/teams/${pendingTeamId}/stage`, {
      token: adminToken,
      body: { stageId },
    });
    expect(status).toBe(403);

    // Cleanup
    await testDb.delete(schema.teams).where(inArray(schema.teams.id, [pendingTeamId]));
  });

  it('POST /teams/:teamId/stage → 404 for unknown stage', async () => {
    const { status } = await inject(app, 'POST', `${BASE}/teams/${teamId}/stage`, {
      token: adminToken,
      body: { stageId: '00000000-0000-4000-8000-000000000000' },
    });
    expect(status).toBe(404);
  });

  // ── GET teams in stage ─────────────────────────────────────────

  it('GET /hackathons/:hackathonId/stages/:stageId/teams → 200 with team list', async () => {
    const { status, body } = await inject(
      app,
      'GET',
      `${BASE}/hackathons/${hackathonId}/stages/${stageId}/teams`,
      { token: adminToken },
    );
    expect(status).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
    expect((body.data as unknown[]).length).toBeGreaterThan(0);
  });

  it('GET /hackathons/:hackathonId/stages/:stageId/teams → 401 as participant', async () => {
    const { status } = await inject(
      app,
      'GET',
      `${BASE}/hackathons/${hackathonId}/stages/${stageId}/teams`,
      { token: participantToken },
    );
    expect(status).toBe(401);
  });
});
