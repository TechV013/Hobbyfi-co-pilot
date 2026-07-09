import { Request, Response, NextFunction } from "express";
import { AppError } from "../lib/errors";
import { logger } from "../lib/logger";

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction) {
  const requestId = (req as any).requestId || "unknown";

  if (err instanceof AppError) {
    logger.warn("Application error", {
      requestId,
      code: err.code,
      message: err.message,
      statusCode: err.statusCode,
    });
    return res.status(err.statusCode).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
  }

  logger.error("Unhandled error", {
    requestId,
    message: err.message,
    stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
  });

  return res.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" },
  });
}
