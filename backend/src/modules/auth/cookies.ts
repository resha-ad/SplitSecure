import { CookieOptions, Response } from "express";
import { env } from "../../config/env";

export const REFRESH_COOKIE = "ssc_refresh";

const REFRESH_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true, // never readable by JS - the primary XSS-exfiltration mitigation for this token
  secure: env.nodeEnv === "production",
  sameSite: "strict",
  path: "/api/auth",
  maxAge: 30 * 24 * 60 * 60 * 1000,
};

export function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE, token, REFRESH_COOKIE_OPTIONS);
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, { path: "/api/auth" });
}
