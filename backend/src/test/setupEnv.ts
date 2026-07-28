// Dummy env values so config/env.ts doesn't throw on import during unit
// tests that never actually touch a database or Redis instance. Tests that
// need a real Postgres (integration tests) rely on DATABASE_URL being
// overridden by the environment (see .github/workflows/ci.yml, which runs
// a real Postgres service container) rather than this fallback.
process.env.DATABASE_URL ??= "postgresql://splitsecure:splitsecure@localhost:5432/splitsecure_test";
process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.JWT_ACCESS_SECRET ??= "test-access-secret-not-for-production-aaaaaaaaaaaaaaaaaaaaaaaaaaaa";
process.env.JWT_REFRESH_SECRET ??= "test-refresh-secret-not-for-production-aaaaaaaaaaaaaaaaaaaaaaaaa";
process.env.DATA_ENCRYPTION_KEK ??= Buffer.alloc(32, 7).toString("base64");
process.env.CSRF_SECRET ??= "test-csrf-secret-not-for-production-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

// Force-cleared (not `??=`) - a real key may already be sitting in the
// loaded .env for local dev, and tests need the "skip verification, no
// live network call" dev-mode path in utils/captcha.ts, not an attempt to
// verify against Google with no real token.
process.env.RECAPTCHA_SECRET = "";
