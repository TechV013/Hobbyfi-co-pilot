import type { CoreMessage } from "@mastra/core/llm";
import { RedisSessionMemory } from "./session-memory";
import type {
  ISessionMemory,
  MemoryContext,
  ConversationTurn,
} from "./types";

export class MemoryManager {
  private session: ISessionMemory;

  constructor(session?: ISessionMemory) {
    this.session = session ?? new RedisSessionMemory();
  }

  async loadContext(vendorId: string, conversationId: string, _message: string): Promise<{
    memoryContext: MemoryContext;
    contextMessages: CoreMessage[];
  }> {
    const sessionData = await this.session.get(vendorId, conversationId);

    const memoryContext: MemoryContext = {
      session: sessionData,
    };

    const contextMessages = this.buildContextMessages(memoryContext);

    return { memoryContext, contextMessages };
  }

  async saveTurn(
    vendorId: string,
    conversationId: string,
    userMessage: string,
    assistantReply: string,
    intent?: string,
    toolResult?: Record<string, unknown>,
  ): Promise<void> {
    const turns: ConversationTurn[] = [
      { role: "user", content: userMessage, timestamp: Date.now() },
      { role: "assistant", content: assistantReply, timestamp: Date.now() },
    ];

    const data = await this.session.get(vendorId, conversationId);
    data.lastIntent = intent;
    if (toolResult) data.lastToolResult = toolResult;

    for (const turn of turns) {
      data.conversationHistory.push(turn);
    }

    const { MAX_HISTORY_TURNS } = await import("./types");
    if (data.conversationHistory.length > MAX_HISTORY_TURNS) {
      data.conversationHistory = data.conversationHistory.slice(-MAX_HISTORY_TURNS);
    }

    await this.session.set(vendorId, conversationId, data);
  }

  private buildContextMessages(context: MemoryContext): CoreMessage[] {
    const parts: string[] = [];

    if (context.session.conversationHistory.length > 0) {
      parts.push("## Recent Conversation History");
      const recent = context.session.conversationHistory.slice(-6);
      for (const turn of recent) {
        const prefix = turn.role === "user" ? "Vendor" : "Assistant";
        parts.push(`${prefix}: ${turn.content}`);
      }
    }

    if (parts.length === 0) return [];

    return [
      {
        role: "system" as const,
        content: parts.join("\n"),
      },
    ];
  }

  async getSessionHistory(vendorId: string, conversationId: string): Promise<ConversationTurn[]> {
    const data = await this.session.get(vendorId, conversationId);
    return data.conversationHistory;
  }
}
