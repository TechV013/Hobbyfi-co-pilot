import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { processMessage } from "@/lib/server/orchestration";
import { logger } from "@/lib/server/lib/logger";

export const maxDuration = 30;

const rateLimitStore = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW = 60_000;
const RATE_LIMIT_MAX = 30;

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
    const { message, conversationId } = body;

    if (!message || typeof message !== "string" || message.length > 2000) {
      return NextResponse.json(
        {
          error: { code: "VALIDATION_ERROR", message: "message must be a string with max 2000 characters" },
        },
        { status: 400 },
      );
    }

    if (
      /^data:image\//i.test(message) ||
      /^(https?:\/\/.*)?\.(png|jpg|jpeg|gif|webp|bmp|svg|ico|tiff?|heic|heif|avif)$/i.test(message.trim()) ||
      /(?:image|img|file)\.(png|jpg|jpeg|gif|webp|bmp|svg|ico|tiff?|heic|heif|avif)\b/i.test(message) ||
      /^https?:\/\/.*\.(png|jpg|jpeg|gif|webp|bmp|svg)(\?.*)?$/i.test(message.trim())
    ) {
      return NextResponse.json(
        { error: { code: "UNSUPPORTED_MEDIA", message: "Image and file inputs are not supported. Please send text only." } },
        { status: 415 },
      );
    }

    if (!conversationId || typeof conversationId !== "string" || conversationId.length > 128) {
      return NextResponse.json(
        {
          error: { code: "VALIDATION_ERROR", message: "conversationId is required (max 128 chars)" },
        },
        { status: 400 },
      );
    }

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Request timed out")), 15_000),
    );

    const result = await Promise.race([processMessage(vendorId, conversationId, message), timeout]);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    if (/cannot read.*\.(png|jpg|jpeg|gif|webp|svg)/i.test(message)) {
      logger.warn("Image content blocked", { error: message });
      return NextResponse.json({ reply: "I can only process text messages. Images and files are not supported." });
    }
    logger.error("Chat error", { error: message });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message } },
      { status: 500 },
    );
  }
}
