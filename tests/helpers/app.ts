/**
 * Shared test app factory.
 * Uses Fastify's inject() — no live HTTP server required.
 */
import 'dotenv/config';
import { buildApp } from '../../src/app';
import { createDatabaseConnection } from '../../src/config/database';
import { createRedisClient } from '../../src/config/redis';
import type { FastifyInstance } from 'fastify';

let _app: FastifyInstance | null = null;

export async function getTestApp(): Promise<FastifyInstance> {
  if (_app) return _app;
  createDatabaseConnection();
  createRedisClient();
  const app = await buildApp();
  await app.ready();
  _app = app;
  return app;
}

export async function closeTestApp(): Promise<void> {
  if (_app) {
    await _app.close();
    _app = null;
  }
}

/** Inject helper that returns parsed JSON body */
export async function inject(
  app: FastifyInstance,
  method: string,
  url: string,
  options: { body?: unknown; token?: string } = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await app.inject({
    method: method as 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    url,
    payload: options.body ?? undefined,
    headers: {
      ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
    },
  });
  const bodyText = res.body;
  return {
    status: res.statusCode,
    body: bodyText ? (res.json() as Record<string, unknown>) : {},
  };
}
