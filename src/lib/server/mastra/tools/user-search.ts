import { createTool } from "@mastra/core/tools";
import { UserRepository } from "../../repositories/user.repository";
import { prisma } from "../../db";
import { UserSearchInput } from "../../tools/definitions";
import { userSearchTool } from "../../tools/user.search";

const repo = new UserRepository(prisma);

export const userSearchMastraTool = createTool({
  id: "user.search",
  description: `Search for members (players/students) registered with this vendor.
Use when the user wants to find, list, show, search, or look up members.
All filters are optional — omit them to get a broad list.
Filters: sport (e.g. 'cricket', 'football', 'badminton', 'swimming', 'yoga'),
trialOnly (boolean — only trial members),
expiringWithinDays (number — members whose membership ends within that many days),
nameOrPhoneQuery (string — partial name or phone search).
Examples: "Find trial members", "Show me cricket players", "Search for members with expiring memberships"`,
  inputSchema: UserSearchInput,
  execute: async (inputData, { requestContext }) => {
    const vendorId = requestContext?.get("vendorId") as string;
    return userSearchTool(vendorId, inputData, repo);
  },
});
