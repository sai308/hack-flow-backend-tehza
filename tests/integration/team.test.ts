/**
 * TEAM FLOW integration tests
 * Covers: create, invite generation, join via token, duplicate join, captain-only guards
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestApp, inject } from '../helpers/app';
import { createTestUser, cleanupUsers, cleanupHackathons, testDb } from '../helpers/db';
import { eq } from 'drizzle-orm';
import * as schema from '../../src/drizzle/schema';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;
let captainToken: string;
let memberToken: string;
let outsiderToken: string;
let captainId: string;
let memberId: string;
let outsiderId: string;
let hackathonId: string;
let teamId: string;
let inviteToken: string;

describe('TEAM FLOW', () => {
  beforeAll(async () => {
    app = await getTestApp();
    const suffix = Date.now();

    // Create hackathon for teams
    const adminUser = await createTestUser({
      email: `team-admin-${suffix}@hackflow.test`,
      username: `teamadmin${suffix}`,
      role: 'admin',
    });

    const adminLoginRes = await inject(app, 'POST', '/api/v1/auth/login', {
      body: { email: adminUser.email, password: 'Test1234!' },
    });
    const adminToken = (adminLoginRes.body.data as Record<string, unknown>).accessToken as string;

    const hackRes = await inject(app, 'POST', '/api/v1/hackathons', {
      token: adminToken,
      body: {
        title: `Team Flow Hackathon ${suffix}`,
        online: true,
        startDate: new Date(Date.now() + 86400000).toISOString(),
        endDate: new Date(Date.now() + 2 * 86400000).toISOString(),
        minTeamSize: 1,
        maxTeamSize: 3,
      },
    });
    hackathonId = (hackRes.body.data as Record<string, unknown>).id as string;

    // Create team participants
    const captain = await createTestUser({
      email: `captain-${suffix}@hackflow.test`,
      username: `captain${suffix}`,
    });
    captainId = captain.id;

    const member = await createTestUser({
      email: `member-${suffix}@hackflow.test`,
      username: `member${suffix}`,
    });
    memberId = member.id;

    const outsider = await createTestUser({
      email: `outsider-${suffix}@hackflow.test`,
      username: `outsider${suffix}`,
    });
    outsiderId = outsider.id;

    // Login all three
    const captainRes = await inject(app, 'POST', '/api/v1/auth/login', {
      body: { email: captain.email, password: 'Test1234!' },
    });
    captainToken = (captainRes.body.data as Record<string, unknown>).accessToken as string;

    const memberRes = await inject(app, 'POST', '/api/v1/auth/login', {
      body: { email: member.email, password: 'Test1234!' },
    });
    memberToken = (memberRes.body.data as Record<string, unknown>).accessToken as string;

    const outsiderRes = await inject(app, 'POST', '/api/v1/auth/login', {
      body: { email: outsider.email, password: 'Test1234!' },
    });
    outsiderToken = (outsiderRes.body.data as Record<string, unknown>).accessToken as string;

    // Cleanup admin user (hackathon stays for cascade)
    await cleanupUsers([adminUser.id]);
  });

  afterAll(async () => {
    if (hackathonId) await cleanupHackathons([hackathonId]);
    await cleanupUsers([captainId, memberId, outsiderId]);
  });

  it('POST /teams → 201 — captain auto-assigned', async () => {
    const { status, body } = await inject(app, 'POST', '/api/v1/teams', {
      token: captainToken,
      body: { name: 'Team Alpha', hackathonId },
    });
    expect(status).toBe(201);
    teamId = (body.data as Record<string, unknown>).id as string;
    expect(teamId).toBeTruthy();
  });

  it('GET /teams/:id/members → captain is listed', async () => {
    const { status, body } = await inject(app, 'GET', `/api/v1/teams/${teamId}/members`);
    expect(status).toBe(200);
    const members = body.data as Array<Record<string, unknown>>;
    const captain = members.find((m) => m.role === 'captain');
    expect(captain).toBeTruthy();
    expect(captain?.userId).toBe(captainId);
  });

  it('POST /teams/:id/invites → 201 as captain', async () => {
    const { status, body } = await inject(app, 'POST', `/api/v1/teams/${teamId}/invites`, {
      token: captainToken,
      body: { maxUses: 5, expiresInHours: 24 },
    });
    expect(status).toBe(201);
    inviteToken = (body.data as Record<string, unknown>).token as string;
    expect(inviteToken).toBeTruthy();
  });

  it('POST /teams/:id/invites → 403 as non-captain', async () => {
    const { status } = await inject(app, 'POST', `/api/v1/teams/${teamId}/invites`, {
      token: memberToken,
      body: { maxUses: 5, expiresInHours: 24 },
    });
    expect(status).toBe(403);
  });

  it('POST /teams/join → 200 — member joins via token', async () => {
    const { status, body } = await inject(app, 'POST', '/api/v1/teams/join', {
      token: memberToken,
      body: { token: inviteToken },
    });
    expect(status).toBe(200);
    expect((body.data as Record<string, unknown>).id).toBe(teamId);
  });

  it('POST /teams/join → 409 — member joins again (duplicate)', async () => {
    const { status, body } = await inject(app, 'POST', '/api/v1/teams/join', {
      token: memberToken,
      body: { token: inviteToken },
    });
    expect(status).toBe(409);
    expect(body.code).toBe('CONFLICT');
  });

  it('PATCH /teams/:id → 403 as non-captain', async () => {
    const { status } = await inject(app, 'PATCH', `/api/v1/teams/${teamId}`, {
      token: memberToken,
      body: { name: 'Hacked Name' },
    });
    expect(status).toBe(403);
  });

  it('PATCH /teams/:id → 200 as captain', async () => {
    const { status, body } = await inject(app, 'PATCH', `/api/v1/teams/${teamId}`, {
      token: captainToken,
      body: { name: 'Team Alpha Updated' },
    });
    expect(status).toBe(200);
    expect((body.data as Record<string, unknown>).name).toBe('Team Alpha Updated');
  });

  it('GET /teams/:id/members → 2 members now', async () => {
    const { body } = await inject(app, 'GET', `/api/v1/teams/${teamId}/members`);
    const members = body.data as unknown[];
    expect(members.length).toBe(2);
  });

  it('Invalid invite token → 404', async () => {
    const { status } = await inject(app, 'POST', '/api/v1/teams/join', {
      token: outsiderToken,
      body: { token: 'invalid-token-xxxx' },
    });
    expect(status).toBe(404);
  });
});
