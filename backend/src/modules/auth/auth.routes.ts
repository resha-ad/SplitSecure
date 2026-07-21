import { Router } from "express";
import { passport } from "../../config/passport";
import { env } from "../../config/env";
import { prisma } from "../../config/db";
import { asyncHandler } from "../../middleware/asyncHandler";
import { requireAuth } from "../../middleware/auth";
import { authRateLimiter, sensitiveActionRateLimiter } from "../../middleware/rateLimiter";
import { verifyCsrf } from "../../middleware/csrf";
import * as controller from "./auth.controller";
import * as authService from "./auth.service";
import { setRefreshCookie, clearRefreshCookie } from "./cookies";
import { issueCsrfCookie } from "../../middleware/csrf";

export const authRouter = Router();

authRouter.post("/register", authRateLimiter, asyncHandler(controller.register));
authRouter.post("/login", authRateLimiter, asyncHandler(controller.login));
authRouter.post("/login/totp", authRateLimiter, asyncHandler(controller.loginTotp));
authRouter.post("/refresh", asyncHandler(controller.refresh));
authRouter.post("/logout", verifyCsrf, asyncHandler(controller.logout));

authRouter.post(
  "/totp/setup",
  requireAuth,
  sensitiveActionRateLimiter,
  verifyCsrf,
  asyncHandler(controller.totpSetup)
);
authRouter.post(
  "/totp/confirm",
  requireAuth,
  sensitiveActionRateLimiter,
  verifyCsrf,
  asyncHandler(controller.totpConfirm)
);

// --- Google OAuth ---------------------------------------------------------
// session: false because we issue our own JWT/refresh-cookie session
// immediately in the callback rather than relying on passport's own
// server-side session store.
authRouter.get(
  "/google",
  passport.authenticate("google", { scope: ["profile", "email"], session: false })
);

authRouter.get(
  "/google/callback",
  passport.authenticate("google", { session: false, failureRedirect: `${env.frontendUrl}/login?error=oauth_failed` }),
  asyncHandler(async (req, res) => {
    // passport attaches the user resolved by findOrCreateGoogleUser to req.user
    const user = req.user as { id: string };
    const session = await authService.issueSession(user.id, req.header("user-agent"));
    setRefreshCookie(res, session.refreshToken);
    issueCsrfCookie(res);
    // No tokens in the URL (avoids leaking them via browser history/referrer
    // headers) - the SPA immediately calls POST /api/auth/refresh with
    // credentials included to exchange the now-set cookie for an access token.
    res.redirect(`${env.frontendUrl}/oauth/callback`);
  })
);

authRouter.get("/logout-all-devices", requireAuth, verifyCsrf, asyncHandler(async (req, res) => {
  // Revokes every refresh token belonging to the user - useful after a
  // suspected compromise, exposed here as a distinct endpoint from the
  // single-session logout above.
  await prisma.refreshToken.updateMany({ where: { userId: req.userId! }, data: { revoked: true } });
  clearRefreshCookie(res);
  res.status(204).send();
}));
