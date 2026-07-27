import { NextFunction, Request, Response } from "express";
import { redis } from "../config/redis";
import { env } from "../config/env";
import { AppError } from "./errorHandler";
import { recordAudit } from "../utils/audit";

/**
 * IP-based blocking and allow-listing, on top of (not instead of) the
 * per-account rate limiting/lockout already in place.
 *
 * - Static blocklist/allowlist come from env (comma-separated exact IPs -
 *   deliberately not CIDR-range matching, which is a real gap for a
 *   production deployment; documented here rather than half-implemented,
 *   since a naive CIDR parser is worse than an honest exact-match scope).
 * - Dynamic auto-blocking is the more interesting control: per-account
 *   lockout (see auth.service.ts) doesn't catch credential stuffing, where
 *   an attacker tries many different accounts from one IP, each individual
 *   account only seeing a handful of failed attempts. This tracks failed
 *   auth attempts *per IP* independent of which account was targeted, and
 *   temporarily blocks the IP outright once it crosses a higher threshold.
 */

const STATIC_BLOCKLIST = new Set(env.ipBlocklist);
const STATIC_ALLOWLIST = new Set(env.ipAllowlist);

function failedAttemptsKey(ip: string) {
  return `ip:failed:${ip}`;
}
function dynamicBlockKey(ip: string) {
  return `ip:blocked:${ip}`;
}

export function isAllowlisted(ip: string): boolean {
  return STATIC_ALLOWLIST.has(ip);
}

// Called from the auth layer on every failed login/registration attempt -
// independent of whether the targeted account itself gets locked.
export async function recordFailedAuthAttempt(ip: string | undefined): Promise<void> {
  if (!ip || isAllowlisted(ip)) return;

  const key = failedAttemptsKey(ip);
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, env.ipAutoBlockWindowSeconds);
  }

  if (count >= env.ipAutoBlockThreshold) {
    await redis.set(dynamicBlockKey(ip), "1", "EX", env.ipAutoBlockDurationSeconds);
    await recordAudit({ action: "security.ip_auto_blocked", targetType: "IP", targetId: ip, ip });
  }
}

export async function ipAccessControl(req: Request, _res: Response, next: NextFunction) {
  const ip = req.ip;
  if (!ip || isAllowlisted(ip)) return next();

  if (STATIC_BLOCKLIST.has(ip)) {
    throw new AppError(403, "ip_blocked");
  }

  const dynamicallyBlocked = await redis.get(dynamicBlockKey(ip));
  if (dynamicallyBlocked) {
    throw new AppError(403, "ip_temporarily_blocked");
  }

  next();
}

// Exposed for tests and for an eventual admin endpoint - not wired to any
// route yet (out of scope for this pass), documented as a known follow-up
// rather than left silently absent.
export async function isIpBlocked(ip: string): Promise<boolean> {
  if (isAllowlisted(ip)) return false;
  if (STATIC_BLOCKLIST.has(ip)) return true;
  return Boolean(await redis.get(dynamicBlockKey(ip)));
}
