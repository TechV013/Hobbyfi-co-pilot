const memoryStore = new Map<string, { data: string; expiresAt: number }>();

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
  if (!instance) {
    instance = new MemoryRedis();
  }
  return instance;
}

export { getRedis };
export type { MemoryRedis };
