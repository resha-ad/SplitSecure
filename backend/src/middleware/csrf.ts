import { NextFunction, Request, Response } from "express";
import crypto from "crypto";
import { env } from "../config/env";
import { hmacHex, timingSafeEqual } from "../utils/crypto";
import { AppError } from "./errorHandler";

/**
 * CSRF defence: signed double-submit cookie.
 *
 * Because auth uses httpOnly cookies (the refresh token) rather than a
 * bearer token the frontend attaches manually, the browser will silently
 * attach that cookie to a cross-site request forged by an attacker's page -
 * SameSite=Lax/Strict on the cookie helps, but we don't rely on that alone
 * since not every browser/proxy combination can be trusted to honour it.
 *
 * On login/session start we issue a *non-httpOnly* csrf cookie containing
 * `token.signature` (signature = HMAC-SHA256(token, CSRF_SECRET)). The SPA
 * reads that cookie (it can, because it's not httpOnly) and echoes the raw
 * token back in an `X-CSRF-Token` header on every state-changing request.
 * A cross-site attacker can trigger the cookie to be sent automatically,
 * but cannot read its value (browser same-origin policy blocks that), so
 * they cannot produce a matching header value.
 */

const CSRF_COOKIE = "ssc_csrf";

export function issueCsrfCookie(res: Response): void {
  const token = crypto.randomBytes(32).toString("hex");
  const signature = hmacHex(token, env.csrfSecret);
  res.cookie(CSRF_COOKIE, `${token}.${signature}`, {
    httpOnly: false,
    secure: env.nodeEnv === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 1000 * 60 * 60 * 24, // 24h, independent of session length
  });
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function verifyCsrf(req: Request, _res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method)) return next();

  const cookieValue = req.cookies?.[CSRF_COOKIE];
  const headerToken = req.header("x-csrf-token");

  if (!cookieValue || !headerToken) {
    throw new AppError(403, "csrf_token_missing");
  }

  const [cookieToken, cookieSignature] = String(cookieValue).split(".");
  if (!cookieToken || !cookieSignature) {
    throw new AppError(403, "csrf_token_malformed");
  }

  const expectedSignature = hmacHex(cookieToken, env.csrfSecret);
  const signatureValid = timingSafeEqual(cookieSignature, expectedSignature);
  const tokenMatchesHeader = timingSafeEqual(cookieToken, headerToken);

  if (!signatureValid || !tokenMatchesHeader) {
    throw new AppError(403, "csrf_token_invalid");
  }

  next();
}
