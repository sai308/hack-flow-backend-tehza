/**
 * AWARDS FLOW integration tests
 * Covers: CRUD awards, physical gifts, team award assignment — RBAC enforced
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestApp, inject } from '../helpers/app';
import { createTestUser, cleanupUsers, cleanupHackathons, testDb } from '../helpers/db';
import type { FastifyInstance } from 'fastify';
import * as schema from '../../src/drizzle/schema';
import { inArray } from 'drizzle-orm';

let app: FastifyInstance;
let adminToken: string;
let participantToken: string;
let adminUserId: string;
let participantUserId: string;
let hackathonId: string;
let teamId: string;
let awardId: string;
let giftId: string;

const BASE = '/api/v1';

describe('AWARDS FLOW', () => {
  beforeAll(async () => {
    app = await getTestApp();

    const suffix = Date.now();

    const admin = await createTestUser({
      email: `awards-admin-${suffix}@hackflow.test`,
      username: `awardsadmin${suffix}`,
      role: 'admin',
    });
    adminUserId = admin.id;

    const participant = await createTestUser({
      email: `awards-participant-${suffix}@hackflow.test`,
      username: `awardspart${suffix}`,
      role: 'participant',
    });
    participantUserId = participant.id;

    const adminLogin = await inject(app, 'POST', `${BASE}/auth/login`, {
      body: { email: admin.email, password: 'Test1234!' },
    });
    adminToken = (adminLogin.body.data as Record<string, unknown>).accessToken as string;

    const partLogin = await inject(app, 'POST', `${BASE}/auth/login`, {
      body: { email: participant.email, password: 'Test1234!' },
    });
    participantToken = (partLogin.body.data as Record<string, unknown>).accessToken as string;

    // Create hackathon for the awards to belong to
    const hacRes = await inject(app, 'POST', `${BASE}/hackathons`, {
      token: adminToken,
      body: {
        title: 'Awards Test Hackathon',
        online: true,
        startDate: new Date(Date.now() + 86400000).toISOString(),
        endDate: new Date(Date.now() + 2 * 86400000).toISOString(),
        minTeamSize: 1,
        maxTeamSize: 4,
      },
    });
    hackathonId = (hacRes.body.data as Record<string, unknown>).id as string;

    // Create a team in that hackathon (needed for assign-award test)
    const teamRes = await inject(app, 'POST', `${BASE}/teams`, {
      token: adminToken,
      body: { name: `AwardTeam${suffix}`, hackathonId },
    });
    teamId = (teamRes.body.data as Record<string, unknown>).id as string;
  });

  afterAll(async () => {
    if (teamId) await testDb.delete(schema.teams).where(inArray(schema.teams.id, [teamId]));
    if (hackathonId) await cleanupHackathons([hackathonId]);
    await cleanupUsers([adminUserId, participantUserId]);
  });

  // ── List (public) ──────────────────────────────────────────────

  it('GET /hackathons/:id/awards → 200 public (empty initially)', async () => {
    const { status, body } = await inject(app, 'GET', `${BASE}/hackathons/${hackathonId}/awards`);
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  // ── Create ─────────────────────────────────────────────────────

  it('POST /hackathons/:id/awards → 401 without auth', async () => {
    const { status } = await inject(app, 'POST', `${BASE}/hackathons/${hackathonId}/awards`, {
      body: { name: '1st Place', place: 1 },
    });
    expect(status).toBe(401);
  });

  it('POST /hackathons/:id/awards → 401 as participant', async () => {
    const { status } = await inject(app, 'POST', `${BASE}/hackathons/${hackathonId}/awards`, {
      token: participantToken,
      body: { name: '1st Place', place: 1 },
    });
    expect(status).toBe(401);
  });

  it('POST /hackathons/:id/awards → 201 as admin', async () => {
    const { status, body } = await inject(app, 'POST', `${BASE}/hackathons/${hackathonId}/awards`, {
      token: adminToken,
      body: {
        name: '1st Place',
        place: 1,
        description: 'Winner award',
        certificate: 'https://cert.hackflow.test/1st',
      },
    });
    expect(status).toBe(201);
    expect(body.success).toBe(true);
    const data = body.data as Record<string, unknown>;
    expect(data.name).toBe('1st Place');
    expect(data.place).toBe(1);
    awardId = data.id as string;
    expect(awardId).toBeTruthy();
  });

  it('GET /hackathons/:id/awards → 200 now contains 1 award', async () => {
    const { status, body } = await inject(app, 'GET', `${BASE}/hackathons/${hackathonId}/awards`);
    expect(status).toBe(200);
    expect((body.data as unknown[]).length).toBeGreaterThan(0);
  });

  // ── Update ─────────────────────────────────────────────────────

  it('PATCH /hackathons/:id/awards/:awardId → 200 as admin', async () => {
    const { status, body } = await inject(
      app,
      'PATCH',
      `${BASE}/hackathons/${hackathonId}/awards/${awardId}`,
      { token: adminToken, body: { name: 'Grand Prize', place: 1 } },
    );
    expect(status).toBe(200);
    expect((body.data as Record<string, unknown>).name).toBe('Grand Prize');
  });

  it('PATCH /hackathons/:id/awards/:awardId → 404 for unknown award', async () => {
    const { status } = await inject(
      app,
      'PATCH',
      `${BASE}/hackathons/${hackathonId}/awards/00000000-0000-4000-8000-000000000000`,
      { token: adminToken, body: { name: 'X' } },
    );
    expect(status).toBe(404);
  });

  // ── Physical Gifts ─────────────────────────────────────────────

  it('POST /hackathons/:id/awards/:awardId/physical-gifts → 201 as admin', async () => {
    const { status, body } = await inject(
      app,
      'POST',
      `${BASE}/hackathons/${hackathonId}/awards/${awardId}/physical-gifts`,
      {
        token: adminToken,
        body: { name: 'Trophy', description: 'Gold trophy', image: 'https://img.hackflow.test/trophy.png' },
      },
    );
    expect(status).toBe(201);
    const data = body.data as Record<string, unknown>;
    expect(data.name).toBe('Trophy');
    giftId = data.id as string;
    expect(giftId).toBeTruthy();
  });

  it('DELETE /hackathons/:id/awards/:awardId/physical-gifts/:giftId → 204 as admin', async () => {
    const { status } = await inject(
      app,
      'DELETE',
      `${BASE}/hackathons/${hackathonId}/awards/${awardId}/physical-gifts/${giftId}`,
      { token: adminToken },
    );
    expect(status).toBe(204);
  });

  // ── Team Award Assignment ──────────────────────────────────────

  it('POST /teams/:teamId/awards/:awardId → 201 assigns award to team', async () => {
    const { status, body } = await inject(
      app,
      'POST',
      `${BASE}/teams/${teamId}/awards/${awardId}`,
      { token: adminToken },
    );
    expect(status).toBe(201);
    expect(body.success).toBe(true);
  });

  it('POST /teams/:teamId/awards/:awardId → 409 on duplicate assignment', async () => {
    const { status } = await inject(
      app,
      'POST',
      `${BASE}/teams/${teamId}/awards/${awardId}`,
      { token: adminToken },
    );
    expect(status).toBe(409);
  });

  // ── Delete Award ───────────────────────────────────────────────

  it('DELETE /hackathons/:id/awards/:awardId → 204 as admin', async () => {
    // Create a fresh award to delete so we don't break team-award tests above
    const createRes = await inject(app, 'POST', `${BASE}/hackathons/${hackathonId}/awards`, {
      token: adminToken,
      body: { name: '3rd Place', place: 3 },
    });
    const tempId = (createRes.body.data as Record<string, unknown>).id as string;

    const { status } = await inject(
      app,
      'DELETE',
      `${BASE}/hackathons/${hackathonId}/awards/${tempId}`,
      { token: adminToken },
    );
    expect(status).toBe(204);
  });

  it('DELETE /hackathons/:id/awards/:awardId → 401 as participant', async () => {
    const { status } = await inject(
      app,
      'DELETE',
      `${BASE}/hackathons/${hackathonId}/awards/${awardId}`,
      { token: participantToken },
    );
    expect(status).toBe(401);
  });
});
