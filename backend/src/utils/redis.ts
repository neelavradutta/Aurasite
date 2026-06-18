import Redis from 'ioredis';
import { env } from '../config/env';
import { logger } from './logger';

interface MemoryEntry {
  value: string;
  expiresAt: number;
}

const memoryStore = new Map<string, MemoryEntry>();
let redis: Redis | null = null;
let useMemory = env.nodeEnv === 'development';

export function getRedis(): Redis {
  if (useMemory) {
    throw new Error('In-memory cache mode active');
  }
  if (!redis) {
    redis = new Redis(env.redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      retryStrategy: () => null,
      lazyConnect: true,
    });
    redis.on('error', (err) => {
      logger.warn('Redis unavailable, using in-memory cache', { err: err.message });
      useMemory = true;
    });
    redis.on('connect', () => logger.info('Redis connected'));
  }
  return redis;
}

export async function initRedis(): Promise<void> {
  if (useMemory) return;
  try {
    const client = getRedis();
    await client.connect();
    await client.ping();
    logger.info('Redis ready');
  } catch {
    useMemory = true;
    logger.warn('Redis not available — using in-memory cache (dev mode)');
  }
}

export async function cacheGet(key: string): Promise<string | null> {
  if (useMemory) {
    const entry = memoryStore.get(key);
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) {
      memoryStore.delete(key);
      return null;
    }
    return entry.value;
  }
  return getRedis().get(key);
}

export async function cacheSet(key: string, value: string, ttlSeconds = 300): Promise<void> {
  if (useMemory) {
    memoryStore.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
    return;
  }
  await getRedis().set(key, value, 'EX', ttlSeconds);
}

export async function cacheDel(key: string): Promise<void> {
  if (useMemory) {
    memoryStore.delete(key);
    return;
  }
  await getRedis().del(key);
}

export function isMemoryCache(): boolean {
  return useMemory;
}
