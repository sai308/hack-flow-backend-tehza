/**
 * One-shot admin seeder
 * Usage: npx tsx src/drizzle/seed-admin.ts
 *
 * Creates an admin user if one doesn't already exist.
 * Default creds:
 *   email:    admin@hackflow.dev
 *   password: Admin1234!
 */
import 'dotenv/config';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import bcrypt from 'bcryptjs';
import { users, roles, userRoles } from './schema';
import { env } from '../config/env';
import { eq } from 'drizzle-orm';

const ADMIN_EMAIL    = process.env.SEED_EMAIL    ?? 'admin@hackflow.dev';
const ADMIN_USERNAME = process.env.SEED_USERNAME  ?? 'admin';
const ADMIN_FULLNAME = process.env.SEED_FULLNAME  ?? 'Admin User';
const ADMIN_PASSWORD = process.env.SEED_PASSWORD  ?? 'Admin1234!';

async function seedAdmin(): Promise<void> {
  const pool = new Pool({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
  });

  const db = drizzle(pool);

  // 1. Ensure roles exist
  for (const name of ['admin', 'judge', 'mentor', 'participant'] as const) {
    await db.insert(roles).values({ name }).onConflictDoNothing().execute();
  }

  // 2. Check if admin user already exists
  const existing = await db.select().from(users).where(eq(users.email, ADMIN_EMAIL)).limit(1);
  if (existing.length > 0) {
    console.log(`ℹ️  Admin user already exists (${ADMIN_EMAIL}). No changes made.`);
    await pool.end();
    return;
  }

  // 3. Hash password
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);

  // 4. Insert user
  const [user] = await db
    .insert(users)
    .values({
      email: ADMIN_EMAIL,
      username: ADMIN_USERNAME,
      fullName: ADMIN_FULLNAME,
      passwordHash,
    })
    .returning();

  if (!user) throw new Error('Failed to create user');

  // 5. Get admin role id
  const [adminRole] = await db.select().from(roles).where(eq(roles.name, 'admin')).limit(1);
  if (!adminRole) throw new Error('admin role not found — did you run the roles seed?');

  // 6. Assign admin role
  await db.insert(userRoles).values({ userId: user.id, roleId: adminRole.id }).onConflictDoNothing();

  console.log('✅ Admin user created!');
  console.log(`   Email:    ${ADMIN_EMAIL}`);
  console.log(`   Password: ${ADMIN_PASSWORD}`);
  console.log(`   Role:     admin`);

  await pool.end();
}

seedAdmin().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
