const MAX_BUCKETS = 10_000;

export function createRequestRateLimit({ windowMs, max }) {
  const buckets = new Map();
  let requestsSinceCleanup = 0;

  return function requestRateLimit(req, res, next) {
    if (process.env.NODE_ENV === "test") return next();

    const now = Date.now();
    if (++requestsSinceCleanup >= 256 || buckets.size >= MAX_BUCKETS) {
      requestsSinceCleanup = 0;
      for (const [key, bucket] of buckets) {
        if (bucket.resetAt <= now) buckets.delete(key);
      }
    }

    const key = `${req.ip || req.socket.remoteAddress}:${req.baseUrl}${req.path}`;
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      if (!bucket && buckets.size >= MAX_BUCKETS) {
        return res.status(429).json({ message: "Too many requests. Try again later." });
      }
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;
    if (bucket.count > max) {
      res.set("Retry-After", String(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))));
      return res.status(429).json({ message: "Too many requests. Try again later." });
    }
    return next();
  };
}

export const authRequestLimit = createRequestRateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
});

export const invitationRequestLimit = createRequestRateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
});
