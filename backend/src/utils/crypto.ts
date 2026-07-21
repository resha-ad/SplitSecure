import crypto from "crypto";
import { env } from "../config/env";

/**
 * Envelope encryption for sensitive data at rest (receipts, TOTP secrets).
 *
 * The KEK (Key Encryption Key) comes from DATA_ENCRYPTION_KEK, an
 * environment-injected secret that is never stored in the database and
 * never leaves the server process. Each individual record gets its own
 * random 96-bit IV and is encrypted with AES-256-GCM, which gives us both
 * confidentiality and integrity (the auth tag detects tampering) - so a
 * database-only compromise (e.g. a SQLi read primitive, or a stolen backup)
 * does not expose plaintext without also compromising the KEK, which lives
 * only in the runtime environment / secrets manager, not in source control
 * or the DB.
 *
 * This is "envelope" rather than "field" encryption in spirit: in a
 * production deployment the KEK itself would be pulled from a managed KMS
 * (AWS KMS / Azure Key Vault) and rotated independently of application
 * deploys; here it is a single env-provided key, which is documented as a
 * scoping decision in the report rather than hidden.
 */

const ALGORITHM = "aes-256-gcm";

function getKey(): Buffer {
  const key = Buffer.from(env.dataEncryptionKek, "base64");
  if (key.length !== 32) {
    // Fail loudly rather than silently encrypting with a weak/short key.
    throw new Error("DATA_ENCRYPTION_KEK must decode to exactly 32 bytes (base64)");
  }
  return key;
}

export interface EncryptedPayload {
  ciphertext: string; // base64
  iv: string; // base64
  authTag: string; // base64
}

export function encryptField(plaintext: string): EncryptedPayload {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
  };
}

export function decryptField(payload: EncryptedPayload): string {
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    getKey(),
    Buffer.from(payload.iv, "base64")
  );
  decipher.setAuthTag(Buffer.from(payload.authTag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

// Same envelope-encryption scheme as encryptField/decryptField, but for
// binary payloads (receipt uploads) instead of UTF-8 strings.
export function encryptBuffer(plaintext: Buffer): EncryptedPayload {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
  };
}

export function decryptBuffer(payload: EncryptedPayload): Buffer {
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    getKey(),
    Buffer.from(payload.iv, "base64")
  );
  decipher.setAuthTag(Buffer.from(payload.authTag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, "base64")),
    decipher.final(),
  ]);
}

// Constant-time comparison helper for tokens (CSRF tokens, refresh token
// hashes) to avoid timing side-channels that could let an attacker guess a
// valid value one byte at a time.
export function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function hmacHex(input: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(input).digest("hex");
}
