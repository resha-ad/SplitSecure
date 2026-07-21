import { createApp } from "./app";
import { env } from "./config/env";
import { logger } from "./utils/logger";
import { prisma } from "./config/db";
import { redis } from "./config/redis";

const app = createApp();

const server = app.listen(env.port, () => {
  logger.info(`splitsecure backend listening on port ${env.port}`);
});

// Docker/orchestrators send SIGTERM on stop/redeploy - without handling it,
// in-flight requests (e.g. a settlement mid-transaction) get killed
// mid-write instead of finishing cleanly, and connections are dropped
// rather than closed.
async function shutdown(signal: string) {
  logger.info(`received ${signal}, shutting down gracefully`);
  server.close(async () => {
    await Promise.all([prisma.$disconnect(), redis.quit()]);
    process.exit(0);
  });

  // Force-exit if connections don't drain in time, rather than hanging
  // forever on a stuck request.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
