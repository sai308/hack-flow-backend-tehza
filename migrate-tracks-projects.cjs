#!/usr/bin/env node
// migrate-tracks-projects.cjs
// Adds: tracks.guidelines, tracks.allowed_technologies, tracks.expected_outcome, tracks.external_url
// Adds: projects.title, projects.description

const { Client } = require('pg');
require('dotenv').config();

const client = new Client({ connectionString: process.env.DATABASE_URL });

async function migrate() {
  await client.connect();
  console.log('🔌 Connected to DB');

  try {
    await client.query('BEGIN');

    // ── Tracks: add guideline fields ────────────────────────────────────
    await client.query(`
      ALTER TABLE tracks
        ADD COLUMN IF NOT EXISTS guidelines           TEXT,
        ADD COLUMN IF NOT EXISTS allowed_technologies TEXT,
        ADD COLUMN IF NOT EXISTS expected_outcome     TEXT,
        ADD COLUMN IF NOT EXISTS external_url         VARCHAR(500);
    `);
    console.log('✅ tracks: added guidelines, allowed_technologies, expected_outcome, external_url');

    // ── Projects: add title + description ──────────────────────────────
    await client.query(`
      ALTER TABLE projects
        ADD COLUMN IF NOT EXISTS title       VARCHAR(255),
        ADD COLUMN IF NOT EXISTS description TEXT;
    `);
    console.log('✅ projects: added title, description');

    await client.query('COMMIT');
    console.log('🎉 Migration complete');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed, rolled back:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

migrate();
