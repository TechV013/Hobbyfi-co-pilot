import type { CoreMessage } from "@mastra/core/llm";
import { RedisSessionMemory } from "./session-memory";
import { PostgresVendorMemory } from "./vendor-memory";
import { RAGKnowledgeMemory } from "./rag-knowledge-memory";
import type {
  ISessionMemory,
  IVendorMemory,
  IKnowledgeMemory,
  MemoryContext,
  ConversationTurn,
  KnowledgeEntry,
} from "./types";

export class MemoryManager {
  private session: ISessionMemory;
  private vendor: IVendorMemory;
  private knowledge: IKnowledgeMemory;

  constructor(
    session?: ISessionMemory,
    vendor?: IVendorMemory,
    knowledge?: IKnowledgeMemory,
  ) {
    this.session = session ?? new RedisSessionMemory();
    this.vendor = vendor ?? new PostgresVendorMemory();
    this.knowledge = knowledge ?? new RAGKnowledgeMemory();
  }

  async loadContext(vendorId: string, conversationId: string, message: string): Promise<{
    memoryContext: MemoryContext;
    contextMessages: CoreMessage[];
  }> {
    const [sessionData, preferences, relevantKnowledge] = await Promise.all([
      this.session.get(vendorId, conversationId),
      this.vendor.getPreferences(vendorId),
      this.knowledge.search(message, 3),
    ]);

    const memoryContext: MemoryContext = {
      session: sessionData,
      preferences,
      knowledge: relevantKnowledge,
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

    if (context.preferences) {
      const p = context.preferences;
      parts.push("## Vendor Preferences");
      if (p.defaultSportFilter) parts.push(`- Default sport filter: ${p.defaultSportFilter}`);
      if (p.favoriteReports.length > 0) parts.push(`- Favorite reports: ${p.favoriteReports.join(", ")}`);
      parts.push(`- Language: ${p.preferredLanguage}`);
      parts.push(`- Timezone: ${p.timezone}`);
    }

    if (context.session.conversationHistory.length > 0) {
      parts.push("", "## Recent Conversation History");
      const recent = context.session.conversationHistory.slice(-6);
      for (const turn of recent) {
        const prefix = turn.role === "user" ? "Vendor" : "Assistant";
        parts.push(`${prefix}: ${turn.content}`);
      }
    }

    if (context.knowledge.length > 0) {
      parts.push("", "## Relevant Knowledge");
      for (const entry of context.knowledge) {
        parts.push(`[${entry.category}] ${entry.title}: ${entry.content}`);
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

  async updateVendorPreferences(vendorId: string, updates: Record<string, unknown>): Promise<void> {
    await this.vendor.updatePreferences(vendorId, updates as Parameters<IVendorMemory["updatePreferences"]>[1]);
  }

  async searchKnowledge(query: string, limit?: number): Promise<KnowledgeEntry[]> {
    return this.knowledge.search(query, limit);
  }
}
