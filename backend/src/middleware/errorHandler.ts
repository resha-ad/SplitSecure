import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { logger } from "../utils/logger";

export class AppError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// Centralised error handler. Deliberately returns generic messages for
// unexpected (5xx) errors - stack traces and internal details are logged
// server-side only, never sent to the client, to avoid leaking implementation
// details that would help an attacker (information disclosure).
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: "validation_error",
      details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }

  if (err instanceof AppError) {
    return res.status(err.status).json({ error: err.message });
  }

  logger.error("unhandled_error", {
    message: err instanceof Error ? err.message : String(err),
    path: req.path,
    method: req.method,
  });

  return res.status(500).json({ error: "internal_server_error" });
}

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: "not_found" });
}
