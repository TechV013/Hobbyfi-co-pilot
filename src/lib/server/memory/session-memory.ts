import { getRedis } from "../redis";
import type { ISessionMemory, SessionData, ConversationTurn } from "./types";
import { SESSION_TTL, MAX_HISTORY_TURNS } from "./types";

export class RedisSessionMemory implements ISessionMemory {
  private key(vendorId: string, conversationId: string): string {
    return `session:${vendorId}:${conversationId}`;
  }

  async get(vendorId: string, conversationId: string): Promise<SessionData> {
    const cache = await getRedis();
    const raw = await cache.get(this.key(vendorId, conversationId));
    if (raw) {
      try {
        return JSON.parse(raw) as SessionData;
      } catch {
        /* ignore */
      }
    }
    return { conversationHistory: [], turns: 0 };
  }

  async set(vendorId: string, conversationId: string, data: SessionData): Promise<void> {
    const cache = await getRedis();
    await cache.setex(this.key(vendorId, conversationId), SESSION_TTL, JSON.stringify(data));
  }

  async appendTurn(vendorId: string, conversationId: string, turn: ConversationTurn): Promise<void> {
    const data = await this.get(vendorId, conversationId);
    data.conversationHistory.push(turn);
    if (data.conversationHistory.length > MAX_HISTORY_TURNS) {
      data.conversationHistory = data.conversationHistory.slice(-MAX_HISTORY_TURNS);
    }
    data.turns += 1;
    await this.set(vendorId, conversationId, data);
  }
}
