import type { Request, Response, NextFunction } from 'express';

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 40;

type Entry = { count: number; windowStart: number };
const buckets = new Map<string, Entry>();

function prune(): void {
  const now = Date.now();
  for (const [k, v] of buckets) {
    if (now - v.windowStart > WINDOW_MS * 2) buckets.delete(k);
  }
}

/**
 * Per-user sliding window rate limit for /api/voice/* (by JWT userId).
 */
export function voiceRateLimit(req: Request, res: Response, next: NextFunction): void {
  const userId = (req as Request & { userId?: string }).userId || (req as any).userId;
  if (!userId) {
    next();
    return;
  }
  prune();
  const now = Date.now();
  let e = buckets.get(userId);
  if (!e || now - e.windowStart > WINDOW_MS) {
    e = { count: 0, windowStart: now };
    buckets.set(userId, e);
  }
  e.count += 1;
  if (e.count > MAX_REQUESTS) {
    res.status(429).json({ error: 'Too many voice requests. Try again in a minute.' });
    return;
  }
  next();
}
