/**
 * DB test utilities — create and clean up test data.
 */
import 'dotenv/config';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { inArray, eq } from 'drizzle-orm';
import * as schema from '../../src/drizzle/schema';
import { env } from '../../src/config/env';
import { hashPassword } from '../../src/utils/password';

function createPool(): Pool {
  return new Pool({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
  });
}

const pool = createPool();
export const testDb = drizzle(pool, { schema });

/** Ensure all 4 roles exist */
export async function seedRoles(): Promise<void> {
  const roleNames: Array<'admin' | 'judge' | 'mentor' | 'participant'> = [
    'admin', 'judge', 'mentor', 'participant',
  ];
  for (const name of roleNames) {
    await testDb.insert(schema.roles).values({ name }).onConflictDoNothing().execute();
  }
}

/** Get a role ID by name */
export async function getRoleId(name: 'admin' | 'judge' | 'mentor' | 'participant'): Promise<string> {
  const [role] = await testDb.select().from(schema.roles).where(eq(schema.roles.name, name)).limit(1);
  if (!role) throw new Error(`Role '${name}' not found — run seedRoles() first`);
  return role.id;
}

/** Create a user directly in the DB (bypasses API for test setup) */
export async function createTestUser(opts: {
  email: string;
  username: string;
  fullName?: string;
  password?: string;
  role?: 'admin' | 'judge' | 'mentor' | 'participant';
  hackathonId?: string;
  isLookingForTeam?: boolean;
  skills?: string[];
}): Promise<{ id: string; email: string; username: string }> {
  const passwordHash = await hashPassword(opts.password ?? 'Test1234!');
  const [user] = await testDb
    .insert(schema.users)
    .values({
      email: opts.email,
      username: opts.username,
      fullName: opts.fullName ?? 'Test User',
      passwordHash,
      isLookingForTeam: opts.isLookingForTeam ?? false,
      skills: opts.skills ?? null,
    })
    .returning();

  if (opts.role) {
    const roleId = await getRoleId(opts.role);
    await testDb.insert(schema.userRoles).values({
      userId: user.id,
      roleId,
      hackathonId: opts.hackathonId ?? null,
    });
  }

  return { id: user.id, email: user.email, username: user.username };
}

/** Delete test users (cascades to tokens, roles, members, etc.) */
export async function cleanupUsers(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await testDb.delete(schema.users).where(inArray(schema.users.id, ids));
}

/** Delete test hackathons (cascades to stages, tracks, teams, etc.) */
export async function cleanupHackathons(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await testDb.delete(schema.hackathons).where(inArray(schema.hackathons.id, ids));
}

export async function closeTestPool(): Promise<void> {
  await pool.end();
}
