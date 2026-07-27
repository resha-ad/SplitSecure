/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/*.test.ts"],
  setupFiles: ["<rootDir>/src/test/setupEnv.ts"],
  // The app's Redis/Prisma clients are process-lifetime singletons (by
  // design - see config/redis.ts, config/db.ts), not meant to be torn
  // down per test file. That's correct for the running app but means
  // Jest sees an open handle at the end of a run and won't exit on its
  // own; forceExit is the standard, accepted fix for exactly this shape
  // of shared-singleton test setup rather than a real leak to chase down.
  forceExit: true,
};
