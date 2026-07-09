import { PrismaClient } from "@prisma/client";
import { ConflictError, NotFoundError, ExpiredError } from "../lib/errors";
import { logger } from "../lib/logger";
import { NotificationService } from "../notification/notification.service";

const REDACTED_FIELDS = ["phone", "email"];

function redactPII(obj: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...obj };
  for (const field of REDACTED_FIELDS) {
    if (copy[field]) {
      copy[field] = "[REDACTED]";
    }
  }
  return copy;
}

export class ApprovalEngine {
  constructor(
    private prisma: PrismaClient,
    private notificationService?: NotificationService,
  ) {}

  async commit(vendorId: string, previewId: string): Promise<{ status: string; message: string }> {
    return this.prisma.$transaction(async (tx) => {
      const pendingApproval = await tx.pendingApproval.findFirst({
        where: { id: previewId, vendorId },
      });

      if (!pendingApproval) {
        throw new NotFoundError("Approval request not found or unauthorized.");
      }

      if (pendingApproval.status === "committed") {
        throw new ConflictError("This approval has already been committed.");
      }

      if (pendingApproval.status === "rejected") {
        throw new ConflictError("This approval has already been rejected.");
      }

      if (pendingApproval.status === "expired") {
        throw new ExpiredError("This approval has already expired.");
      }

      // Atomic expiry check: lock the row with WHERE clause
      const updated = await tx.pendingApproval.updateMany({
        where: {
          id: previewId,
          vendorId,
          status: "pending",
          expiresAt: { gt: new Date() },
        },
        data: { status: "committed", resolvedAt: new Date() },
      });

      if (updated.count === 0) {
        const current = await tx.pendingApproval.findFirst({ where: { id: previewId } });
        if (!current) throw new NotFoundError("Approval request not found");
        if (current.vendorId !== vendorId) throw new NotFoundError("Approval request not found or unauthorized.");

        if (current.status !== "pending") {
          throw new ConflictError(`This approval has already been ${current.status}.`);
        }

        // Status is still pending but expiresAt passed — mark expired
        await tx.pendingApproval.update({
          where: { id: previewId },
          data: { status: "expired", resolvedAt: new Date() },
        });

        await tx.auditLog.create({
          data: {
            vendorId,
            operation: pendingApproval.toolName,
            targetTable: pendingApproval.targetTable,
            targetId: pendingApproval.targetId,
            previousValue: pendingApproval.previousValue,
            newValue: pendingApproval.proposedValue,
            approvalStatus: "auto_denied",
          },
        });

        throw new ExpiredError("Approval request has expired.");
      }

      // Apply the actual mutation
      if (pendingApproval.toolName === "membership.update") {
        let proposed: Record<string, unknown> = {};
        try {
          proposed = JSON.parse(pendingApproval.proposedValue || "{}");
        } catch {
          throw new Error("Invalid stored proposed value");
        }

        const user = await tx.user.findFirst({
          where: { id: pendingApproval.targetId, vendorId },
        });
        if (!user) {
          throw new NotFoundError("Target user does not exist or does not belong to this vendor.");
        }

        await tx.user.update({
          where: { id: pendingApproval.targetId },
          data: {
            membershipEnd: proposed.membershipEnd ? new Date(proposed.membershipEnd as string) : undefined,
            membershipType: (proposed.membershipType as string) || undefined,
            trialStatus: proposed.trialStatus !== undefined ? (proposed.trialStatus as boolean) : undefined,
          },
        });
      }

      if (pendingApproval.toolName === "notification.send" && this.notificationService) {
        let proposed: Record<string, unknown> = {};
        try {
          proposed = JSON.parse(pendingApproval.proposedValue || "{}");
        } catch {
          throw new Error("Invalid stored proposed value");
        }

        await this.notificationService.send({
          vendorId,
          userIds: proposed.notifiedUserIds as string[],
          type: proposed.type as string,
          message: (proposed.messagePreview as string) || "",
        });
      }

      // Write audit log with PII redacted
      let prevParsed: Record<string, unknown> = {};
      let newParsed: Record<string, unknown> = {};
      try {
        prevParsed = JSON.parse(pendingApproval.previousValue || "{}");
        newParsed = JSON.parse(pendingApproval.proposedValue || "{}");
      } catch {
        /* best effort */
      }

      await tx.auditLog.create({
        data: {
          vendorId,
          operation: pendingApproval.toolName,
          targetTable: pendingApproval.targetTable,
          targetId: pendingApproval.targetId,
          previousValue: JSON.stringify(redactPII(prevParsed)),
          newValue: JSON.stringify(redactPII(newParsed)),
          approvalStatus: "approved",
        },
      });

      logger.info("Approval committed", {
        vendorId,
        previewId,
        toolName: pendingApproval.toolName,
        targetId: pendingApproval.targetId,
      });

      return { status: "committed", message: "Action successfully applied and audited." };
    });
  }

  async reject(vendorId: string, previewId: string): Promise<{ status: string }> {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.pendingApproval.updateMany({
        where: {
          id: previewId,
          vendorId,
          status: "pending",
        },
        data: { status: "rejected", resolvedAt: new Date() },
      });

      if (updated.count === 0) {
        const current = await tx.pendingApproval.findFirst({ where: { id: previewId } });
        if (!current) throw new NotFoundError("Approval request not found");
        if (current.vendorId !== vendorId) throw new NotFoundError("Approval request not found or unauthorized.");
        if (current.status === "committed") throw new ConflictError("This approval has already been committed.");
        if (current.status === "rejected") throw new ConflictError("This approval has already been rejected.");
        if (current.status === "expired") throw new ExpiredError("This approval has already expired.");
        throw new ConflictError(`This approval has already been ${current.status}.`);
      }

      const pending = await tx.pendingApproval.findFirst({ where: { id: previewId } })!;

      let prevParsed: Record<string, unknown> = {};
      let newParsed: Record<string, unknown> = {};
      try {
        prevParsed = JSON.parse((pending as any).previousValue || "{}");
        newParsed = JSON.parse((pending as any).proposedValue || "{}");
      } catch {
        /* best effort */
      }

      await tx.auditLog.create({
        data: {
          vendorId,
          operation: (pending as any).toolName,
          targetTable: (pending as any).targetTable,
          targetId: (pending as any).targetId,
          previousValue: JSON.stringify(redactPII(prevParsed)),
          newValue: JSON.stringify(redactPII(newParsed)),
          approvalStatus: "rejected",
        },
      });

      logger.info("Approval rejected", { vendorId, previewId });
      return { status: "rejected" };
    });
  }
}
