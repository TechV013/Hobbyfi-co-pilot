import { Router, Response, NextFunction } from "express";
import { AuthRequest } from "./auth";
import { processMessage } from "../orchestration";
import { ValidationError } from "../lib/errors";

export const chatRouter = Router();

chatRouter.post("/", async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const vendorId = req.vendorId!;
    const { message, conversationId } = req.body;

    if (!message || typeof message !== "string" || message.length > 2000) {
      return next(new ValidationError("message must be a string with max 2000 characters"));
    }

    if (!conversationId || typeof conversationId !== "string" || conversationId.length > 128) {
      return next(new ValidationError("conversationId is required (max 128 chars)"));
    }

    const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Request timed out")), 15_000));

    const result = await Promise.race([processMessage(vendorId, conversationId, message), timeout]);

    return res.json(result);
  } catch (err) {
    return next(err);
  }
});
