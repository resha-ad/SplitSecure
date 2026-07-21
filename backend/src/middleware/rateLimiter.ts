import rateLimit from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { redis } from "../config/redis";

// Baseline abuse-mitigation (not one of the report's headline "Security
// Features" per module guidance - it doesn't stop XSS/SQLi/CSRF, it just
// raises the cost of scripted brute-force/credential-stuffing runs).
// Backed by Redis so limits are shared across horizontally scaled instances
// rather than reset whenever a single process restarts.
function redisStore(prefix: string) {
  return new RedisStore({
    // @ts-expect-error - rate-limit-redis's ioredis typing expects the v4 command signature
    sendCommand: (...args: string[]) => redis.call(...args),
    prefix,
  });
}

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  store: redisStore("rl:auth:"),
  message: { error: "too_many_requests" },
});

export const sensitiveActionRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  store: redisStore("rl:sensitive:"),
  message: { error: "too_many_requests" },
});

export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  store: redisStore("rl:api:"),
  message: { error: "too_many_requests" },
});
