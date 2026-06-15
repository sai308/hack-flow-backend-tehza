/**
 * One-shot script: adds 'organizer' enum value and created_by column.
 * Run with: npx tsx src/drizzle/apply-organizer-schema.ts
 */
import 'dotenv/config';
import { Pool } from 'pg';
import { env } from '../config/env';

async function main() {
  const pool = new Pool({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
  });

  // ── Step 1: Add 'organizer' to enum (MUST be outside a transaction) ──────
  // Get a raw client so we can run outside transaction
  const client = await pool.connect();
  try {
    // Make sure we are NOT in a transaction block
    await client.query('COMMIT'); // no-op if no active txn

    const { rows: enumRows } = await client.query(`
      SELECT 1 FROM pg_enum
      JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
      WHERE pg_type.typname = 'role_name'
        AND pg_enum.enumlabel = 'organizer'
    `);

    if (enumRows.length === 0) {
      await client.query(`ALTER TYPE role_name ADD VALUE 'organizer'`);
      console.log('✅ Added organizer to role_name enum');
    } else {
      console.log('ℹ️  organizer already in role_name enum — skipping');
    }
  } finally {
    client.release();
  }

  // ── Step 2: Add created_by column (can be in a transaction) ──────────────
  const client2 = await pool.connect();
  try {
    await client2.query('BEGIN');

    const { rows: colRows } = await client2.query(`
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'hackathons' AND column_name = 'created_by'
    `);

    if (colRows.length === 0) {
      await client2.query(`
        ALTER TABLE hackathons
        ADD COLUMN created_by UUID REFERENCES users(id) ON DELETE SET NULL
      `);
      console.log('✅ Added created_by column to hackathons');
    } else {
      console.log('ℹ️  created_by column already exists — skipping');
    }

    await client2.query('COMMIT');
  } catch (err) {
    await client2.query('ROLLBACK');
    throw err;
  } finally {
    client2.release();
  }

  // ── Step 3: Insert 'organizer' into roles table ──────────────────────────
  const client3 = await pool.connect();
  try {
    const { rows: orgRole } = await client3.query(`SELECT id FROM roles WHERE name = 'organizer'`);
    if (orgRole.length === 0) {
      await client3.query(`INSERT INTO roles (name) VALUES ('organizer')`);
      console.log('✅ Inserted organizer into roles table');
    } else {
      console.log('ℹ️  organizer already in roles table — skipping');
    }
  } finally {
    client3.release();
  }

  await pool.end();
  console.log('✅ Schema fix complete');
}

main().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
