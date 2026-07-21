import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import { env } from "./config/env";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { passport } from "./config/passport";
import { authRouter } from "./modules/auth/auth.routes";
import { usersRouter } from "./modules/users/users.routes";
import { groupsRouter } from "./modules/groups/groups.routes";
import { expensesRouter } from "./modules/expenses/expenses.routes";
import { settlementsRouter } from "./modules/settlements/settlements.routes";
import { apiRateLimiter } from "./middleware/rateLimiter";

export function createApp() {
  const app = express();

  // Trust the first proxy hop (needed for correct req.ip behind
  // nginx/Docker, which the rate limiter and audit log rely on).
  app.set("trust proxy", 1);

  // Strict CSP: no inline scripts, no third-party script origins beyond
  // Google (OAuth) and Stripe (checkout.js), object-src none to block
  // legacy plugin-based XSS vectors. This is the primary browser-side
  // defence-in-depth against XSS that slips past output encoding.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "https://js.stripe.com", "https://accounts.google.com"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:"],
          connectSrc: ["'self'", env.frontendUrl],
          frameSrc: ["https://js.stripe.com", "https://accounts.google.com"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          upgradeInsecureRequests: env.nodeEnv === "production" ? [] : null,
        },
      },
      crossOriginResourcePolicy: { policy: "same-site" },
      referrerPolicy: { policy: "no-referrer" },
    })
  );

  app.use(
    cors({
      origin: env.frontendUrl,
      credentials: true,
    })
  );

  app.use(cookieParser());
  app.use(express.json({ limit: "100kb" }));
  app.use(express.urlencoded({ extended: false, limit: "100kb" }));
  app.use(passport.initialize());

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // Feature routers are mounted here incrementally as each module is built
  // (see modules/*/*.routes.ts) - kept as a single visible list so the
  // attack surface of the API is easy to audit at a glance.
  app.use("/api/auth", authRouter);
  app.use("/api/users", apiRateLimiter, usersRouter);
  app.use("/api/groups/:groupId/expenses", apiRateLimiter, expensesRouter);
  app.use("/api/groups/:groupId/settlements", apiRateLimiter, settlementsRouter);
  app.use("/api/groups", apiRateLimiter, groupsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
