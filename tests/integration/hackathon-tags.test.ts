/**
 * HACKATHON-TAGS integration tests
 *
 * Covers the full tag lifecycle:
 *   - Global tag CRUD (/tags)
 *   - Per-hackathon tag assignment (/hackathons/:id/tags)
 *   - Hackathon list filtering by tag (?tags=...)
 *   - Tag enrichment on hackathon detail (GET /hackathons/:id)
 *
 * Tag names are suffixed with a unique timestamp to avoid collisions when
 * the suite runs multiple times against the same DB (global tags are UNIQUE).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestApp, inject } from '../helpers/app';
import { createTestUser, cleanupUsers, cleanupHackathons, testDb } from '../helpers/db';
import * as schema from '../../src/drizzle/schema';
import { eq, inArray } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;

let adminToken: string;
let adminId: string;
let hackathonId: string;
let otherHackathonId: string;

// Unique tag names per run
let tagReactName: string;
let tagAiName: string;

// Tag IDs set during tests
let tagReactId: string;
let tagAiId: string;

describe('HACKATHON-TAGS FLOW', () => {
  beforeAll(async () => {
    app = await getTestApp();
    const suffix = Date.now();

    // Unique tag names so parallel/repeated runs don't conflict on the UNIQUE constraint
    tagReactName = `react${suffix}`;
    tagAiName = `ai${suffix}`;

    const admin = await createTestUser({
      email: `tags-admin-${suffix}@hackflow.test`,
      username: `tagsadmin${suffix}`,
      role: 'admin',
    });
    adminId = admin.id;

    const al = await inject(app, 'POST', '/api/v1/auth/login', {
      body: { email: admin.email, password: 'Test1234!' },
    });
    adminToken = (al.body.data as Record<string, unknown>).accessToken as string;

    // Primary hackathon
    const hackRes = await inject(app, 'POST', '/api/v1/hackathons', {
      token: adminToken,
      body: {
        title: `Tags Hackathon ${suffix}`,
        online: true,
        startDate: new Date(Date.now() + 86400000).toISOString(),
        endDate: new Date(Date.now() + 5 * 86400000).toISOString(),
        minTeamSize: 1,
        maxTeamSize: 5,
      },
    });
    hackathonId = (hackRes.body.data as Record<string, unknown>).id as string;

    // Secondary hackathon (for AND-filter test)
    const other = await inject(app, 'POST', '/api/v1/hackathons', {
      token: adminToken,
      body: {
        title: `Tags Other Hackathon ${suffix}`,
        online: true,
        startDate: new Date(Date.now() + 86400000).toISOString(),
        endDate: new Date(Date.now() + 5 * 86400000).toISOString(),
        minTeamSize: 1,
        maxTeamSize: 5,
      },
    });
    otherHackathonId = (other.body.data as Record<string, unknown>).id as string;
  });

  afterAll(async () => {
    // Delete hackathons first (cascades tag relations), then global tags, then users
    if (hackathonId) await cleanupHackathons([hackathonId]);
    if (otherHackathonId) await cleanupHackathons([otherHackathonId]);

    // Clean up global tags created by this run
    const tagIds = [tagReactId, tagAiId].filter(Boolean);
    if (tagIds.length > 0) {
      await testDb.delete(schema.hackathonTags).where(inArray(schema.hackathonTags.id, tagIds));
    }

    await cleanupUsers([adminId]);
  });

  // ── Global tag list ──────────────────────────────────────────────────────

  it('GET /tags → 200, returns array (public, no auth)', async () => {
    const { status, body } = await inject(app, 'GET', '/api/v1/tags');
    expect(status).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
  });

  // ── Create tags ──────────────────────────────────────────────────────────

  it('POST /tags → 201, name normalized to lowercase', async () => {
    const { status, body } = await inject(app, 'POST', '/api/v1/tags', {
      token: adminToken,
      body: { name: tagReactName.toUpperCase() }, // uppercase input
    });
    expect(status).toBe(201);
    const data = body.data as Record<string, unknown>;
    expect(data.name).toBe(tagReactName.toLowerCase()); // normalized
    tagReactId = data.id as string;
  });

  it('POST /tags → 409 on duplicate name (case-insensitive)', async () => {
    const { status } = await inject(app, 'POST', '/api/v1/tags', {
      token: adminToken,
      body: { name: tagReactName.toUpperCase() }, // same tag, different case
    });
    expect(status).toBe(409);
  });

  it('POST /tags → 201, creates second tag', async () => {
    const { status, body } = await inject(app, 'POST', '/api/v1/tags', {
      token: adminToken,
      body: { name: tagAiName },
    });
    expect(status).toBe(201);
    tagAiId = (body.data as Record<string, unknown>).id as string;
    expect((body.data as Record<string, unknown>).name).toBe(tagAiName.toLowerCase());
  });

  // ── Per-hackathon tags (empty state) ─────────────────────────────────────

  it('GET /hackathons/:id/tags → 200, empty array initially', async () => {
    const { status, body } = await inject(
      app, 'GET', `/api/v1/hackathons/${hackathonId}/tags`,
    );
    expect(status).toBe(200);
    expect((body.data as unknown[]).length).toBe(0);
  });

  // ── Attach tags ───────────────────────────────────────────────────────────

  it('POST /hackathons/:id/tags → 200, attaches tags (idempotent)', async () => {
    const { status, body } = await inject(
      app, 'POST', `/api/v1/hackathons/${hackathonId}/tags`,
      { token: adminToken, body: { tagIds: [tagReactId, tagAiId] } },
    );
    expect(status).toBe(200);
    const names = (body.data as Array<{ name: string }>).map((t) => t.name);
    expect(names).toContain(tagReactName);
    expect(names).toContain(tagAiName);
  });

  it('POST /hackathons/:id/tags → 200 again (idempotent, no duplicate error)', async () => {
    const { status, body } = await inject(
      app, 'POST', `/api/v1/hackathons/${hackathonId}/tags`,
      { token: adminToken, body: { tagIds: [tagReactId] } },
    );
    expect(status).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('POST /hackathons/:id/tags → 404 if a tagId does not exist', async () => {
    const { status } = await inject(
      app, 'POST', `/api/v1/hackathons/${hackathonId}/tags`,
      {
        token: adminToken,
        body: { tagIds: ['00000000-0000-0000-0000-000000000000'] },
      },
    );
    expect(status).toBe(404);
  });

  // ── GET /hackathons/:id includes tags[] ───────────────────────────────────

  it('GET /hackathons/:id → tags[] included in response', async () => {
    const { status, body } = await inject(
      app, 'GET', `/api/v1/hackathons/${hackathonId}`,
    );
    expect(status).toBe(200);
    const data = body.data as Record<string, unknown>;
    expect(Array.isArray(data.tags)).toBe(true);
    const tagNames = (data.tags as Array<{ name: string }>).map((t) => t.name);
    expect(tagNames).toContain(tagReactName);
    expect(tagNames).toContain(tagAiName);
  });

  // ── Filtering ─────────────────────────────────────────────────────────────

  it(`GET /hackathons?tags=${tagReactName} → returns hackathon tagged`, async () => {
    const { status, body } = await inject(
      app, 'GET', `/api/v1/hackathons?tags=${tagReactName}`,
    );
    expect(status).toBe(200);
    const ids = (body.data as Array<{ id: string }>).map((h) => h.id);
    expect(ids).toContain(hackathonId);
    expect(ids).not.toContain(otherHackathonId);
  });

  it('GET /hackathons?tags=tagA,tagB → AND logic: only hackathon with BOTH tags', async () => {
    // Give otherHackathon only tagReact (not tagAi)
    await inject(app, 'POST', `/api/v1/hackathons/${otherHackathonId}/tags`, {
      token: adminToken,
      body: { tagIds: [tagReactId] },
    });

    const { status, body } = await inject(
      app, 'GET', `/api/v1/hackathons?tags=${tagReactName},${tagAiName}`,
    );
    expect(status).toBe(200);
    const ids = (body.data as Array<{ id: string }>).map((h) => h.id);
    expect(ids).toContain(hackathonId);           // has both ✓
    expect(ids).not.toContain(otherHackathonId);  // only one ✗
  });

  it('GET /hackathons?tags=nonexistent → 200 with empty data (not 404)', async () => {
    const { status, body } = await inject(
      app, 'GET', '/api/v1/hackathons?tags=nonexistent',
    );
    expect(status).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
    expect((body.data as unknown[]).length).toBe(0);
  });

  // ── Detach ────────────────────────────────────────────────────────────────

  it('DELETE /hackathons/:id/tags/:tagId → 204, detaches tag', async () => {
    const { status } = await inject(
      app,
      'DELETE',
      `/api/v1/hackathons/${hackathonId}/tags/${tagAiId}`,
      { token: adminToken },
    );
    expect(status).toBe(204);

    // Confirm it's gone
    const after = await inject(app, 'GET', `/api/v1/hackathons/${hackathonId}/tags`);
    const names = (after.body.data as Array<{ name: string }>).map((t) => t.name);
    expect(names).not.toContain(tagAiName);
    expect(names).toContain(tagReactName);
  });

  it('DELETE /hackathons/:id/tags/:tagId → 404 if relation does not exist', async () => {
    const { status } = await inject(
      app,
      'DELETE',
      `/api/v1/hackathons/${hackathonId}/tags/${tagAiId}`, // already detached
      { token: adminToken },
    );
    expect(status).toBe(404);
  });

  // ── Delete global tag ─────────────────────────────────────────────────────

  it('DELETE /tags/:id → 409 when tag is still attached to a hackathon', async () => {
    const { status } = await inject(
      app, 'DELETE', `/api/v1/tags/${tagReactId}`,
      { token: adminToken },
    );
    expect(status).toBe(409);
  });

  it('DELETE /tags/:id → 204 when tag is unused', async () => {
    // tagAiId was detached — safe to delete; remove from cleanup set
    const { status } = await inject(
      app, 'DELETE', `/api/v1/tags/${tagAiId}`,
      { token: adminToken },
    );
    expect(status).toBe(204);
    // Mark as deleted so afterAll skips it
    tagAiId = '';
  });

  it('DELETE /tags/:id → 404 for unknown id', async () => {
    const { status } = await inject(
      app,
      'DELETE',
      '/api/v1/tags/00000000-0000-0000-0000-000000000000',
      { token: adminToken },
    );
    expect(status).toBe(404);
  });
});
