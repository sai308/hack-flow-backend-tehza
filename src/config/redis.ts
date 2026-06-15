import Redis from 'ioredis';
import { env } from './env';

let redisClient: Redis;

export function createRedisClient(): Redis {
  redisClient = new Redis({
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD || undefined,
    db: env.REDIS_DB,
    lazyConnect: true,
    retryStrategy: (times) => {
      if (times > 5) return null; // stop retrying
      return Math.min(times * 200, 2000);
    },
  });

  redisClient.on('connect', () => {
    console.warn('[Redis] Connected');
  });

  redisClient.on('error', (err: Error) => {
    console.error('[Redis] Error:', err.message);
  });

  return redisClient;
}

export function getRedisClient(): Redis {
  if (!redisClient) throw new Error('Redis not initialized. Call createRedisClient() first.');
  return redisClient;
}

export async function closeRedisClient(): Promise<void> {
  if (redisClient) await redisClient.quit();
}
