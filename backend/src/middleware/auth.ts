import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { AuthError } from "../lib/errors";
import { logger } from "../lib/logger";

export interface AuthRequest extends Request {
  vendorId?: string;
  vendorName?: string;
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    logger.error("JWT_SECRET is not configured");
    return res.status(500).json({ error: { code: "CONFIG_ERROR", message: "Server configuration error" } });
  }

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return next(new AuthError("Missing or invalid Authorization header"));
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, secret, { issuer: "hobbyfi" }) as {
      vendorId: string;
      vendorName?: string;
    };
    req.vendorId = decoded.vendorId;
    req.vendorName = decoded.vendorName;
    next();
  } catch (err) {
    const message =
      err instanceof jwt.TokenExpiredError
        ? "Token has expired"
        : err instanceof jwt.JsonWebTokenError
          ? "Invalid token"
          : "Authentication failed";

    logger.warn("Auth failure", { message, requestId: (req as any).requestId });
    return next(new AuthError(message));
  }
}
