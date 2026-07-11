import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { prisma } from "@/lib/server/db";
import { ApprovalEngine } from "@/lib/server/approval/approval-engine.service";
import { ConsoleNotificationService } from "@/lib/server/notification/notification.service";
import { AppError } from "@/lib/server/lib/errors";
import { logger } from "@/lib/server/lib/logger";

export const maxDuration = 30;

const notificationService = new ConsoleNotificationService();
const approvalEngine = new ApprovalEngine(prisma, notificationService);

const rateLimitStore = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW = 60_000;
const RATE_LIMIT_MAX = 60;

const IDEMPOTENCY_STORE = new Map<string, { status: string }>();

function checkRateLimit(vendorId: string): boolean {
  const now = Date.now();
  const entry = rateLimitStore.get(vendorId);

  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(vendorId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return false;
  }

  entry.count++;
  return true;
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const secret = process.env.JWT_SECRET;

    if (!secret) {
      return NextResponse.json(
        { error: { code: "CONFIG_ERROR", message: "Server configuration error" } },
        { status: 500 },
      );
    }

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Missing or invalid Authorization header" } },
        { status: 401 },
      );
    }

    const token = authHeader.split(" ")[1];
    let decoded: { vendorId: string; vendorName?: string };

    try {
      decoded = jwt.verify(token, secret, { issuer: "hobbyfi" }) as {
        vendorId: string;
        vendorName?: string;
      };
    } catch (err) {
      const message =
        err instanceof jwt.TokenExpiredError ? "Token has expired" : "Invalid token";
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message } },
        { status: 401 },
      );
    }

    const vendorId = decoded.vendorId;

    if (!checkRateLimit(vendorId)) {
      return NextResponse.json(
        { error: { code: "RATE_LIMITED", message: "Too many requests. Please slow down." } },
        { status: 429 },
      );
    }

    const body = await req.json();
    const { previewId, decision } = body;
    const idempotencyKey = req.headers.get("idempotency-key") as string;

    if (!previewId || typeof previewId !== "string") {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "previewId is required" } },
        { status: 400 },
      );
    }

    if (!decision || !["approve", "reject"].includes(decision)) {
      return NextResponse.json(
        {
          error: { code: "VALIDATION_ERROR", message: "decision must be 'approve' or 'reject'" },
        },
        { status: 400 },
      );
    }

    if (idempotencyKey) {
      const existing = IDEMPOTENCY_STORE.get(idempotencyKey);
      if (existing) {
        return NextResponse.json({ reply: "Already processed.", ...existing });
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
    return NextResponse.json({ reply, ...result });
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json(
        { error: { code: err.code, message: err.message, details: err.details } },
        { status: err.statusCode },
      );
    }

    const message = err instanceof Error ? err.message : "Internal error";
    logger.error("Approve error", { error: message });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message } },
      { status: 500 },
    );
  }
}
