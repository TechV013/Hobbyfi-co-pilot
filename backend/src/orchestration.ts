import { getRedis } from "./redis";
import { prisma } from "./db";
import { UserRepository } from "./repositories/user.repository";
import { RevenueRepository } from "./repositories/revenue.repository";
import { detectPromptInjection } from "./guardrails/preFilter";
import { revenueQueryTool } from "./tools/revenue.query";
import { userSearchTool } from "./tools/user.search";
import { membershipUpdateTool } from "./tools/membership.update";
import { notificationSendTool } from "./tools/notification.send";
import { logger } from "./lib/logger";

// ---------------------------------------------------------------------------
// Repository instances
// ---------------------------------------------------------------------------
const userRepo = new UserRepository(prisma);
const revenueRepo = new RevenueRepository(prisma);

// ---------------------------------------------------------------------------
// Tool registry (Open/Closed Principle — add tools here, not in a switch)
// ---------------------------------------------------------------------------
interface ToolHandler {
  name: string;
  description: string;
  execute: (vendorId: string, conversationId: string, args: Record<string, unknown>) => Promise<unknown>;
}

const toolRegistry: Map<string, ToolHandler> = new Map();

function registerTool(handler: ToolHandler) {
  toolRegistry.set(handler.name, handler);
}

registerTool({
  name: "revenue.query",
  description: "Query revenue for a given time range",
  execute: async (vendorId, _convId, args) => {
    const { RevenueQueryInput } = await import("./tools/definitions");
    const parsed = RevenueQueryInput.parse(args);
    return revenueQueryTool(vendorId, parsed, revenueRepo);
  },
});

registerTool({
  name: "user.search",
  description: "Search for members by filters",
  execute: async (vendorId, _convId, args) => {
    const { UserSearchInput } = await import("./tools/definitions");
    const parsed = UserSearchInput.parse(args);
    return userSearchTool(vendorId, parsed, userRepo);
  },
});

registerTool({
  name: "membership.update",
  description: "Propose a membership/trial update",
  execute: async (vendorId, convId, args) => {
    const { MembershipUpdateInput } = await import("./tools/definitions");
    const parsed = MembershipUpdateInput.parse(args);
    return membershipUpdateTool(vendorId, convId, parsed, userRepo, prisma);
  },
});

registerTool({
  name: "notification.send",
  description: "Propose sending a notification to members",
  execute: async (vendorId, convId, args) => {
    const { NotificationSendInput } = await import("./tools/definitions");
    const parsed = NotificationSendInput.parse(args);
    return notificationSendTool(vendorId, convId, parsed, userRepo, prisma);
  },
});

// ---------------------------------------------------------------------------
// Intent classifier — maps natural language to tool invocations
// ---------------------------------------------------------------------------
const INTENT_PATTERNS: Array<{
  pattern: RegExp;
  tool: string;
  extractArgs: (originalMessage: string) => Record<string, unknown>;
}> = [
  {
    pattern: /(?:revenue|earnings?|income|how much|made|collection)/i,
    tool: "revenue.query",
    extractArgs: (msg) => {
      if (/\byesterday\b/i.test(msg)) return { range: "yesterday" };
      if (/\bthis\s+week\b/i.test(msg)) return { range: "this_week" };
      if (/\blast\s+week\b/i.test(msg)) return { range: "this_week" };
      if (/\bthis\s+month\b/i.test(msg)) return { range: "this_month" };
      if (/\blast\s+month\b/i.test(msg)) return { range: "this_month" };
      return { range: "today" };
    },
  },
  {
    pattern: /(?:member|player|student|user|people|person|who|find|search|list|show|trial|expir)/i,
    tool: "user.search",
    extractArgs: (msg) => {
      const args: Record<string, unknown> = {};
      if (/\btrial\b/i.test(msg)) args.trialOnly = true;
      if (/\bexpir(?:ing|ed|es)\b/i.test(msg)) args.expiringWithinDays = 7;
      if (/\bcricket\b/i.test(msg)) args.sport = "cricket";
      if (/\bfootball\b|\bsoccer\b/i.test(msg)) args.sport = "football";
      if (/\bbadminton\b/i.test(msg)) args.sport = "badminton";
      if (/\bswimm(?:ing|er)\b/i.test(msg)) args.sport = "swimming";
      if (/\byoga\b/i.test(msg)) args.sport = "yoga";
      const nameMatch = msg.match(/(?:called|named|for)\s+(\w+(?:\s+\w+)?)\s*$/i);
      if (nameMatch) args.nameOrPhoneQuery = nameMatch[1];
      return args;
    },
  },
  {
    pattern: /(?:extend|prolong|increase|add)\s+.*(?:trial|membership)/i,
    tool: "membership.update",
    extractArgs: () => ({}),
  },
  {
    pattern: /(?:notify|send|message|alert|remind)\s+.*(?:member|user|player|everyone|all)/i,
    tool: "notification.send",
    extractArgs: () => ({}),
  },
];

function classifyIntent(message: string): Array<{ tool: string; args: Record<string, unknown> }> {
  const results: Array<{ tool: string; args: Record<string, unknown> }> = [];

  for (const { pattern, tool, extractArgs } of INTENT_PATTERNS) {
    if (pattern.test(message)) {
      const args = extractArgs(message);
      results.push({ tool, args });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Session memory context
// ---------------------------------------------------------------------------
const SESSION_TTL = 30 * 60;

interface SessionContext {
  turns: number;
  lastToolResults?: Record<string, unknown>;
  lastIntent?: string;
}

async function loadSession(vendorId: string, conversationId: string): Promise<SessionContext> {
  const cache = await getRedis();
  const raw = await cache.get(`session:${vendorId}:${conversationId}`);
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch {
      /* ignore */
    }
  }
  return { turns: 0 };
}

async function saveSession(vendorId: string, conversationId: string, ctx: SessionContext): Promise<void> {
  const cache = await getRedis();
  await cache.setex(`session:${vendorId}:${conversationId}`, SESSION_TTL, JSON.stringify(ctx));
}

// ---------------------------------------------------------------------------
// Reply builder
// ---------------------------------------------------------------------------
function buildReply(toolResults: unknown[], _message: string): string {
  const result = toolResults[0] as Record<string, unknown> | undefined;
  if (!result) {
    return "I can help you check revenue, find members, extend trials, or send notifications. What would you like to do?";
  }

  if (result.totalRevenue !== undefined) {
    const r = result as { totalRevenue: number; onlineRevenue: number; offlineRevenue: number; range: string };
    return `Your ${r.range} revenue: \u20B9${r.totalRevenue.toLocaleString("en-IN")} total (Online: \u20B9${r.onlineRevenue.toLocaleString("en-IN")}, Offline: \u20B9${r.offlineRevenue.toLocaleString("en-IN")}).`;
  }

  if (result.users !== undefined) {
    const r = result as {
      count: number;
      users: Array<{ name: string; sport: string; membershipType: string; id: string }>;
    };
    if (r.count === 0) return "No members found matching your criteria.";
    if (r.count > 1) {
      const names = r.users.map((u) => `${u.name} (${u.sport}, ${u.membershipType})`).join("; ");
      return `Found ${r.count} members: ${names}. Which one would you like to act on?`;
    }
    const u = r.users[0];
    return `Found ${u.name} (${u.sport}, ${u.membershipType}). What would you like to do?`;
  }

  if (result.previewId) {
    return "I've prepared a change for your review. Please check the approval card above and Approve or Reject.";
  }

  if (result.error) {
    return `I encountered an issue: ${result.error}. Please try again or rephrase your request.`;
  }

  return "I've processed your request. Please review the details above.";
}

// ---------------------------------------------------------------------------
// Message processing entry point
// ---------------------------------------------------------------------------
export interface ChatResponse {
  reply: string;
  pendingApproval?: {
    previewId: string;
    toolName: string;
    diff: { currentValue: Record<string, unknown>; proposedValue: Record<string, unknown> };
    expiresAt: string;
  };
}

export async function processMessage(vendorId: string, conversationId: string, message: string): Promise<ChatResponse> {
  // Check injection BEFORE touching session
  if (detectPromptInjection(message)) {
    logger.warn("Prompt injection blocked", { vendorId, conversationId });
    return { reply: "I cannot fulfill this request as it violates security policies." };
  }

  const ctx = await loadSession(vendorId, conversationId);
  ctx.turns += 1;

  const intents = classifyIntent(message);
  if (intents.length === 0) {
    await saveSession(vendorId, conversationId, ctx);
    return {
      reply:
        "I can help you check revenue, find members, extend trials, or send notifications. What would you like to do?",
    };
  }

  ctx.lastIntent = intents[0].tool;

  const results: unknown[] = [];
  let pendingApproval: ChatResponse["pendingApproval"];

  for (const intent of intents) {
    const handler = toolRegistry.get(intent.tool);
    if (!handler) {
      results.push({ error: `Unknown tool: ${intent.tool}` });
      continue;
    }

    try {
      const toolResult = await handler.execute(vendorId, conversationId, intent.args);

      if (
        typeof toolResult === "object" &&
        toolResult !== null &&
        "previewId" in (toolResult as Record<string, unknown>)
      ) {
        const r = toolResult as {
          previewId: string;
          currentValue: Record<string, unknown>;
          proposedValue: Record<string, unknown>;
          expiresAt: string;
        };
        pendingApproval = {
          previewId: r.previewId,
          toolName: intent.tool,
          diff: { currentValue: r.currentValue, proposedValue: r.proposedValue },
          expiresAt: r.expiresAt,
        };
      }

      results.push(toolResult);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "An unexpected error occurred";
      logger.warn("Tool execution failed", {
        vendorId,
        tool: intent.tool,
        error: errorMessage,
      });
      results.push({ error: errorMessage });
    }
  }

  ctx.lastToolResults = (results[0] as Record<string, unknown>) || undefined;
  await saveSession(vendorId, conversationId, ctx);

  const reply = buildReply(results, message);

  return {
    reply,
    ...(pendingApproval ? { pendingApproval } : {}),
  };
}
