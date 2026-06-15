import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Run test files sequentially to avoid DB conflicts
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    // Load .env for integration tests
    env: { NODE_ENV: 'test' },
  },
});
