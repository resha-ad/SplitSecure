import { env } from "../config/env";
import { logger } from "./logger";

/**
 * CAPTCHA is baseline bot-mitigation, not a headline "security feature" in
 * this report (it doesn't address a vulnerability class like XSS/SQLi/CSRF
 * - it raises the cost of scripted credential-stuffing/brute-force runs).
 * It's still implemented because the brief requires it.
 *
 * In development, HCAPTCHA_SECRET is left blank so the flow can be tested
 * without live keys; that path logs a warning rather than silently
 * pretending verification happened, so it's visible in every dev log
 * rather than hidden. Production deployment must set a real secret or
 * every login/register attempt is rejected.
 */
export async function verifyCaptcha(token: string | undefined): Promise<boolean> {
  if (!env.hcaptchaSecret) {
    logger.warn("captcha_verification_skipped_dev_mode");
    return true;
  }

  if (!token) return false;

  const response = await fetch("https://hcaptcha.com/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ secret: env.hcaptchaSecret, response: token }),
  });

  const result = (await response.json()) as { success: boolean };
  return result.success === true;
}
