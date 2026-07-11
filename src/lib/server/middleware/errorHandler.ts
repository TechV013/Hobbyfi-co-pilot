import { AppError } from "../lib/errors";
import { logger } from "../lib/logger";

export function handleError(err: Error, requestId = "unknown") {
  if (err instanceof AppError) {
    logger.warn("Application error", {
      requestId,
      code: err.code,
      message: err.message,
      statusCode: err.statusCode,
    });
    return {
      status: err.statusCode,
      body: { error: { code: err.code, message: err.message, details: err.details } },
    };
  }

  logger.error("Unhandled error", {
    requestId,
    message: err.message,
    stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
  });

  return {
    status: 500,
    body: { error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" } },
  };
}
