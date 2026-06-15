/**
 * PROJECT FLOW integration tests
 * Covers: create draft, submit, review (admin/judge only), resources
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestApp, inject } from '../helpers/app';
import { createTestUser, cleanupUsers, cleanupHackathons, testDb } from '../helpers/db';
import * as schema from '../../src/drizzle/schema';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;
let participantToken: string;
let judgeToken: string;
let participantId: string;
let judgeId: string;
let adminId: string;
let hackathonId: string;
let stageId: string;
let teamId: string;
let projectId: string;
let resourceTypeId: string;

describe('PROJECT FLOW', () => {
  beforeAll(async () => {
    app = await getTestApp();
    const suffix = Date.now();

    // Admin
    const admin = await createTestUser({
      email: `proj-admin-${suffix}@hackflow.test`,
      username: `projadmin${suffix}`,
      role: 'admin',
    });
    adminId = admin.id;

    // Participant
    const participant = await createTestUser({
      email: `proj-part-${suffix}@hackflow.test`,
      username: `projpart${suffix}`,
      role: 'participant',
    });
    participantId = participant.id;

    // Judge
    const judge = await createTestUser({
      email: `proj-judge-${suffix}@hackflow.test`,
      username: `projjudge${suffix}`,
      role: 'judge',
    });
    judgeId = judge.id;

    // Login
    const adminLogin = await inject(app, 'POST', '/api/v1/auth/login', {
      body: { email: admin.email, password: 'Test1234!' },
    });
    const adminToken = (adminLogin.body.data as Record<string, unknown>).accessToken as string;

    const partLogin = await inject(app, 'POST', '/api/v1/auth/login', {
      body: { email: participant.email, password: 'Test1234!' },
    });
    participantToken = (partLogin.body.data as Record<string, unknown>).accessToken as string;

    const judgeLogin = await inject(app, 'POST', '/api/v1/auth/login', {
      body: { email: judge.email, password: 'Test1234!' },
    });
    judgeToken = (judgeLogin.body.data as Record<string, unknown>).accessToken as string;

    // Create hackathon + stage
    const hackRes = await inject(app, 'POST', '/api/v1/hackathons', {
      token: adminToken,
      body: {
        title: `Project Flow Hackathon ${suffix}`,
        online: true,
        startDate: new Date(Date.now() + 86400000).toISOString(),
        endDate: new Date(Date.now() + 3 * 86400000).toISOString(),
        minTeamSize: 1,
        maxTeamSize: 5,
      },
    });
    hackathonId = (hackRes.body.data as Record<string, unknown>).id as string;

    const stageRes = await inject(app, 'POST', `/api/v1/hackathons/${hackathonId}/stages`, {
      token: adminToken,
      body: {
        name: 'Submission Stage',
        orderIndex: 1,
        startDate: new Date(Date.now() + 86400000).toISOString(),
        endDate: new Date(Date.now() + 2 * 86400000).toISOString(),
      },
    });
    stageId = (stageRes.body.data as Record<string, unknown>).id as string;

    // Create team for the participant
    const teamRes = await inject(app, 'POST', '/api/v1/teams', {
      token: participantToken,
      body: { name: `Project Team ${suffix}`, hackathonId },
    });
    teamId = (teamRes.body.data as Record<string, unknown>).id as string;

    // Create a resource type directly in DB
    const [rt] = await testDb
      .insert(schema.projectResourceTypes)
      .values({ name: `GitHub-${suffix}`, description: 'Source code' })
      .returning();
    resourceTypeId = rt.id;
  });

  afterAll(async () => {
    if (hackathonId) await cleanupHackathons([hackathonId]);
    await cleanupUsers([participantId, judgeId, adminId]);
    if (resourceTypeId) {
      await testDb
        .delete(schema.projectResourceTypes)
        .where(schema.projectResourceTypes.id ? undefined : undefined);
      // cascade from project deletion handles resources
    }
  });

  it('POST /projects → 201 — create draft', async () => {
    const { status, body } = await inject(app, 'POST', '/api/v1/projects', {
      token: participantToken,
      body: { teamId, stageId },
    });
    expect(status).toBe(201);
    expect((body.data as Record<string, unknown>).status).toBe('DRAFT');
    projectId = (body.data as Record<string, unknown>).id as string;
  });

  it('GET /projects/:id → 200', async () => {
    const { status, body } = await inject(app, 'GET', `/api/v1/projects/${projectId}`);
    expect(status).toBe(200);
    expect((body.data as Record<string, unknown>).id).toBe(projectId);
  });

  it('POST /projects/:id/resources → 201', async () => {
    const { status, body } = await inject(
      app, 'POST', `/api/v1/projects/${projectId}/resources`,
      {
        token: participantToken,
        body: {
          projectTypeId: resourceTypeId,
          url: 'https://github.com/hackflow/test-project',
          description: 'Main repo',
        },
      },
    );
    expect(status).toBe(201);
    expect((body.data as Record<string, unknown>).url).toBe('https://github.com/hackflow/test-project');
  });

  it('GET /projects/:id/resources → 200 with 1 resource', async () => {
    const { status, body } = await inject(app, 'GET', `/api/v1/projects/${projectId}/resources`);
    expect(status).toBe(200);
    expect((body.data as unknown[]).length).toBe(1);
  });

  it('POST /projects/:id/submit → 200 — status SUBMITTED', async () => {
    const { status, body } = await inject(
      app, 'POST', `/api/v1/projects/${projectId}/submit`,
      { token: participantToken },
    );
    expect(status).toBe(200);
    expect((body.data as Record<string, unknown>).status).toBe('SUBMITTED');
    expect((body.data as Record<string, unknown>).submittedAt).toBeTruthy();
  });

  it('PATCH /projects/:id/review → 401 as participant', async () => {
    const { status } = await inject(app, 'PATCH', `/api/v1/projects/${projectId}/review`, {
      token: participantToken,
      body: { status: 'APPROVED' },
    });
    expect(status).toBe(401);
  });

  it('PATCH /projects/:id/review → 200 as judge', async () => {
    const { status, body } = await inject(app, 'PATCH', `/api/v1/projects/${projectId}/review`, {
      token: judgeToken,
      body: { status: 'APPROVED', comment: 'Great work!' },
    });
    expect(status).toBe(200);
    expect((body.data as Record<string, unknown>).status).toBe('APPROVED');
    expect((body.data as Record<string, unknown>).comment).toBe('Great work!');
  });

  it('GET /projects/:id → 404 for unknown ID', async () => {
    const { status } = await inject(app, 'GET', '/api/v1/projects/00000000-0000-4000-8000-000000000000');
    expect(status).toBe(404);
  });
});
