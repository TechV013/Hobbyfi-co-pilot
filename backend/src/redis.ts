// In-memory fallback when Redis is not available
const memoryStore = new Map<string, { data: string; expiresAt: number }>();

function getRedisUrl(): string | null {
  try {
    const url = process.env.REDIS_URL;
    if (url && url.length > 0) return url;
  } catch {
    /* ignore */
  }
  return null;
}

const url = getRedisUrl();

class MemoryRedis {
  async get(key: string): Promise<string | null> {
    const entry = memoryStore.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      memoryStore.delete(key);
      return null;
    }
    return entry.data;
  }

  async setex(key: string, seconds: number, value: string): Promise<void> {
    memoryStore.set(key, { data: value, expiresAt: Date.now() + seconds * 1000 });
  }

  async del(key: string): Promise<void> {
    memoryStore.delete(key);
  }
}

let instance: MemoryRedis | null = null;

async function getRedis(): Promise<MemoryRedis> {
  if (instance) return instance;

  if (url) {
    try {
      const Redis = (await import("ioredis")).default;
      const client = new Redis(url);
      // Wrap ioredis to match our interface
      instance = new MemoryRedis(); // fallback for now
      return instance;
    } catch {
      instance = new MemoryRedis();
    }
  } else {
    instance = new MemoryRedis();
  }

  return instance;
}

export { getRedis };
export type { MemoryRedis };
