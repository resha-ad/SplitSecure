import dotenv from "dotenv";

dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 4000),

  databaseUrl: required("DATABASE_URL"),
  redisUrl: required("REDIS_URL"),

  jwtAccessSecret: required("JWT_ACCESS_SECRET"),
  jwtRefreshSecret: required("JWT_REFRESH_SECRET"),
  jwtAccessTtl: process.env.JWT_ACCESS_TTL ?? "15d",

  dataEncryptionKek: required("DATA_ENCRYPTION_KEK"),
  csrfSecret: required("CSRF_SECRET"),

  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  googleCallbackUrl: process.env.GOOGLE_CALLBACK_URL ?? "",

  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",

  frontendUrl: process.env.FRONTEND_URL ?? "http://localhost:5173",

  loginMaxAttempts: Number(process.env.LOGIN_MAX_ATTEMPTS ?? 10),
  loginLockoutMinutes: Number(process.env.LOGIN_LOCKOUT_MINUTES ?? 15),

  hcaptchaSecret: process.env.HCAPTCHA_SECRET ?? "",

  passwordExpiryDays: Number(process.env.PASSWORD_EXPIRY_DAYS ?? 90),
  passwordHistoryCount: Number(process.env.PASSWORD_HISTORY_COUNT ?? 5),

  ipBlocklist: (process.env.IP_BLOCKLIST ?? "").split(",").map((ip) => ip.trim()).filter(Boolean),
  ipAllowlist: (process.env.IP_ALLOWLIST ?? "").split(",").map((ip) => ip.trim()).filter(Boolean),
  ipAutoBlockThreshold: Number(process.env.IP_AUTO_BLOCK_THRESHOLD ?? 30),
  ipAutoBlockWindowSeconds: Number(process.env.IP_AUTO_BLOCK_WINDOW_SECONDS ?? 900),
  ipAutoBlockDurationSeconds: Number(process.env.IP_AUTO_BLOCK_DURATION_SECONDS ?? 3600),
};
