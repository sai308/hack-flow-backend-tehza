import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { env } from '../config/env';
import { getRedisClient } from '../config/redis';

export default fp(async function securityPlugin(app: FastifyInstance): Promise<void> {
  await app.register(helmet, {
    contentSecurityPolicy: env.NODE_ENV === 'production',
  });

  await app.register(cors, {
    origin: env.CORS_ORIGIN,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  if (env.NODE_ENV !== 'test') {
    // Try to use Redis for rate-limiting; fall back to in-memory if Redis is unavailable.
    let redisStore: ReturnType<typeof getRedisClient> | undefined;
    try {
      const client = getRedisClient();
      // Quick ping — if it throws synchronously or the client is already in a bad state,
      // we skip Redis and use the default in-memory store.
      if (client.status === 'ready' || client.status === 'connecting') {
        redisStore = client;
      }
    } catch {
      app.log.warn('[rate-limit] Redis unavailable — using in-memory store');
    }

    await app.register(rateLimit, {
      max: env.RATE_LIMIT_MAX,
      timeWindow: env.RATE_LIMIT_WINDOW_MS,
      ...(redisStore ? { redis: redisStore } : {}),
      keyGenerator: (request) => request.ip,
      errorResponseBuilder: (_request, context) => ({
        statusCode: 429,
        code: 'RATE_LIMIT_EXCEEDED',
        message: `Too many requests — retry after ${String(context.after)}`,
      }),
    });
  }
});
