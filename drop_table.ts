import 'dotenv/config';
import { Pool } from 'pg';
import { env } from './src/config/env';

const pool = new Pool({
  host: env.DB_HOST,
  port: env.DB_PORT,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
});

async function run() {
  try {
    await pool.query('DROP SCHEMA public CASCADE;');
    await pool.query('CREATE SCHEMA public;');
    await pool.query('GRANT ALL ON SCHEMA public TO public;');
    console.log('Dropped and recreated public schema successfully.');
  } catch (e) {
    console.error(e);
  } finally {
    await pool.end();
  }
}

run();
