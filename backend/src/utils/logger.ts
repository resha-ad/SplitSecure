import winston from "winston";

// Structured logger. Deliberately never fed request bodies, tokens, passwords
// or full user objects - see middleware/requestLogger.ts and utils/audit.ts,
// which allow-list exactly which fields are safe to persist.
export const logger = winston.createLogger({
  level: process.env.NODE_ENV === "production" ? "info" : "debug",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [new winston.transports.Console()],
});
