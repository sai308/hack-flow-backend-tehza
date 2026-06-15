/**
 * Global test setup — runs once before all test files.
 */
import 'dotenv/config';
import { seedRoles } from './helpers/db';

// Seed the roles table so authorize() guards work in tests
beforeAll(async () => {
  await seedRoles();
});
