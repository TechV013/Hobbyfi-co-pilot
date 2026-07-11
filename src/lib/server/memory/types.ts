export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export interface SessionData {
  conversationHistory: ConversationTurn[];
  lastIntent?: string;
  lastToolResult?: Record<string, unknown>;
  turns: number;
}

export interface VendorPreferences {
  favoriteReports: string[];
  defaultSportFilter?: string;
  frequentlyUsedFilters: Record<string, unknown>;
  preferredLanguage: string;
  timezone: string;
}

export interface KnowledgeEntry {
  id: string;
  category: string;
  title: string;
  content: string;
  tags: string[];
}

export interface ISessionMemory {
  get(vendorId: string, conversationId: string): Promise<SessionData>;
  set(vendorId: string, conversationId: string, data: SessionData): Promise<void>;
  appendTurn(vendorId: string, conversationId: string, turn: ConversationTurn): Promise<void>;
}

export interface IVendorMemory {
  getPreferences(vendorId: string): Promise<VendorPreferences>;
  updatePreferences(vendorId: string, prefs: Partial<VendorPreferences>): Promise<void>;
}

export interface IKnowledgeMemory {
  search(query: string, limit?: number): Promise<KnowledgeEntry[]>;
  getByCategory(category: KnowledgeEntry["category"]): Promise<KnowledgeEntry[]>;
  getAll(): Promise<KnowledgeEntry[]>;
}

export interface MemoryContext {
  session: SessionData;
  preferences: VendorPreferences;
  knowledge: KnowledgeEntry[];
}

export const SESSION_TTL = 30 * 60;
export const MAX_HISTORY_TURNS = 20;
