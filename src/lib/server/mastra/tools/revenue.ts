import { createTool } from "@mastra/core/tools";
import { RevenueRepository } from "../../repositories/revenue.repository";
import { prisma } from "../../db";
import { RevenueQueryInput } from "../../tools/definitions";
import { revenueQueryTool } from "../../tools/revenue.query";

const repo = new RevenueRepository(prisma);

export const revenueTool = createTool({
  id: "revenue.query",
  description: `Query revenue/earnings data for this vendor's sports academy.
Use when the user asks about revenue, earnings, income, collections, or money made.
Range options: 'today', 'yesterday', 'this_week', 'this_month'.
Examples: "What is today's revenue?", "How much did I make yesterday?", "Show me my earnings this month".`,
  inputSchema: RevenueQueryInput,
  execute: async (inputData, { requestContext }) => {
    const vendorId = requestContext?.get("vendorId") as string;
    return revenueQueryTool(vendorId, inputData, repo);
  },
});
