/**
 * MENTORSHIP FLOW integration tests
 * Covers: availability creation, slot booking, double-booking prevention (Redis lock)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestApp, inject } from '../helpers/app';
import { createTestUser, cleanupUsers, cleanupHackathons } from '../helpers/db';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;
let mentorToken: string;
let teamMemberToken: string;
let mentorId: string;
let teamMemberId: string;
let hackathonId: string;
let teamId: string;
let availabilityId: string;

const SLOT_START = new Date(Date.now() + 2 * 86400000).toISOString();

describe('MENTORSHIP FLOW', () => {
  beforeAll(async () => {
    app = await getTestApp();
    const suffix = Date.now();

    // Setup: admin, mentor, participant
    const admin = await createTestUser({
      email: `ment-admin-${suffix}@hackflow.test`,
      username: `mentadmin${suffix}`,
      role: 'admin',
    });

    const mentor = await createTestUser({
      email: `mentor-${suffix}@hackflow.test`,
      username: `mentor${suffix}`,
      role: 'mentor',
    });
    mentorId = mentor.id;

    const teamMember = await createTestUser({
      email: `ment-member-${suffix}@hackflow.test`,
      username: `mentmember${suffix}`,
    });
    teamMemberId = teamMember.id;

    const adminLogin = await inject(app, 'POST', '/api/v1/auth/login', {
      body: { email: admin.email, password: 'Test1234!' },
    });
    const adminToken = (adminLogin.body.data as Record<string, unknown>).accessToken as string;

    const mentorLogin = await inject(app, 'POST', '/api/v1/auth/login', {
      body: { email: mentor.email, password: 'Test1234!' },
    });
    mentorToken = (mentorLogin.body.data as Record<string, unknown>).accessToken as string;

    const memberLogin = await inject(app, 'POST', '/api/v1/auth/login', {
      body: { email: teamMember.email, password: 'Test1234!' },
    });
    teamMemberToken = (memberLogin.body.data as Record<string, unknown>).accessToken as string;

    // Create hackathon + team
    const hackRes = await inject(app, 'POST', '/api/v1/hackathons', {
      token: adminToken,
      body: {
        title: `Mentorship Hackathon ${suffix}`,
        online: true,
        startDate: new Date(Date.now() + 86400000).toISOString(),
        endDate: new Date(Date.now() + 5 * 86400000).toISOString(),
        minTeamSize: 1,
        maxTeamSize: 5,
      },
    });
    hackathonId = (hackRes.body.data as Record<string, unknown>).id as string;

    const teamRes = await inject(app, 'POST', '/api/v1/teams', {
      token: teamMemberToken,
      body: { name: `Mentorship Team ${suffix}`, hackathonId },
    });
    teamId = (teamRes.body.data as Record<string, unknown>).id as string;

    await cleanupUsers([admin.id]);
  });

  afterAll(async () => {
    if (hackathonId) await cleanupHackathons([hackathonId]);
    await cleanupUsers([mentorId, teamMemberId]);
  });

  it('POST /mentorship/availabilities → 401 as non-mentor', async () => {
    const { status } = await inject(app, 'POST', '/api/v1/mentorship/availabilities', {
      token: teamMemberToken,
      body: {
        startDatetime: new Date(Date.now() + 86400000).toISOString(),
        endDatetime: new Date(Date.now() + 2 * 86400000).toISOString(),
      },
    });
    expect(status).toBe(401);
  });

  it('POST /mentorship/availabilities → 201 as mentor', async () => {
    const { status, body } = await inject(app, 'POST', '/api/v1/mentorship/availabilities', {
      token: mentorToken,
      body: {
        startDatetime: new Date(Date.now() + 86400000).toISOString(),
        endDatetime: new Date(Date.now() + 4 * 86400000).toISOString(),
      },
    });
    expect(status).toBe(201);
    availabilityId = (body.data as Record<string, unknown>).id as string;
    expect(availabilityId).toBeTruthy();
  });

  it('GET /mentorship/availabilities/mentor/:id → 200 with availability', async () => {
    const { status, body } = await inject(
      app, 'GET', `/api/v1/mentorship/availabilities/mentor/${mentorId}`,
    );
    expect(status).toBe(200);
    expect((body.data as unknown[]).length).toBeGreaterThan(0);
  });

  it('POST /mentorship/slots → 201 — first booking succeeds', async () => {
    const { status, body } = await inject(app, 'POST', '/api/v1/mentorship/slots', {
      token: teamMemberToken,
      body: {
        mentorAvailabilityId: availabilityId,
        startDatetime: SLOT_START,
        durationMinute: 30,
        teamId,
        meetingLink: 'https://meet.google.com/test-abc',
      },
    });
    expect(status).toBe(201);
    expect((body.data as Record<string, unknown>).status).toBe('booked');
  });

  it('POST /mentorship/slots → 409 — double booking MUST FAIL', async () => {
    // Attempt to book the exact same time slot again
    const { status, body } = await inject(app, 'POST', '/api/v1/mentorship/slots', {
      token: teamMemberToken,
      body: {
        mentorAvailabilityId: availabilityId,
        startDatetime: SLOT_START,
        durationMinute: 30,
        teamId,
        meetingLink: 'https://meet.google.com/test-xyz',
      },
    });
    expect(status).toBe(409);
    expect(body.code).toBe('CONFLICT');
  });

  it('GET /mentorship/availabilities/:id/slots → 200 with 1 slot', async () => {
    const { status, body } = await inject(
      app, 'GET', `/api/v1/mentorship/availabilities/${availabilityId}/slots`,
      { token: teamMemberToken },
    );
    expect(status).toBe(200);
    expect((body.data as unknown[]).length).toBe(1);
  });

  // ── hackathon_id context ───────────────────────────────────────

  it('POST /mentorship/availabilities → 201 stores hackathonId', async () => {
    const { status, body } = await inject(app, 'POST', '/api/v1/mentorship/availabilities', {
      token: mentorToken,
      body: {
        hackathonId,
        startDatetime: new Date(Date.now() + 5 * 86400000).toISOString(),
        endDatetime: new Date(Date.now() + 6 * 86400000).toISOString(),
      },
    });
    expect(status).toBe(201);
    const data = body.data as Record<string, unknown>;
    expect(data.hackathonId).toBe(hackathonId);
  });

  it('GET /mentorship/availabilities/mentor/:id?hackathonId= → filters correctly', async () => {
    const { status, body } = await inject(
      app,
      'GET',
      `/api/v1/mentorship/availabilities/mentor/${mentorId}?hackathonId=${hackathonId}`,
    );
    expect(status).toBe(200);
    const list = body.data as Record<string, unknown>[];
    // Only the hackathon-scoped availability appears
    expect(list.length).toBeGreaterThan(0);
    for (const row of list) {
      expect(row.hackathonId).toBe(hackathonId);
    }
  });

  it('GET /mentorship/availabilities?hackathonId= → lists all mentor availabilities in hackathon', async () => {
    const { status, body } = await inject(
      app,
      'GET',
      `/api/v1/mentorship/availabilities?hackathonId=${hackathonId}`,
    );
    expect(status).toBe(200);
    const list = body.data as Record<string, unknown>[];
    expect(list.length).toBeGreaterThan(0);
    for (const row of list) {
      expect(row.hackathonId).toBe(hackathonId);
    }
  });

  it('GET /mentorship/availabilities → 200 unfiltered returns all', async () => {
    const { status, body } = await inject(app, 'GET', '/api/v1/mentorship/availabilities');
    expect(status).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
  });
});
