import { Router, Response, NextFunction } from "express";
import { AuthRequest } from "./auth";
import { ApprovalEngine } from "../approval/approval-engine.service";
import { prisma } from "../db";
import { AppError } from "../lib/errors";
import { ConsoleNotificationService } from "../notification/notification.service";

export const approveRouter = Router();
const notificationService = new ConsoleNotificationService();
const approvalEngine = new ApprovalEngine(prisma, notificationService);

const IDEMPOTENCY_STORE = new Map<string, { status: string }>();

approveRouter.post("/", async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const vendorId = req.vendorId!;
    const { previewId, decision } = req.body;
    const idempotencyKey = req.headers["idempotency-key"] as string;

    if (!previewId || typeof previewId !== "string") {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "previewId is required" },
      });
    }
    if (!decision || !["approve", "reject"].includes(decision)) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "decision must be 'approve' or 'reject'" },
      });
    }

    if (idempotencyKey) {
      const existing = IDEMPOTENCY_STORE.get(idempotencyKey);
      if (existing) {
        return res.json({ reply: "Already processed.", ...existing });
      }
    }

    let result: { status: string; message?: string };

    if (decision === "approve") {
      result = await approvalEngine.commit(vendorId, previewId);
    } else {
      result = await approvalEngine.reject(vendorId, previewId);
    }

    if (idempotencyKey) {
      IDEMPOTENCY_STORE.set(idempotencyKey, result);
      setTimeout(() => IDEMPOTENCY_STORE.delete(idempotencyKey), 3_600_000);
    }

    const reply = decision === "approve" ? "Done - changes applied." : "Changes rejected.";
    return res.json({ reply, ...result });
  } catch (err) {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({
        error: { code: err.code, message: err.message },
      });
    }
    return next(err);
  }
});
