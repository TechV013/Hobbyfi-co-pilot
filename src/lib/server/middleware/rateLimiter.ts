const store = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(vendorId: string, opts: { windowMs: number; max: number }): boolean {
  const now = Date.now();
  const entry = store.get(vendorId);

  if (!entry || now > entry.resetAt) {
    store.set(vendorId, { count: 1, resetAt: now + opts.windowMs });
    return true;
  }

  if (entry.count >= opts.max) {
    return false;
  }

  entry.count++;
  return true;
}
