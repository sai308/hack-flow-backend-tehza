#!/usr/bin/env node
// migrate-stages-projects.cjs
const { Client } = require('pg');
require('dotenv').config();

const client = new Client({ connectionString: process.env.DATABASE_URL });

async function migrate() {
  await client.connect();
  console.log('🔌 Connected');
  try {
    await client.query('BEGIN');

    await client.query(`
      ALTER TABLE stages
        ADD COLUMN IF NOT EXISTS description TEXT;
    `);
    console.log('✅ stages.description added');

    await client.query(`
      ALTER TABLE projects
        ADD COLUMN IF NOT EXISTS submitted_late_by_minutes INTEGER;
    `);
    console.log('✅ projects.submitted_late_by_minutes added');

    await client.query('COMMIT');
    console.log('🎉 Done');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Failed:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

migrate();
