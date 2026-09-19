import type { Request, Response, NextFunction } from "express";

type RateLimitRecord = {
  count: number;
  resetTime: number;
};

export function createRateLimiter(options: {
  windowMs: number;
  max: number;
  message?: string;
  keyGenerator?: (req: Request) => string;
}) {
  const store = new Map<string, RateLimitRecord>();
  const { windowMs, max, message = "Too many requests. Please try again later." } = options;

  // Periodic cleanup of expired entries every 5 minutes
  setInterval(() => {
    const now = Date.now();
    for (const [key, record] of store.entries()) {
      if (now > record.resetTime) {
        store.delete(key);
      }
    }
  }, 5 * 60 * 1000).unref();

  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = options.keyGenerator
      ? options.keyGenerator(req)
      : (req.ip || req.socket.remoteAddress ||
         "127.0.0.1");

    // In local development / tests on localhost, bypass strict throttling
    if (process.env.NODE_ENV !== "production" && (ip === "127.0.0.1" || ip === "::1" || ip === "localhost")) {
      next();
      return;
    }

    const now = Date.now();
    let record = store.get(ip);

    if (!record || now > record.resetTime) {
      record = { count: 1, resetTime: now + windowMs };
      store.set(ip, record);
    } else {
      record.count += 1;
    }

    const remaining = Math.max(0, max - record.count);
    const retryAfterSec = Math.ceil((record.resetTime - now) / 1000);

    res.setHeader("X-RateLimit-Limit", max);
    res.setHeader("X-RateLimit-Remaining", remaining);
    res.setHeader("X-RateLimit-Reset", Math.ceil(record.resetTime / 1000));

    if (record.count > max) {
      res.setHeader("Retry-After", retryAfterSec);
      res.status(429).json({
        error: message,
        retryAfter: retryAfterSec,
      });
      return;
    }

    next();
  };
}

/**
 * Strict rate limiter for login & signup endpoints.
 * 10 attempts per 15 minutes per IP address.
 */
export const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "Too many authentication attempts. Please try again in a few minutes.",
});

/**
 * Rate limiter for public tracking and pitch links.
 * 60 requests per minute per IP address.
 */
export const publicRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 60,
  message: "Too many requests to public endpoints. Please slow down.",
});

/**
 * General API rate limiter for regular authenticated endpoints.
 * 300 requests per minute per IP address.
 */
export const apiRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 300,
  message: "API rate limit exceeded. Please slow down.",
});
