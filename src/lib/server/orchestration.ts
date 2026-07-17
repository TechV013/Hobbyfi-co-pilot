import { RequestContext } from "@mastra/core/request-context";
import { detectPromptInjection } from "./guardrails/preFilter";
import { hobbyfiAgent } from "./mastra";
import { routeMessage } from "./router";
import { MemoryManager } from "./memory/memory-manager";
import { logger } from "./lib/logger";

const memoryManager = new MemoryManager();

export interface ChatResponse {
  reply: string;
  pendingApproval?: {
    previewId: string;
    toolName: string;
    diff: { currentValue: Record<string, unknown>; proposedValue: Record<string, unknown> };
    expiresAt: string;
  };
}

export async function processMessage(
  vendorId: string,
  conversationId: string,
  message: string,
): Promise<ChatResponse> {
  if (detectPromptInjection(message)) {
    logger.warn("Prompt injection blocked", { vendorId, conversationId });
    return { reply: "I cannot fulfill this request as it violates security policies." };
  }

  const { intent, reply: routerReply } = await routeMessage(vendorId, message);

  if (routerReply !== null) {
    await memoryManager.saveTurn(vendorId, conversationId, message, routerReply, intent);
    return { reply: routerReply };
  }

  try {
    const { memoryContext, contextMessages } = await memoryManager.loadContext(
      vendorId,
      conversationId,
      message,
    );

    const requestCtx = new RequestContext<{ vendorId: string; conversationId: string }>();
    requestCtx.set("vendorId", vendorId);
    requestCtx.set("conversationId", conversationId);

    const systemCtx = contextMessages.map((m) => String(m.content)).join("\n");

    const fullOutput = await hobbyfiAgent.generate(message, {
      requestContext: requestCtx,
      system: systemCtx || undefined,
      maxSteps: 3,
    });

    const reply = fullOutput.text;
    const toolResults = fullOutput.toolResults || [];

    let pendingApproval: ChatResponse["pendingApproval"] | undefined;

    for (const tr of toolResults) {
      const r = tr.payload?.result;
      if (r && typeof r === "object" && r !== null && "previewId" in (r as Record<string, unknown>)) {
        const approval = r as {
          previewId: string;
          currentValue: Record<string, unknown>;
          proposedValue: Record<string, unknown>;
          expiresAt: string;
        };
        pendingApproval = {
          previewId: approval.previewId,
          toolName: tr.payload?.toolName || "",
          diff: { currentValue: approval.currentValue, proposedValue: approval.proposedValue },
          expiresAt: approval.expiresAt,
        };
      }
    }

    const firstToolResult = toolResults[0]?.payload?.result as Record<string, unknown> | undefined;

    await memoryManager.saveTurn(
      vendorId,
      conversationId,
      message,
      reply,
      pendingApproval ? pendingApproval.toolName : memoryContext.session.lastIntent,
      firstToolResult,
    );

    return {
      reply,
      ...(pendingApproval ? { pendingApproval } : {}),
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "An unexpected error occurred";
    logger.error("Agent execution failed", { vendorId, error: errorMessage });

    if (/does not support (image|file|audio|video)/i.test(errorMessage) || /unsupported.*(image|file|media)/i.test(errorMessage) || /cannot read.*\.(png|jpg|jpeg|gif|webp|svg)/i.test(errorMessage) || /cannot read.*image\.png/i.test(errorMessage)) {
      return { reply: "I can only process text messages. Images and files are not supported." };
    }
    if (/rate.limit|quota|resource.*exhausted|insufficient.*quota/i.test(errorMessage)) {
      return { reply: "I'm temporarily unavailable. Please wait a moment and try again." };
    }
    if (/API_KEY|api.?key|not.*found|not.*valid|unauthorized/i.test(errorMessage)) {
      return { reply: "I'm having trouble connecting to my AI service. Please check the API configuration." };
    }
    if (/database|db|prisma|ECONNREFUSED|getaddrinfo/i.test(errorMessage)) {
      return { reply: "I can answer general questions, but detailed data queries are unavailable right now because the database is not connected." };
    }

    logger.error("Unhandled agent error", { errorMessage, vendorId });
    return { reply: "I encountered an issue. Please try again." };
  }
}
