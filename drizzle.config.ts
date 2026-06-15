import type { Config } from 'drizzle-kit';
import * as dotenv from 'dotenv';

dotenv.config();

// Inline URL builder so drizzle-kit uses same credentials as the runtime pool
const url =
  process.env.DATABASE_URL ??
  `postgresql://${process.env.DB_USER ?? 'postgres'}:${encodeURIComponent(process.env.DB_PASSWORD ?? 'postgres')}@${process.env.DB_HOST ?? 'localhost'}:${process.env.DB_PORT ?? '5432'}/${process.env.DB_NAME ?? 'hackflow'}`;

export default {
  schema: './src/drizzle/schema.ts',
  out: './drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: { url },
  verbose: true,
  strict: true,
} satisfies Config;
