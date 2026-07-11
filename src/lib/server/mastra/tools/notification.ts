import { createTool } from "@mastra/core/tools";
import { PrismaClient } from "@prisma/client";
import { UserRepository } from "../../repositories/user.repository";
import { prisma } from "../../db";
import { NotificationSendInput } from "../../tools/definitions";
import { notificationSendTool } from "../../tools/notification.send";

const userRepo = new UserRepository(prisma);

export const notificationMastraTool = createTool({
  id: "notification.send",
  description: `PROPOSES sending notifications to members, which requires approval.
Use when the user wants to notify, send a message, alert, or remind members.
Arguments: userIds (array of 1-10 member IDs — obtain via user.search first),
type ('payment_reminder' | 'membership_expiry' | 'custom'),
message (string, max 500 chars — the notification content).
THIS IS A WRITE OPERATION — it creates a pending approval.
Examples: "Send payment reminder to all trial members", "Notify Ananya about her membership expiry"`,
  inputSchema: NotificationSendInput,
  execute: async (inputData, { requestContext }) => {
    const vendorId = requestContext?.get("vendorId") as string;
    const conversationId = requestContext?.get("conversationId") as string;
    return notificationSendTool(vendorId, conversationId, inputData, userRepo, prisma as PrismaClient);
  },
});
