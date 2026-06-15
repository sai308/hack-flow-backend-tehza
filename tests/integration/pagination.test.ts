/**
 * Integration tests for pagination and filtering across:
 *   - GET /hackathons?page&limit&status
 *   - GET /teams?page&limit&hackathon_id&track_id
 *   - GET /users?page&limit
 *   - GET /users/looking-for-team?skills
 */
import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { getTestApp, inject } from '../helpers/app';
import {
  createTestUser,
  cleanupUsers,
  cleanupHackathons,
} from '../helpers/db';
import type { FastifyInstance } from 'fastify';

describe('Pagination & Filtering', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let participantToken: string;
  let adminUserId: string;
  let participantUserId: string;
  let hackathonId: string;
  let trackId: string;

  beforeAll(async () => {
    app = await getTestApp();
    const suffix = Date.now();

    // Create admin via DB helper (assigns role)
    const admin = await createTestUser({
      email: `pg-admin-${suffix}@hackflow.test`,
      username: `pgadmin${suffix}`,
      role: 'admin',
    });
    adminUserId = admin.id;

    const participant = await createTestUser({
      email: `pg-part-${suffix}@hackflow.test`,
      username: `pgpart${suffix}`,
      role: 'participant',
      skills: ['typescript', 'postgres'],
      isLookingForTeam: true,
    });
    participantUserId = participant.id;

    // Login to obtain JWT tokens
    const adminRes = await inject(app, 'POST', '/api/v1/auth/login', {
      body: { email: admin.email, password: 'Test1234!' },
    });
    adminToken = (adminRes.body.data as Record<string, unknown>).accessToken as string;

    const partRes = await inject(app, 'POST', '/api/v1/auth/login', {
      body: { email: participant.email, password: 'Test1234!' },
    });
    participantToken = (partRes.body.data as Record<string, unknown>).accessToken as string;

    // Create a hackathon (active: started yesterday, ends tomorrow)
    const hRes = await inject(app, 'POST', '/api/v1/hackathons', {
      token: adminToken,
      body: {
        title: 'Pagination Test Hackathon',
        online: true,
        startDate: new Date(Date.now() - 86_400_000).toISOString(),
        endDate: new Date(Date.now() + 86_400_000).toISOString(),
      },
    });
    hackathonId = (hRes.body.data as Record<string, unknown>).id as string;

    // Create a track
    const trRes = await inject(app, 'POST', `/api/v1/hackathons/${hackathonId}/tracks`, {
      token: adminToken,
      body: { name: 'PG Track' },
    });
    trackId = (trRes.body.data as Record<string, unknown>).id as string;

    // Create 3 teams in this hackathon
    for (let i = 1; i <= 3; i++) {
      await inject(app, 'POST', '/api/v1/teams', {
        token: adminToken,
        body: { name: `PG Team ${i}`, hackathonId, trackId },
      });
    }
  });

  afterAll(async () => {
    if (hackathonId) await cleanupHackathons([hackathonId]);
    await cleanupUsers([adminUserId, participantUserId]);
  });

  // ── Hackathons ────────────────────────────────────────────────────
  describe('GET /hackathons', () => {
    it('returns paginated meta', async () => {
      const { status, body } = await inject(app, 'GET', '/api/v1/hackathons?page=1&limit=5');
      expect(status).toBe(200);
      expect(body.meta).toMatchObject({
        page: 1,
        limit: 5,
        total: expect.any(Number),
        totalPages: expect.any(Number),
      });
    });

    it('filters by status=active — all results span today', async () => {
      const { status, body } = await inject(app, 'GET', '/api/v1/hackathons?status=active');
      expect(status).toBe(200);
      const now = Date.now();
      for (const h of body.data as Array<{ startDate: string; endDate: string }>) {
        expect(new Date(h.startDate).getTime()).toBeLessThanOrEqual(now);
        expect(new Date(h.endDate).getTime()).toBeGreaterThanOrEqual(now);
      }
    });

    it('filters by status=upcoming — all results start in the future', async () => {
      const { status, body } = await inject(app, 'GET', '/api/v1/hackathons?status=upcoming');
      expect(status).toBe(200);
      const now = Date.now();
      for (const h of body.data as Array<{ startDate: string }>) {
        expect(new Date(h.startDate).getTime()).toBeGreaterThan(now);
      }
    });

    it('respects limit=1', async () => {
      const { status, body } = await inject(app, 'GET', '/api/v1/hackathons?page=1&limit=1');
      expect(status).toBe(200);
      expect((body.data as unknown[]).length).toBe(1);
    });
  });

  // ── Teams ─────────────────────────────────────────────────────────
  describe('GET /teams', () => {
    it('returns paginated meta', async () => {
      const { status, body } = await inject(app, 'GET', '/api/v1/teams?page=1&limit=10');
      expect(status).toBe(200);
      expect(body.meta).toMatchObject({ page: 1, limit: 10 });
    });

    it('filters by hackathon_id', async () => {
      const { status, body } = await inject(
        app, 'GET', `/api/v1/teams?hackathon_id=${hackathonId}`,
      );
      expect(status).toBe(200);
      const teams = body.data as Array<{ hackathonId: string }>;
      expect(teams.length).toBeGreaterThanOrEqual(3);
      for (const t of teams) expect(t.hackathonId).toBe(hackathonId);
    });

    it('filters by track_id', async () => {
      const { status, body } = await inject(
        app, 'GET', `/api/v1/teams?track_id=${trackId}`,
      );
      expect(status).toBe(200);
      const teams = body.data as Array<{ trackId: string }>;
      for (const t of teams) expect(t.trackId).toBe(trackId);
    });
  });

  // ── Users ─────────────────────────────────────────────────────────
  describe('GET /users', () => {
    it('returns paginated users', async () => {
      const { status, body } = await inject(app, 'GET', '/api/v1/users?page=1&limit=5');
      expect(status).toBe(200);
      expect(body.meta).toMatchObject({ page: 1, limit: 5 });
    });

    it('strips passwordHash from every user', async () => {
      const { body } = await inject(app, 'GET', '/api/v1/users?limit=50');
      for (const u of body.data as Array<Record<string, unknown>>) {
        expect(u['passwordHash']).toBeUndefined();
      }
    });
  });

  // ── Matchmaking ───────────────────────────────────────────────────
  describe('GET /users/looking-for-team', () => {
    it('returns 200 with array', async () => {
      const { status, body } = await inject(app, 'GET', '/api/v1/users/looking-for-team');
      expect(status).toBe(200);
      expect(Array.isArray(body.data)).toBe(true);
    });

    it('the seeded participant (isLookingForTeam=true) appears in results', async () => {
      const { body } = await inject(app, 'GET', '/api/v1/users/looking-for-team');
      const data = body.data as Array<{ id: string }>;
      const found = data.some((u) => u.id === participantUserId);
      expect(found).toBe(true);
    });

    it('filters by skills=typescript', async () => {
      const { status, body } = await inject(
        app, 'GET', '/api/v1/users/looking-for-team?skills=typescript',
      );
      expect(status).toBe(200);
      const data = body.data as Array<{ id: string }>;
      const found = data.some((u) => u.id === participantUserId);
      expect(found).toBe(true);
    });

    it('returns empty when skill does not match any user', async () => {
      const { status, body } = await inject(
        app, 'GET', '/api/v1/users/looking-for-team?skills=nonexistentskill99',
      );
      expect(status).toBe(200);
      expect((body.data as unknown[]).length).toBe(0);
    });
  });
});
