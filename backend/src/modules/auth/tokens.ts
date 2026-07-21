import jwt from "jsonwebtoken";
import crypto from "crypto";
import { env } from "../../config/env";
import { sha256Hex } from "../../utils/crypto";

export interface AccessTokenClaims {
  sub: string; // userId
}

export function signAccessToken(userId: string): string {
  const options: jwt.SignOptions = {
    expiresIn: env.jwtAccessTtl as jwt.SignOptions["expiresIn"],
    issuer: "splitsecure",
  };
  return jwt.sign({ sub: userId } satisfies AccessTokenClaims, env.jwtAccessSecret, options);
}

export function verifyAccessToken(token: string): AccessTokenClaims {
  return jwt.verify(token, env.jwtAccessSecret, { issuer: "splitsecure" }) as AccessTokenClaims;
}

// Short-lived ticket issued after a *correct password* but before TOTP is
// verified. It only proves "this request knows the password for user X",
// never a full session - a stolen/leaked mfaTicket alone cannot access any
// protected resource.
export interface MfaTicketClaims {
  sub: string;
  purpose: "mfa_pending";
}

export function signMfaTicket(userId: string): string {
  return jwt.sign({ sub: userId, purpose: "mfa_pending" } satisfies MfaTicketClaims, env.jwtAccessSecret, {
    expiresIn: "5m",
    issuer: "splitsecure",
  });
}

export function verifyMfaTicket(token: string): MfaTicketClaims {
  const claims = jwt.verify(token, env.jwtAccessSecret, { issuer: "splitsecure" }) as MfaTicketClaims;
  if (claims.purpose !== "mfa_pending") {
    throw new Error("invalid_ticket_purpose");
  }
  return claims;
}

// Refresh tokens are opaque random values, not JWTs - the server is the
// only party that needs to interpret them, so there's no benefit to making
// them self-describing, and keeping them opaque means a leaked token can't
// be inspected for metadata. Only the SHA-256 hash is ever persisted.
export function generateRefreshToken(): { token: string; hash: string } {
  const token = crypto.randomBytes(48).toString("base64url");
  return { token, hash: sha256Hex(token) };
}

export function hashRefreshToken(token: string): string {
  return sha256Hex(token);
}
