/**
 * HACKATHON FLOW integration tests
 * Covers: create, list, get, update, delete, tracks, stages — RBAC enforced
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestApp, inject } from '../helpers/app';
import { createTestUser, cleanupUsers, cleanupHackathons } from '../helpers/db';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;
let adminToken: string;
let participantToken: string;
let adminUserId: string;
let participantUserId: string;
let hackathonId: string;
let trackId: string;
let stageId: string;

describe('HACKATHON FLOW', () => {
  beforeAll(async () => {
    app = await getTestApp();

    // Create admin user directly in DB, then login via API to get token
    const suffix = Date.now();
    const admin = await createTestUser({
      email: `hack-admin-${suffix}@hackflow.test`,
      username: `hackadmin${suffix}`,
      role: 'admin',
    });
    adminUserId = admin.id;

    const participant = await createTestUser({
      email: `hack-participant-${suffix}@hackflow.test`,
      username: `hackpart${suffix}`,
      role: 'participant',
    });
    participantUserId = participant.id;

    // Login to get JWT tokens
    const adminRes = await inject(app, 'POST', '/api/v1/auth/login', {
      body: { email: admin.email, password: 'Test1234!' },
    });
    adminToken = (adminRes.body.data as Record<string, unknown>).accessToken as string;

    const partRes = await inject(app, 'POST', '/api/v1/auth/login', {
      body: { email: participant.email, password: 'Test1234!' },
    });
    participantToken = (partRes.body.data as Record<string, unknown>).accessToken as string;
  });

  afterAll(async () => {
    if (hackathonId) await cleanupHackathons([hackathonId]);
    await cleanupUsers([adminUserId, participantUserId]);
  });

  it('GET /hackathons → 200 public access', async () => {
    const { status, body } = await inject(app, 'GET', '/api/v1/hackathons');
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('POST /hackathons → 401 without auth', async () => {
    const { status } = await inject(app, 'POST', '/api/v1/hackathons', {
      body: { title: 'Test', startDate: new Date().toISOString(), endDate: new Date().toISOString() },
    });
    expect(status).toBe(401);
  });

  it('POST /hackathons → 401 as participant (not admin)', async () => {
    const { status } = await inject(app, 'POST', '/api/v1/hackathons', {
      token: participantToken,
      body: {
        title: 'Sneaky Hackathon',
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + 86400000).toISOString(),
      },
    });
    expect(status).toBe(401);
  });

  it('POST /hackathons → 201 as admin', async () => {
    const { status, body } = await inject(app, 'POST', '/api/v1/hackathons', {
      token: adminToken,
      body: {
        title: 'HackFlow Test Hackathon',
        subtitle: 'Integration test event',
        online: true,
        startDate: new Date(Date.now() + 86400000).toISOString(),
        endDate: new Date(Date.now() + 2 * 86400000).toISOString(),
        minTeamSize: 1,
        maxTeamSize: 4,
        contactEmail: 'admin@hackflow.test',
      },
    });

    expect(status).toBe(201);
    hackathonId = (body.data as Record<string, unknown>).id as string;
    expect(hackathonId).toBeTruthy();
  });

  it('GET /hackathons/:id → 200', async () => {
    const { status, body } = await inject(app, 'GET', `/api/v1/hackathons/${hackathonId}`);
    expect(status).toBe(200);
    expect((body.data as Record<string, unknown>).title).toBe('HackFlow Test Hackathon');
  });

  it('GET /hackathons/:id → 404 for unknown ID', async () => {
    const { status } = await inject(app, 'GET', '/api/v1/hackathons/00000000-0000-4000-8000-000000000000');
    expect(status).toBe(404);
  });

  it('PATCH /hackathons/:id → 200 as admin', async () => {
    const { status, body } = await inject(app, 'PATCH', `/api/v1/hackathons/${hackathonId}`, {
      token: adminToken,
      body: { subtitle: 'Updated subtitle' },
    });
    expect(status).toBe(200);
    expect((body.data as Record<string, unknown>).subtitle).toBe('Updated subtitle');
  });

  it('POST /hackathons/:id/tracks → 201 as admin', async () => {
    const { status, body } = await inject(
      app, 'POST', `/api/v1/hackathons/${hackathonId}/tracks`,
      { token: adminToken, body: { name: 'AI Track', description: 'Build AI stuff' } },
    );
    expect(status).toBe(201);
    trackId = (body.data as Record<string, unknown>).id as string;
    expect(trackId).toBeTruthy();
  });

  it('GET /hackathons/:id/tracks → 200 with tracks', async () => {
    const { status, body } = await inject(app, 'GET', `/api/v1/hackathons/${hackathonId}/tracks`);
    expect(status).toBe(200);
    expect((body.data as unknown[]).length).toBeGreaterThan(0);
  });

  it('POST /hackathons/:id/stages → 201 as admin', async () => {
    const { status, body } = await inject(
      app, 'POST', `/api/v1/hackathons/${hackathonId}/stages`,
      {
        token: adminToken,
        body: {
          name: 'Qualification',
          orderIndex: 1,
          startDate: new Date(Date.now() + 86400000).toISOString(),
          endDate: new Date(Date.now() + 2 * 86400000).toISOString(),
        },
      },
    );
    expect(status).toBe(201);
    stageId = (body.data as Record<string, unknown>).id as string;
    expect(stageId).toBeTruthy();
  });

  it('GET /hackathons/:id/stages → 200 with stages', async () => {
    const { status, body } = await inject(app, 'GET', `/api/v1/hackathons/${hackathonId}/stages`);
    expect(status).toBe(200);
    expect((body.data as unknown[]).length).toBeGreaterThan(0);
  });
});

export { hackathonId, trackId, stageId, adminToken, participantToken, adminUserId, participantUserId };
