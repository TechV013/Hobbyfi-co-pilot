import { PrismaClient } from "@prisma/client";
import { UserRepository } from "../repositories/user.repository";
import { MembershipUpdateInput } from "./definitions";
import { ValidationError } from "../lib/errors";

const MAX_EXTEND_DAYS = 365;

export async function membershipUpdateTool(
  vendorId: string,
  conversationId: string,
  input: z.infer<typeof MembershipUpdateInput>,
  userRepo: UserRepository,
  prisma: PrismaClient,
) {
  const user = await userRepo.findById(vendorId, input.userId);
  if (!user) {
    throw new ValidationError("User not found in your organization.");
  }

  const previousValue: Record<string, unknown> = {
    membershipType: user.membershipType,
    membershipEnd: user.membershipEnd.toISOString(),
    trialStatus: user.trialStatus,
  };

  const proposedValue: Record<string, unknown> = { ...previousValue };

  if (input.action === "extend_trial") {
    if (!input.extendByDays) throw new ValidationError("extendByDays is required for extend_trial.");
    if (input.extendByDays > MAX_EXTEND_DAYS) {
      throw new ValidationError(`Cannot extend by more than ${MAX_EXTEND_DAYS} days.`);
    }
    const newEnd = new Date(user.membershipEnd);
    newEnd.setDate(newEnd.getDate() + input.extendByDays);
    proposedValue.membershipEnd = newEnd.toISOString();
    proposedValue.trialStatus = true;
  } else if (input.action === "set_membership_end") {
    if (!input.newMembershipEnd) throw new ValidationError("newMembershipEnd is required.");
    proposedValue.membershipEnd = input.newMembershipEnd;
  } else if (input.action === "upgrade_plan") {
    if (!input.newMembershipType) throw new ValidationError("newMembershipType is required.");
    proposedValue.membershipType = input.newMembershipType;
  }

  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + 10);

  const pendingApproval = await prisma.pendingApproval.create({
    data: {
      vendorId,
      conversationId,
      toolName: "membership.update",
      targetTable: "User",
      targetId: input.userId,
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
