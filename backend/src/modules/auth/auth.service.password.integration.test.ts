/**
 * Integration test - requires a real Postgres reachable via DATABASE_URL
 * (see .github/workflows/ci.yml for the CI service container).
 */
import crypto from "crypto";
import { prisma } from "../../config/db";
import { hashPassword } from "../../utils/password";
import { changePassword, registerUser } from "./auth.service";
import { AppError } from "../../middleware/errorHandler";

const STRONG_PASSWORD = "Correct-Horse-Battery9!";
const STRONG_PASSWORD_2 = "Different-Battery-Staple7!";

// crypto.randomUUID() rather than Date.now() - guarantees uniqueness even
// if this file runs twice in close succession against the same DB.
function uniqueEmail(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}@test.local`;
}

describe("changePassword (integration)", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("changes the password and revokes existing sessions", async () => {
    const email = uniqueEmail("pwtest");
    const user = await registerUser({ email, password: STRONG_PASSWORD, displayName: "PW Test" });

    await prisma.refreshToken.create({
      data: { userId: user.id, tokenHash: crypto.randomUUID(), expiresAt: new Date(Date.now() + 100000) },
    });

    await changePassword(user.id, { currentPassword: STRONG_PASSWORD, newPassword: STRONG_PASSWORD_2 });

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updated.passwordHash).not.toBe(user.passwordHash);

    const tokens = await prisma.refreshToken.findMany({ where: { userId: user.id } });
    expect(tokens.every((t) => t.revoked)).toBe(true);
  });

  it("rejects the wrong current password", async () => {
    const email = uniqueEmail("pwtest2");
    const user = await registerUser({ email, password: STRONG_PASSWORD, displayName: "PW Test 2" });

    await expect(
      changePassword(user.id, { currentPassword: "not-the-real-password", newPassword: STRONG_PASSWORD_2 })
    ).rejects.toBeInstanceOf(AppError);
  });

  it("rejects reusing the current password as the new one", async () => {
    const email = uniqueEmail("pwtest3");
    const user = await registerUser({ email, password: STRONG_PASSWORD, displayName: "PW Test 3" });

    await expect(
      changePassword(user.id, { currentPassword: STRONG_PASSWORD, newPassword: STRONG_PASSWORD })
    ).rejects.toBeInstanceOf(AppError);
  });

  it("rejects reusing a password found in history after multiple changes", async () => {
    const email = uniqueEmail("pwtest4");
    const user = await registerUser({ email, password: STRONG_PASSWORD, displayName: "PW Test 4" });

    await changePassword(user.id, { currentPassword: STRONG_PASSWORD, newPassword: STRONG_PASSWORD_2 });

    // Trying to go back to the very first password should be rejected -
    // it's now in password_history even though it's no longer the current hash.
    await expect(
      changePassword(user.id, { currentPassword: STRONG_PASSWORD_2, newPassword: STRONG_PASSWORD })
    ).rejects.toBeInstanceOf(AppError);
  });

  it("allows a genuinely new password unrelated to history", async () => {
    const email = uniqueEmail("pwtest5");
    const user = await registerUser({ email, password: STRONG_PASSWORD, displayName: "PW Test 5" });

    await expect(
      changePassword(user.id, { currentPassword: STRONG_PASSWORD, newPassword: "Totally-Unrelated-Value3!" })
    ).resolves.toBeUndefined();
  });

  it("hashes a real password for the argon2 hint used elsewhere", async () => {
    // sanity check that hashPassword itself still works as expected in this suite
    const hash = await hashPassword(STRONG_PASSWORD);
    expect(hash.startsWith("$argon2id$")).toBe(true);
  });
});
