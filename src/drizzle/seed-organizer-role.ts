/**
 * Inserts the 'organizer' row into the `roles` table if it doesn't already exist.
 * Run with: npx tsx src/drizzle/seed-organizer-role.ts
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

  try {
    // Show current roles
    const { rows: existing } = await pool.query('SELECT id, name FROM roles ORDER BY name');
    console.log('Current roles in table:', existing.map((r: any) => r.name).join(', '));

    // Check if organizer already exists
    const { rows: org } = await pool.query(`SELECT id FROM roles WHERE name = 'organizer'`);

    if (org.length > 0) {
      console.log(`ℹ️  organizer role already exists (id: ${org[0].id}) — skipping`);
    } else {
      const { rows: inserted } = await pool.query(
        `INSERT INTO roles (name) VALUES ('organizer') RETURNING id, name`
      );
      console.log('✅ Inserted organizer role:', inserted[0]);
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
