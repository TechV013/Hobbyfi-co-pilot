import { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger";

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  const requestId = (req as any).requestId || "unknown";

  res.on("finish", () => {
    const duration = Date.now() - start;
    logger.info("Request completed", {
      requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs: duration,
      vendorId: (req as any).vendorId,
    });
  });

  next();
}
