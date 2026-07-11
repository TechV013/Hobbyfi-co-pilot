import { createTool } from "@mastra/core/tools";
import { PrismaClient } from "@prisma/client";
import { UserRepository } from "../../repositories/user.repository";
import { prisma } from "../../db";
import { MembershipUpdateInput } from "../../tools/definitions";
import { membershipUpdateTool } from "../../tools/membership.update";

const userRepo = new UserRepository(prisma);

export const membershipMastraTool = createTool({
  id: "membership.update",
  description: `PROPOSES a membership or trial change that requires approval.
Use when the user wants to extend, prolong, increase, or upgrade a trial or membership.
REQUIRED: you must first obtain the userId via a user.search call.
Arguments: userId (required), action ('extend_trial' | 'set_membership_end' | 'upgrade_plan'),
extendByDays (number, for extend_trial), newMembershipEnd (ISO string, for set_membership_end),
newMembershipType (string, for upgrade_plan).
THIS IS A WRITE OPERATION — it creates a pending approval for the vendor to review.
Examples: "Extend Rahul's trial by 7 days", "Upgrade Ananya's plan to premium"`,
  inputSchema: MembershipUpdateInput,
  execute: async (inputData, { requestContext }) => {
    const vendorId = requestContext?.get("vendorId") as string;
    const conversationId = requestContext?.get("conversationId") as string;
    return membershipUpdateTool(vendorId, conversationId, inputData, userRepo, prisma as PrismaClient);
  },
});
