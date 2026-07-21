import jwt from "jsonwebtoken";
import { env } from "../../config/env";
import {
  signAccessToken,
  verifyAccessToken,
  signMfaTicket,
  verifyMfaTicket,
  generateRefreshToken,
  hashRefreshToken,
} from "./tokens";

describe("access tokens", () => {
  it("round-trips the user id", () => {
    const token = signAccessToken("user-123");
    expect(verifyAccessToken(token).sub).toBe("user-123");
  });

  it("rejects a token signed with a different secret", () => {
    const forged = jwt.sign({ sub: "user-123" }, "not-the-real-secret", { issuer: "splitsecure" });
    expect(() => verifyAccessToken(forged)).toThrow();
  });

  it("rejects a token missing the expected issuer", () => {
    const wrongIssuer = jwt.sign({ sub: "user-123" }, env.jwtAccessSecret, { issuer: "someone-else" });
    expect(() => verifyAccessToken(wrongIssuer)).toThrow();
  });
});

describe("mfa tickets", () => {
  it("round-trips and carries the mfa_pending purpose", () => {
    const ticket = signMfaTicket("user-123");
    const claims = verifyMfaTicket(ticket);
    expect(claims.sub).toBe("user-123");
    expect(claims.purpose).toBe("mfa_pending");
  });

  it("rejects a normal access token presented as an mfa ticket", () => {
    // A stolen/regular access token must not be reusable as an mfa ticket -
    // it has no `purpose` claim at all, so this should fail closed.
    const accessToken = signAccessToken("user-123");
    expect(() => verifyMfaTicket(accessToken)).toThrow("invalid_ticket_purpose");
  });
});

describe("refresh tokens", () => {
  it("generates a unique token each call", () => {
    const a = generateRefreshToken();
    const b = generateRefreshToken();
    expect(a.token).not.toBe(b.token);
    expect(a.hash).not.toBe(b.hash);
  });

  it("hashRefreshToken matches the hash produced at generation time", () => {
    const { token, hash } = generateRefreshToken();
    expect(hashRefreshToken(token)).toBe(hash);
  });

  it("never stores the plaintext token as its own hash", () => {
    const { token, hash } = generateRefreshToken();
    expect(hash).not.toBe(token);
  });
});
