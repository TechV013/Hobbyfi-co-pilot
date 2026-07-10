import crypto from "crypto";

export function createRequestId(): string {
  return crypto.randomUUID();
}
