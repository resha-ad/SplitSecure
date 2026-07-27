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
import { ipAccessControl } from "./middleware/ipAccessControl";
import { asyncHandler } from "./middleware/asyncHandler";
import { prisma } from "./config/db";
import { redis } from "./config/redis";

export function createApp() {
  const app = express();

  // Trust the first proxy hop (needed for correct req.ip behind
  // nginx/Docker, which the rate limiter and audit log rely on).
  app.set("trust proxy", 1);

  // IP blocking/allow-listing runs before anything else - a blocked IP
  // shouldn't burn CPU on CSP headers, body parsing, etc. Sits alongside
  // (not instead of) the per-account rate limiting/lockout below.
  app.use(asyncHandler(ipAccessControl));

  // Strict CSP: no inline scripts, no third-party script origins beyond
  // Google (OAuth) and Stripe (checkout.js), object-src none to block
  // legacy plugin-based XSS vectors. This is the primary browser-side
  // defence-in-depth against XSS that slips past output encoding.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: [
            "'self'",
            "https://js.stripe.com",
            "https://accounts.google.com",
            "https://www.google.com/recaptcha/",
            "https://www.gstatic.com/recaptcha/",
          ],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:"],
          connectSrc: ["'self'", env.frontendUrl],
          frameSrc: [
            "https://js.stripe.com",
            "https://accounts.google.com",
            "https://www.google.com/recaptcha/",
          ],
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

  // Liveness: process is up. Deliberately does not touch the DB/Redis -
  // an orchestrator restarting the container on every transient DB blip
  // would cause more downtime than it prevents.
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // Readiness: are the actual dependencies this app needs reachable?
  // Useful for load balancers / deploy scripts deciding whether to route
  // traffic to this instance yet, separate from "is the process alive."
  app.get("/api/health/ready", async (_req, res) => {
    const [dbOk, redisOk] = await Promise.all([
      // A real (if trivial) model query rather than a raw SQL ping - stays
      // consistent with the rest of the codebase never touching $queryRaw,
      // and incidentally also confirms migrations were actually applied.
      prisma.user.count().then(() => true).catch(() => false),
      redis.ping().then(() => true).catch(() => false),
    ]);

    const ready = dbOk && redisOk;
    res.status(ready ? 200 : 503).json({ status: ready ? "ready" : "not_ready", db: dbOk, redis: redisOk });
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
