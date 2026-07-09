import { Request, Response, NextFunction } from "express";
import crypto from "crypto";

export function requestIdMiddleware(req: Request, _res: Response, next: NextFunction) {
  (req as any).requestId = crypto.randomUUID();
  next();
}
