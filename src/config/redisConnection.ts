import Redis from 'ioredis';

let parent: Redis | null = null;

/**
 * BullMQ requires maxRetriesPerRequest: null on ioredis.
 * Set REDIS_URL or REDIS_HOST / REDIS_PORT. Set DISABLE_EVENT_REMINDERS=true to skip Redis in API-only dev.
 */
export function getRedisConnection(): Redis | null {
  if (process.env.DISABLE_EVENT_REMINDERS === 'true') {
    return null;
  }

  if (!parent) {
    const url = process.env.REDIS_URL;
    if (url) {
      parent = new Redis(url, {
        maxRetriesPerRequest: null,
        enableReadyCheck: true,
      });
    } else {
      parent = new Redis({
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        password: process.env.REDIS_PASSWORD || undefined,
        maxRetriesPerRequest: null,
        enableReadyCheck: true,
      });
    }
  }

  return parent;
}

/** Worker must use a duplicate connection from the same Redis config. */
export function createRedisDuplicateForWorker(): Redis | null {
  const base = getRedisConnection();
  if (!base) return null;
  return base.duplicate({ maxRetriesPerRequest: null });
}

export async function closeRedisConnection(): Promise<void> {
  if (parent) {
    await parent.quit().catch(() => undefined);
    parent = null;
  }
}
