import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { env } from './env';
import * as schema from '../drizzle/schema';

let pool: Pool;
let db: ReturnType<typeof drizzle<typeof schema>>;

/** Computed connection URL (used by Drizzle Kit and test helpers) */
export function buildDatabaseUrl(): string {
  return (
    env.DATABASE_URL ??
    `postgresql://${env.DB_USER}:${encodeURIComponent(env.DB_PASSWORD)}@${env.DB_HOST}:${env.DB_PORT}/${env.DB_NAME}`
  );
}

export function createDatabaseConnection(): typeof db {
  pool = new Pool({
    // Individual params take priority — no connectionString ambiguity
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    min: env.DB_POOL_MIN,
    max: env.DB_POOL_MAX,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

  db = drizzle(pool, { schema, logger: env.NODE_ENV === 'development' });
  return db;
}

export function getDatabaseConnection(): typeof db {
  if (!db) throw new Error('Database not initialized. Call createDatabaseConnection() first.');
  return db;
}

export async function closeDatabaseConnection(): Promise<void> {
  if (pool) await pool.end();
}

export type Database = typeof db;
