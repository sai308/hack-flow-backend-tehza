/**
 * Runs all pending Drizzle migrations without interactive prompts.
 * Usage: npx tsx src/drizzle/migrate.ts
 */
import 'dotenv/config';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { env } from '../config/env';
import path from 'path';

async function runMigrations(): Promise<void> {
  const pool = new Pool({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
  });

  const db = drizzle(pool);

  console.log('🔄 Running migrations...');
  await migrate(db, {
    migrationsFolder: path.join(process.cwd(), 'drizzle/migrations'),
  });
  console.log('✅ Migrations applied successfully');

  await pool.end();
}

runMigrations().catch((err) => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
