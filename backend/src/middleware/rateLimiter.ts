const store = new Map<string, { count: number; resetAt: number }>();

export function createRateLimiter(opts: { windowMs: number; max: number }) {
  return (req: any, res: any, next: any) => {
    const vendorId = req.vendorId || req.ip || "anonymous";
    const now = Date.now();
    const entry = store.get(vendorId);

    if (!entry || now > entry.resetAt) {
      store.set(vendorId, { count: 1, resetAt: now + opts.windowMs });
      return next();
    }

    if (entry.count >= opts.max) {
      return res.status(429).json({
        error: { code: "RATE_LIMITED", message: "Too many requests. Please slow down." },
      });
    }

    entry.count++;
    next();
  };
}
