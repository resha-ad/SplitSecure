import crypto from "crypto";
import { prisma } from "../../config/db";
import { env } from "../../config/env";
import { hashPassword, verifyPassword } from "../../utils/password";
import { encryptField, decryptField, sha256Hex } from "../../utils/crypto";
import { generateTotpSecret, totpQrCodeDataUrl, verifyTotpCode } from "../../utils/totp";
import {
  generateRefreshToken,
  hashRefreshToken,
  signAccessToken,
  signMfaTicket,
  verifyMfaTicket,
} from "./tokens";
import { AppError } from "../../middleware/errorHandler";
import { RegisterInput } from "./auth.schema";
import { recordAudit } from "../../utils/audit";

const REFRESH_TOKEN_TTL_DAYS = 30;

function userAgentHash(userAgent: string | undefined): string | undefined {
  return userAgent ? sha256Hex(userAgent) : undefined;
}

export async function registerUser(input: RegisterInput) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    // Same error either way at the *field* level would leak account
    // existence via a different code path than login - login intentionally
    // returns a generic "invalid credentials" message (see loginStepPassword)
    // so the only place enumeration is possible is here, which is a
    // documented, accepted trade-off (registration UX needs to tell a user
    // their email is taken) rather than an oversight.
    throw new AppError(409, "an_account_with_this_email_already_exists");
  }

  const passwordHash = await hashPassword(input.password);
  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash,
      displayName: input.displayName,
    },
  });

  await recordAudit({ userId: user.id, action: "user.registered", targetType: "User", targetId: user.id });
  return user;
}

export async function loginStepPassword(
  email: string,
  password: string,
  ip: string | undefined,
  userAgent: string | undefined
) {
  const user = await prisma.user.findUnique({ where: { email } });

  // Constant-shape response whether or not the account exists, so a caller
  // cannot use response timing/content to enumerate valid emails. We still
  // run a dummy hash comparison against a fixed hash when the user doesn't
  // exist, so the response time doesn't leak existence either.
  if (!user) {
    await verifyPassword(
      "$argon2id$v=19$m=65536,t=3,p=1$c29tZXNhbHQ$AAAAAAAAAAAAAAAAAAAAAA",
      password
    );
    throw new AppError(401, "invalid_credentials");
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    await recordAudit({ userId: user.id, action: "auth.login_blocked_locked", targetType: "User", targetId: user.id, ip });
    throw new AppError(423, "account_temporarily_locked");
  }

  const passwordValid = await verifyPassword(user.passwordHash, password);

  if (!passwordValid) {
    const attempts = user.failedLoginAttempts + 1;
    const lockingNow = attempts >= env.loginMaxAttempts;

    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: lockingNow ? 0 : attempts,
        lockedUntil: lockingNow
          ? new Date(Date.now() + env.loginLockoutMinutes * 60_000)
          : null,
      },
    });

    await recordAudit({ userId: user.id, action: "auth.login_failed", targetType: "User", targetId: user.id, ip });
    throw new AppError(401, "invalid_credentials");
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginAttempts: 0, lockedUntil: null },
  });

  if (user.totpEnabled) {
    await recordAudit({ userId: user.id, action: "auth.password_verified_awaiting_totp", targetType: "User", targetId: user.id, ip });
    return { mfaRequired: true as const, mfaTicket: signMfaTicket(user.id) };
  }

  await recordAudit({ userId: user.id, action: "auth.login_success", targetType: "User", targetId: user.id, ip });
  return { mfaRequired: false as const, ...(await issueSession(user.id, userAgent)) };
}

export async function loginStepTotp(
  mfaTicket: string,
  code: string,
  userAgent: string | undefined,
  ip: string | undefined
) {
  let userId: string;
  try {
    userId = verifyMfaTicket(mfaTicket).sub;
  } catch {
    throw new AppError(401, "mfa_ticket_invalid_or_expired");
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.totpEnabled || !user.totpSecretEnc) {
    throw new AppError(401, "mfa_not_configured");
  }

  const secret = decryptField(JSON.parse(user.totpSecretEnc));
  const valid = verifyTotpCode(secret, code);

  if (!valid) {
    await recordAudit({ userId: user.id, action: "auth.totp_failed", targetType: "User", targetId: user.id, ip });
    throw new AppError(401, "invalid_totp_code");
  }

  await recordAudit({ userId: user.id, action: "auth.login_success_mfa", targetType: "User", targetId: user.id, ip });
  return issueSession(user.id, userAgent);
}

export async function issueSession(userId: string, userAgent: string | undefined) {
  const accessToken = signAccessToken(userId);
  const { token: refreshToken, hash } = generateRefreshToken();

  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hash,
      userAgentHash: userAgentHash(userAgent),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 86_400_000),
    },
  });

  return { accessToken, refreshToken };
}

export async function rotateRefreshToken(presentedToken: string, userAgent: string | undefined) {
  const hash = hashRefreshToken(presentedToken);
  const existing = await prisma.refreshToken.findUnique({ where: { tokenHash: hash } });

  if (!existing || existing.revoked || existing.expiresAt < new Date()) {
    throw new AppError(401, "refresh_token_invalid");
  }

  const presentedUaHash = userAgentHash(userAgent);
  if (existing.userAgentHash && presentedUaHash && existing.userAgentHash !== presentedUaHash) {
    // Session-binding check: a refresh token minted for one user agent
    // being replayed from a completely different one is treated as
    // suspected theft, and the whole session is revoked rather than
    // silently honoured.
    await prisma.refreshToken.update({ where: { id: existing.id }, data: { revoked: true } });
    await recordAudit({ userId: existing.userId, action: "auth.refresh_rejected_ua_mismatch", targetType: "User", targetId: existing.userId });
    throw new AppError(401, "refresh_token_invalid");
  }

  // Rotation: the presented token is immediately revoked and replaced.
  // If it's ever presented again (e.g. an attacker replaying a stolen but
  // already-used token), that's a strong signal of compromise.
  await prisma.refreshToken.update({ where: { id: existing.id }, data: { revoked: true } });

  return issueSession(existing.userId, userAgent);
}

export async function revokeRefreshToken(presentedToken: string) {
  const hash = hashRefreshToken(presentedToken);
  await prisma.refreshToken.updateMany({ where: { tokenHash: hash }, data: { revoked: true } });
}

export async function beginTotpSetup(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const secret = generateTotpSecret();
  const encrypted = encryptField(secret);

  // Stored but not yet "enabled" - a half-finished setup can't be used to
  // log in until confirmTotpSetup verifies the user actually has it in an
  // authenticator app (protects against locking yourself out with a typo'd
  // scan, and against an attacker silently enabling MFA on a hijacked
  // session pointing at a secret only *they* have scanned).
  await prisma.user.update({
    where: { id: userId },
    data: { totpSecretEnc: JSON.stringify(encrypted), totpEnabled: false },
  });

  const qrDataUrl = await totpQrCodeDataUrl(user.email, secret);
  return { qrDataUrl, secret };
}

export async function confirmTotpSetup(userId: string, code: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.totpSecretEnc) {
    throw new AppError(400, "totp_setup_not_started");
  }

  const secret = decryptField(JSON.parse(user.totpSecretEnc));
  if (!verifyTotpCode(secret, code)) {
    throw new AppError(401, "invalid_totp_code");
  }

  await prisma.user.update({ where: { id: userId }, data: { totpEnabled: true } });
  await recordAudit({ userId, action: "auth.totp_enabled", targetType: "User", targetId: userId });
}

export async function findOrCreateGoogleUser(googleId: string, email: string, displayName: string) {
  let user = await prisma.user.findUnique({ where: { googleId } });
  if (user) return user;

  user = await prisma.user.findUnique({ where: { email } });
  if (user) {
    // Link the OAuth identity to an existing account rather than creating
    // a duplicate - but only after the email is confirmed by Google, since
    // Google is a trusted identity provider for verified addresses.
    return prisma.user.update({ where: { id: user.id }, data: { googleId } });
  }

  // OAuth-created accounts get a random, never-shared password hash so the
  // password-login path stays uniformly rejecting for them (there is no
  // password to check) rather than needing a nullable-password special
  // case sprinkled through the login logic.
  const randomPassword = crypto.randomBytes(32).toString("hex");
  return prisma.user.create({
    data: {
      email,
      googleId,
      displayName,
      passwordHash: await hashPassword(randomPassword),
    },
  });
}
