import crypto from "crypto";
import { prisma } from "../../config/db";
import { env } from "../../config/env";
import { hashPassword, verifyPassword } from "../../utils/password";
import { encryptField, decryptField, sha256Hex } from "../../utils/crypto";
import { generateTotpSecret, totpQrCodeDataUrl, verifyTotpCodeWithReplayProtection } from "../../utils/totp";
import {
  generateRefreshToken,
  hashRefreshToken,
  signAccessToken,
  signMfaTicket,
  verifyMfaTicket,
} from "./tokens";
import { AppError } from "../../middleware/errorHandler";
import { RegisterInput, ChangePasswordInput } from "./auth.schema";
import { recordAudit } from "../../utils/audit";
import { recordFailedAuthAttempt } from "../../middleware/ipAccessControl";

const REFRESH_TOKEN_TTL_DAYS = 30;

function userAgentHash(userAgent: string | undefined): string | undefined {
  return userAgent ? sha256Hex(userAgent) : undefined;
}

function isPasswordExpired(passwordChangedAt: Date): boolean {
  const ageDays = (Date.now() - passwordChangedAt.getTime()) / 86_400_000;
  return ageDays > env.passwordExpiryDays;
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
    // Tracked by IP regardless of account existence - this is exactly the
    // credential-stuffing pattern (many emails, one attacker) that
    // per-account lockout below can't see, since each individual email
    // here might only be tried once or twice.
    await recordFailedAuthAttempt(ip);
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
    await recordFailedAuthAttempt(ip);
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
  return {
    mfaRequired: false as const,
    passwordExpired: isPasswordExpired(user.passwordChangedAt),
    ...(await issueSession(user.id, userAgent)),
  };
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
  const { valid, step } = verifyTotpCodeWithReplayProtection(secret, code, user.totpLastStep);

  if (!valid) {
    await recordAudit({ userId: user.id, action: "auth.totp_failed", targetType: "User", targetId: user.id, ip });
    throw new AppError(401, "invalid_totp_code");
  }

  // Recording the matched step is what actually prevents replay - a
  // second submission of this same code will now match `step <=
  // totpLastStep` and be rejected, even though the code itself is still
  // technically within otplib's validity window.
  await prisma.user.update({ where: { id: user.id }, data: { totpLastStep: step } });

  await recordAudit({ userId: user.id, action: "auth.login_success_mfa", targetType: "User", targetId: user.id, ip });
  return { passwordExpired: isPasswordExpired(user.passwordChangedAt), ...(await issueSession(user.id, userAgent)) };
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
  const { valid, step } = verifyTotpCodeWithReplayProtection(secret, code, user.totpLastStep);
  if (!valid) {
    throw new AppError(401, "invalid_totp_code");
  }

  // Recording the step here too, not just at login - otherwise the exact
  // code just used to confirm setup would still be replayable as the
  // first login code immediately afterwards.
  await prisma.user.update({ where: { id: userId }, data: { totpEnabled: true, totpLastStep: step } });
  await recordAudit({ userId, action: "auth.totp_enabled", targetType: "User", targetId: userId });
}

export async function changePassword(userId: string, input: ChangePasswordInput) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  const currentValid = await verifyPassword(user.passwordHash, input.currentPassword);
  if (!currentValid) {
    throw new AppError(401, "current_password_incorrect");
  }

  if (input.newPassword.toLowerCase().includes(user.email.split("@")[0].toLowerCase())) {
    throw new AppError(400, "password_must_not_contain_email");
  }

  // Reuse prevention: check the new password against the current hash and
  // the last N historical ones. Each comparison is a real Argon2 verify
  // (hashes are salted, so this can't be a simple string-equality check).
  const recentHashes = await prisma.passwordHistory.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: env.passwordHistoryCount,
    select: { passwordHash: true },
  });
  const candidateHashes = [user.passwordHash, ...recentHashes.map((h) => h.passwordHash)];
  for (const oldHash of candidateHashes) {
    if (await verifyPassword(oldHash, input.newPassword)) {
      throw new AppError(400, "password_recently_used");
    }
  }

  const newHash = await hashPassword(input.newPassword);

  await prisma.$transaction(async (tx) => {
    await tx.passwordHistory.create({ data: { userId, passwordHash: user.passwordHash } });
    await tx.user.update({
      where: { id: userId },
      data: { passwordHash: newHash, passwordChangedAt: new Date() },
    });

    // Trim history down to the configured retention count.
    const toKeep = await tx.passwordHistory.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: env.passwordHistoryCount,
      select: { id: true },
    });
    await tx.passwordHistory.deleteMany({
      where: { userId, id: { notIn: toKeep.map((h) => h.id) } },
    });

    // A password change is a strong enough signal to end every other
    // session, not just this one - if the change was prompted by a
    // suspected compromise, an attacker's existing session shouldn't
    // survive it.
    await tx.refreshToken.updateMany({ where: { userId }, data: { revoked: true } });
  });

  await recordAudit({ userId, action: "auth.password_changed", targetType: "User", targetId: userId });
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
