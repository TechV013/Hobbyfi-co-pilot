import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { UserRepository } from "../repositories/user.repository";
import { NotificationSendInput } from "./definitions";
import { ValidationError } from "../lib/errors";

export async function notificationSendTool(
  vendorId: string,
  conversationId: string,
  input: z.infer<typeof NotificationSendInput>,
  userRepo: UserRepository,
  prisma: PrismaClient,
) {
  const users = await Promise.all(input.userIds.map((uid: string) => userRepo.findById(vendorId, uid)));

  const found = users.filter(Boolean);
  if (found.length !== input.userIds.length) {
    throw new ValidationError("One or more users not found in your organization.");
  }

  const previousValue = { notifiedUserIds: [], type: input.type };
  const proposedValue = {
    notifiedUserIds: input.userIds,
    type: input.type,
    messagePreview: input.message.length > 100 ? input.message.substring(0, 97) + "..." : input.message,
  };

  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + 10);

  const pendingApproval = await prisma.pendingApproval.create({
    data: {
      vendorId,
      conversationId,
      toolName: "notification.send",
      targetTable: "User",
      targetId: input.userIds.join(","),
      previousValue: JSON.stringify(previousValue),
      proposedValue: JSON.stringify(proposedValue),
      expiresAt,
      status: "pending",
    },
  });

  return {
    previewId: pendingApproval.id,
    currentValue: previousValue,
    proposedValue,
    expiresAt: expiresAt.toISOString(),
  };
}
