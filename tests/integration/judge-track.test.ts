/**
 * JUDGE-TRACK integration tests
 *
 * Tests the full judge→track assignment flow:
 *   - Admin CRUD on /hackathons/:hackathonId/judges
 *   - Public per-track view
 *   - Judge self-service /judging/my-tracks
 *   - Business-rule guards (role check, track-in-hackathon, duplicate)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestApp, inject } from '../helpers/app';
import { createTestUser, cleanupUsers, cleanupHackathons } from '../helpers/db';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;

// ── shared IDs ─────────────────────────────────────────────────────────────
let adminToken: string;
let judgeToken: string;
let participantToken: string;
let adminId: string;
let judgeId: string;
let participantId: string;
let hackathonId: string;
let trackId: string;
let otherHackathonId: string;   // for track-not-in-hackathon test
let otherTrackId: string;       // belongs to otherHackathonId
let judgeTrackId: string;       // created by the assign test

describe('JUDGE-TRACK FLOW', () => {
  beforeAll(async () => {
    app = await getTestApp();
    const suffix = Date.now();

    // Users
    const admin = await createTestUser({
      email: `jt-admin-${suffix}@hackflow.test`,
      username: `jtadmin${suffix}`,
      role: 'admin',
    });
    adminId = admin.id;

    const judge = await createTestUser({
      email: `jt-judge-${suffix}@hackflow.test`,
      username: `jtjudge${suffix}`,
      role: 'judge',
    });
    judgeId = judge.id;

    const participant = await createTestUser({
      email: `jt-part-${suffix}@hackflow.test`,
      username: `jtpart${suffix}`,
    });
    participantId = participant.id;

    // Tokens
    const al = await inject(app, 'POST', '/api/v1/auth/login', {
      body: { email: admin.email, password: 'Test1234!' },
    });
    adminToken = (al.body.data as Record<string, unknown>).accessToken as string;

    const jl = await inject(app, 'POST', '/api/v1/auth/login', {
      body: { email: judge.email, password: 'Test1234!' },
    });
    judgeToken = (jl.body.data as Record<string, unknown>).accessToken as string;

    const pl = await inject(app, 'POST', '/api/v1/auth/login', {
      body: { email: participant.email, password: 'Test1234!' },
    });
    participantToken = (pl.body.data as Record<string, unknown>).accessToken as string;

    // Primary hackathon
    const hackRes = await inject(app, 'POST', '/api/v1/hackathons', {
      token: adminToken,
      body: {
        title: `JT Hackathon ${suffix}`,
        online: true,
        startDate: new Date(Date.now() + 86400000).toISOString(),
        endDate: new Date(Date.now() + 5 * 86400000).toISOString(),
        minTeamSize: 1,
        maxTeamSize: 5,
      },
    });
    hackathonId = (hackRes.body.data as Record<string, unknown>).id as string;

    // Track in primary hackathon
    const trackRes = await inject(app, 'POST', `/api/v1/hackathons/${hackathonId}/tracks`, {
      token: adminToken,
      body: { name: `JT Track ${suffix}` },
    });
    trackId = (trackRes.body.data as Record<string, unknown>).id as string;

    // Secondary hackathon + track (for cross-hackathon validation test)
    const otherHackRes = await inject(app, 'POST', '/api/v1/hackathons', {
      token: adminToken,
      body: {
        title: `JT Other Hackathon ${suffix}`,
        online: true,
        startDate: new Date(Date.now() + 86400000).toISOString(),
        endDate: new Date(Date.now() + 5 * 86400000).toISOString(),
        minTeamSize: 1,
        maxTeamSize: 5,
      },
    });
    otherHackathonId = (otherHackRes.body.data as Record<string, unknown>).id as string;

    const otherTrackRes = await inject(app, 'POST', `/api/v1/hackathons/${otherHackathonId}/tracks`, {
      token: adminToken,
      body: { name: `JT Other Track ${suffix}` },
    });
    otherTrackId = (otherTrackRes.body.data as Record<string, unknown>).id as string;
  });

  afterAll(async () => {
    if (hackathonId) await cleanupHackathons([hackathonId]);
    if (otherHackathonId) await cleanupHackathons([otherHackathonId]);
    await cleanupUsers([adminId, judgeId, participantId]);
  });

  // ── List ────────────────────────────────────────────────────────────────

  it('GET /hackathons/:id/judges → 200, empty array (admin)', async () => {
    const { status, body } = await inject(
      app, 'GET', `/api/v1/hackathons/${hackathonId}/judges`,
      { token: adminToken },
    );
    expect(status).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
    expect((body.data as unknown[]).length).toBe(0);
  });

  it('GET /hackathons/:id/judges → 401 for non-admin', async () => {
    const { status } = await inject(
      app, 'GET', `/api/v1/hackathons/${hackathonId}/judges`,
      { token: participantToken },
    );
    expect(status).toBe(401);
  });

  // ── Validation guards ────────────────────────────────────────────────────

  it('POST /hackathons/:id/judges → 400/404 if trackId does not belong to hackathon', async () => {
    const { status } = await inject(
      app, 'POST', `/api/v1/hackathons/${hackathonId}/judges`,
      {
        token: adminToken,
        body: { userId: judgeId, trackId: otherTrackId, isHeadJudge: false },
      },
    );
    // Service throws 404 "Track not found in this hackathon"
    expect(status).toBe(404);
  });

  it('POST /hackathons/:id/judges → 403 if user does not have judge role', async () => {
    const { status } = await inject(
      app, 'POST', `/api/v1/hackathons/${hackathonId}/judges`,
      {
        token: adminToken,
        body: { userId: participantId, trackId, isHeadJudge: false },
      },
    );
    expect(status).toBe(403);
  });

  // ── Assign ────────────────────────────────────────────────────────────────

  it('POST /hackathons/:id/judges → 201, assigns judge to track', async () => {
    const { status, body } = await inject(
      app, 'POST', `/api/v1/hackathons/${hackathonId}/judges`,
      {
        token: adminToken,
        body: { userId: judgeId, trackId, isHeadJudge: false },
      },
    );
    expect(status).toBe(201);
    const data = body.data as Record<string, unknown>;
    expect(data.id).toBeTruthy();
    expect(data.isHeadJudge).toBe(false);
    judgeTrackId = data.id as string;
  });

  it('POST /hackathons/:id/judges → 409 on duplicate assignment', async () => {
    const { status } = await inject(
      app, 'POST', `/api/v1/hackathons/${hackathonId}/judges`,
      {
        token: adminToken,
        body: { userId: judgeId, trackId, isHeadJudge: false },
      },
    );
    expect(status).toBe(409);
  });

  // ── List after assign ─────────────────────────────────────────────────────

  it('GET /hackathons/:id/judges → 200, returns 1 enriched assignment', async () => {
    const { status, body } = await inject(
      app, 'GET', `/api/v1/hackathons/${hackathonId}/judges`,
      { token: adminToken },
    );
    expect(status).toBe(200);
    const list = body.data as Record<string, unknown>[];
    expect(list.length).toBe(1);
    const entry = list[0] as Record<string, unknown>;
    expect((entry.judge as Record<string, unknown>).id).toBe(judgeId);
    expect((entry.track as Record<string, unknown>).id).toBe(trackId);
  });

  it('GET /hackathons/:id/tracks/:trackId/judges → 200, public (participant token)', async () => {
    const { status, body } = await inject(
      app,
      'GET',
      `/api/v1/hackathons/${hackathonId}/tracks/${trackId}/judges`,
      { token: participantToken },
    );
    expect(status).toBe(200);
    const list = body.data as Record<string, unknown>[];
    expect(list.length).toBe(1);
    expect((list[0] as Record<string, unknown>).isHeadJudge).toBe(false);
  });

  // ── Update ────────────────────────────────────────────────────────────────

  it('PATCH /hackathons/:id/judges/:jtId → 200, isHeadJudge toggled to true', async () => {
    const { status, body } = await inject(
      app, 'PATCH', `/api/v1/hackathons/${hackathonId}/judges/${judgeTrackId}`,
      { token: adminToken, body: { isHeadJudge: true } },
    );
    expect(status).toBe(200);
    expect((body.data as Record<string, unknown>).isHeadJudge).toBe(true);
  });

  it('PATCH /hackathons/:id/judges/:jtId → 404 for unknown id', async () => {
    const { status } = await inject(
      app,
      'PATCH',
      `/api/v1/hackathons/${hackathonId}/judges/00000000-0000-0000-0000-000000000000`,
      { token: adminToken, body: { isHeadJudge: false } },
    );
    expect(status).toBe(404);
  });

  // ── My tracks ─────────────────────────────────────────────────────────────

  it('GET /judging/my-tracks → 200, returns the assigned track for the judge', async () => {
    const { status, body } = await inject(
      app,
      'GET',
      `/api/v1/judging/my-tracks?hackathonId=${hackathonId}`,
      { token: judgeToken },
    );
    expect(status).toBe(200);
    const list = body.data as Array<{ track: { id: string }; isHeadJudge: boolean }>;
    expect(list.length).toBe(1);
    expect(list[0].track.id).toBe(trackId);
  });

  it('GET /judging/my-tracks → 401 for participant (not a judge)', async () => {
    const { status } = await inject(
      app,
      'GET',
      `/api/v1/judging/my-tracks?hackathonId=${hackathonId}`,
      { token: participantToken },
    );
    expect(status).toBe(401);
  });

  // ── Delete ────────────────────────────────────────────────────────────────

  it('DELETE /hackathons/:id/judges/:jtId → 204', async () => {
    const { status } = await inject(
      app, 'DELETE', `/api/v1/hackathons/${hackathonId}/judges/${judgeTrackId}`,
      { token: adminToken },
    );
    expect(status).toBe(204);
  });

  it('DELETE /hackathons/:id/judges/:jtId → 404 for unknown id', async () => {
    const { status } = await inject(
      app,
      'DELETE',
      `/api/v1/hackathons/${hackathonId}/judges/00000000-0000-0000-0000-000000000000`,
      { token: adminToken },
    );
    expect(status).toBe(404);
  });

  it('GET /hackathons/:id/judges → 200, empty again after deletion', async () => {
    const { status, body } = await inject(
      app, 'GET', `/api/v1/hackathons/${hackathonId}/judges`,
      { token: adminToken },
    );
    expect(status).toBe(200);
    expect((body.data as unknown[]).length).toBe(0);
  });
});
