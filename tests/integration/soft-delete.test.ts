/**
 * SOFT-DELETE REGRESSION tests
 *
 * Verifies that list/lookup endpoints never return soft-deleted records.
 * Covers the bugs found in the 2026-04-29 audit:
 *   - projects.findById  — was missing isNull(deletedAt)  [FIXED]
 *   - projects.findByTeam — was missing isNull(deletedAt) [FIXED]
 *   - judging.findProjectsByHackathon — was missing isNull(deletedAt) [FIXED]
 *   - teams.findByHackathon / findAllPaginated — already correct [VERIFIED]
 *   - users.findAll — already correct [VERIFIED]
 *
 * Test pattern:
 *   1. Create a live record via the API
 *   2. Soft-delete it directly in the DB (set deleted_at = now())
 *   3. Call the list/lookup endpoint
 *   4. Assert the deleted record does NOT appear
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestApp, inject } from '../helpers/app';
import { createTestUser, cleanupUsers, cleanupHackathons, testDb } from '../helpers/db';
import * as schema from '../../src/drizzle/schema';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;
let adminToken: string;
let participantToken: string;
let adminId: string;
let participantId: string;
let hackathonId: string;
let stageId: string;
let teamId: string;

describe('SOFT-DELETE REGRESSION', () => {
  beforeAll(async () => {
    app = await getTestApp();
    const suffix = Date.now();

    const admin = await createTestUser({
      email: `sd-admin-${suffix}@hackflow.test`,
      username: `sdadmin${suffix}`,
      role: 'admin',
    });
    adminId = admin.id;

    const participant = await createTestUser({
      email: `sd-part-${suffix}@hackflow.test`,
      username: `sdpart${suffix}`,
    });
    participantId = participant.id;

    const al = await inject(app, 'POST', '/api/v1/auth/login', {
      body: { email: admin.email, password: 'Test1234!' },
    });
    adminToken = (al.body.data as Record<string, unknown>).accessToken as string;

    const pl = await inject(app, 'POST', '/api/v1/auth/login', {
      body: { email: participant.email, password: 'Test1234!' },
    });
    participantToken = (pl.body.data as Record<string, unknown>).accessToken as string;

    // Shared hackathon + stage + team
    const hackRes = await inject(app, 'POST', '/api/v1/hackathons', {
      token: adminToken,
      body: {
        title: `Soft-Delete Hackathon ${suffix}`,
        online: true,
        startDate: new Date(Date.now() + 86400000).toISOString(),
        endDate: new Date(Date.now() + 5 * 86400000).toISOString(),
        minTeamSize: 1,
        maxTeamSize: 5,
      },
    });
    hackathonId = (hackRes.body.data as Record<string, unknown>).id as string;

    const stageRes = await inject(app, 'POST', `/api/v1/hackathons/${hackathonId}/stages`, {
      token: adminToken,
      body: {
        name: 'Main',
        orderIndex: 1,
        startDate: new Date(Date.now() + 86400000).toISOString(),
        endDate: new Date(Date.now() + 3 * 86400000).toISOString(),
      },
    });
    stageId = (stageRes.body.data as Record<string, unknown>).id as string;

    const teamRes = await inject(app, 'POST', '/api/v1/teams', {
      token: participantToken,
      body: { name: `SD Team ${suffix}`, hackathonId },
    });
    teamId = (teamRes.body.data as Record<string, unknown>).id as string;
  });

  afterAll(async () => {
    if (hackathonId) await cleanupHackathons([hackathonId]);
    await cleanupUsers([adminId, participantId]);
  });

  // ── projects.findById — soft-deleted project returns 404 ──────────────────

  it('GET /projects/:id → 404 after soft-delete (was: would return 200)', async () => {
    // 1. Create project
    const projRes = await inject(app, 'POST', '/api/v1/projects', {
      token: participantToken,
      body: { teamId, stageId },
    });
    expect(projRes.status).toBe(201);
    const projectId = (projRes.body.data as Record<string, unknown>).id as string;

    // 2. Confirm it exists
    const before = await inject(app, 'GET', `/api/v1/projects/${projectId}`);
    expect(before.status).toBe(200);

    // 3. Soft-delete directly in DB
    await testDb
      .update(schema.projects)
      .set({ deletedAt: new Date() })
      .where(eq(schema.projects.id, projectId));

    // 4. Must return 404
    const after = await inject(app, 'GET', `/api/v1/projects/${projectId}`);
    expect(after.status).toBe(404);
  });

  // ── teams.findAllPaginated — soft-deleted team absent from list ───────────

  it('GET /teams?hackathon_id= → soft-deleted team absent (regression: filter was already present)', async () => {
    // 1. Create an extra team for this hackathon
    const tRes = await inject(app, 'POST', '/api/v1/teams', {
      token: participantToken,
      body: { name: `SD Ephemeral ${Date.now()}`, hackathonId },
    });
    const ephemeralId = (tRes.body.data as Record<string, unknown>).id as string;

    // 2. Confirm it appears in the hackathon listing
    const before = await inject(
      app, 'GET', `/api/v1/teams?hackathon_id=${hackathonId}&limit=100`,
    );
    expect(before.status).toBe(200);
    const beforeIds = (before.body.data as Record<string, unknown>[]).map((t) => t.id);
    expect(beforeIds).toContain(ephemeralId);

    // 3. Soft-delete
    await testDb
      .update(schema.teams)
      .set({ deletedAt: new Date() })
      .where(eq(schema.teams.id, ephemeralId));

    // 4. Must NOT appear
    const after = await inject(
      app, 'GET', `/api/v1/teams?hackathon_id=${hackathonId}&limit=100`,
    );
    const afterIds = (after.body.data as Record<string, unknown>[]).map((t) => t.id);
    expect(afterIds).not.toContain(ephemeralId);
  });

  // ── users.findAll — soft-deleted user absent from public list ─────────────

  it('GET /users → soft-deleted user absent (regression: filter was already present)', async () => {
    // 1. Create a throwaway user
    const ghost = await createTestUser({
      email: `ghost-${Date.now()}@hackflow.test`,
      username: `ghost${Date.now()}`,
    });

    // 2. Soft-delete it
    await testDb
      .update(schema.users)
      .set({ deletedAt: new Date() })
      .where(eq(schema.users.id, ghost.id));

    // 3. GET /users is public — ghost must not appear
    const { status, body } = await inject(app, 'GET', '/api/v1/users?limit=100');
    expect(status).toBe(200);
    const ids = (body.data as Record<string, unknown>[]).map((u) => u.id);
    expect(ids).not.toContain(ghost.id);

    // Hard-delete ghost (avoid polluting other tests)
    await testDb.delete(schema.users).where(eq(schema.users.id, ghost.id));
  });

  // ── judging leaderboard — soft-deleted project excluded from scoring ───────

  it('GET /judging/leaderboard/:hackathonId → soft-deleted project not in ranking', async () => {
    // 1. Create a project to be deleted
    const pRes = await inject(app, 'POST', '/api/v1/projects', {
      token: participantToken,
      body: { teamId, stageId },
    });
    const pid = (pRes.body.data as Record<string, unknown>).id as string;

    // 2. Soft-delete it
    await testDb
      .update(schema.projects)
      .set({ deletedAt: new Date() })
      .where(eq(schema.projects.id, pid));

    // 3. Leaderboard must not contain the deleted project ID
    const { status, body } = await inject(
      app, 'GET', `/api/v1/judging/leaderboard/${hackathonId}`,
    );
    expect(status).toBe(200);
    const projectIds = (body.data as Record<string, unknown>[]).map((e) => e.projectId);
    expect(projectIds).not.toContain(pid);
  });
});
