import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { UserRepository } from "../../repositories/user.repository";
import { prisma } from "../../db";
import { userSearchTool } from "../../tools/user.search";

const repo = new UserRepository(prisma);

const sportMap: Record<string, string> = {
  cricket: "Cricket",
  football: "Football",
  badminton: "Badminton",
  swimming: "Swimming",
  yoga: "Yoga",
  gym: "Gym",
};

export const userSearchMastraTool = createTool({
  id: "user.search",
  description: `Search for members registered with this vendor. Call this ANY time the user asks about members, players, students, or any person — listing, finding, counting, searching, filtering. Always use this tool instead of guessing.`,
  inputSchema: z.object({
    q: z.string().describe("Search query describing members. Examples: 'all', 'cricket', 'football', 'trial members', 'expiring soon'"),
  }),
  execute: async ({ q }, { requestContext }) => {
    const vendorId = requestContext?.get("vendorId") as string;
    const query = (q || "").toLowerCase();
    const filters: Record<string, unknown> = {};

    if (query && query !== "all" && query !== "members" && query !== "list members" && query !== "show all" && query !== "everyone") {
      for (const [key, val] of Object.entries(sportMap)) {
        if (query.includes(key)) { filters.sport = val; break; }
      }
      if (query.includes("trial")) filters.trialOnly = true;
      if (query.includes("expir")) filters.expiringWithinDays = 7;
    }

    return userSearchTool(vendorId, filters, repo);
  },
});
