import { RequestContext } from "@mastra/core/request-context";
import { detectPromptInjection } from "./guardrails/preFilter";
import { hobbyfiAgent } from "./mastra";
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

  try {
    const { memoryContext, contextMessages } = await memoryManager.loadContext(
      vendorId,
      conversationId,
      message,
    );

    const enrichedContext = contextMessages;

    const requestCtx = new RequestContext<{ vendorId: string; conversationId: string }>();
    requestCtx.set("vendorId", vendorId);
    requestCtx.set("conversationId", conversationId);

    const fullOutput = await hobbyfiAgent.generate(message, {
      requestContext: requestCtx,
      context: enrichedContext as any,
      maxSteps: 10,
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
    return { reply: `I encountered an issue: ${errorMessage}. Please try again.` };
  }
}
