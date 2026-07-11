import { logger } from "../lib/logger";

export function logRequest(method: string, path: string, statusCode: number, durationMs: number, vendorId?: string) {
  logger.info("Request completed", {
    method,
    path,
    statusCode,
    durationMs,
    vendorId,
  });
}
