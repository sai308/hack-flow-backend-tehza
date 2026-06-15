/**
 * Database seeder — inserts the four default roles if they don't exist.
 * Run once: npx tsx src/drizzle/seed.ts
 */
import 'dotenv/config';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { roles } from './schema';
import { env } from '../config/env';

const DEFAULT_ROLES = ['admin', 'judge', 'mentor', 'participant'] as const;

async function seed(): Promise<void> {
  const pool = new Pool({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
  });

  const db = drizzle(pool);

  console.log('🌱 Seeding roles...');

  for (const name of DEFAULT_ROLES) {
    await db
      .insert(roles)
      .values({ name })
      .onConflictDoNothing()
      .execute();
    console.log(`  ✓ role: ${name}`);
  }

  await pool.end();
  console.log('✅ Seed complete');
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
