import jwt from "jsonwebtoken";
import { AuthError } from "../lib/errors";
import { logger } from "../lib/logger";

export interface AuthPayload {
  vendorId: string;
  vendorName?: string;
}

export function verifyAuth(authHeader: string | null): AuthPayload {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    logger.error("JWT_SECRET is not configured");
    throw new AuthError("Server configuration error");
  }

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new AuthError("Missing or invalid Authorization header");
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, secret, { issuer: "hobbyfi" }) as AuthPayload;
    return decoded;
  } catch (err) {
    const message =
      err instanceof jwt.TokenExpiredError
        ? "Token has expired"
        : err instanceof jwt.JsonWebTokenError
          ? "Invalid token"
          : "Authentication failed";

    logger.warn("Auth failure", { message });
    throw new AuthError(message);
  }
}
