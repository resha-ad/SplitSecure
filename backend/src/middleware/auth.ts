import { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "../modules/auth/tokens";
import { AppError } from "./errorHandler";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

// Access tokens are sent as a Bearer header (held in memory by the SPA, not
// localStorage) rather than a cookie, specifically so they are *not*
// automatically attached by the browser to cross-site requests - that
// removes an entire class of CSRF risk for API calls that only need the
// access token. The refresh token is the one cookie-based, httpOnly value,
// and it's protected by the CSRF middleware instead (see middleware/csrf.ts).
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.header("authorization");
  if (!header?.startsWith("Bearer ")) {
    throw new AppError(401, "missing_bearer_token");
  }

  const token = header.slice("Bearer ".length);
  try {
    const claims = verifyAccessToken(token);
    req.userId = claims.sub;
    next();
  } catch {
    throw new AppError(401, "invalid_or_expired_token");
  }
}
