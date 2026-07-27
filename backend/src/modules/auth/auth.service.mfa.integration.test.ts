/**
 * Integration test - requires a real Postgres reachable via DATABASE_URL
 * (see .github/workflows/ci.yml for the CI service container).
 *
 * Exercises the full MFA lifecycle end to end: password login without MFA,
 * TOTP setup, confirming setup with a real generated code, then a full
 * two-step login (password -> mfa ticket -> TOTP code -> session).
 */
import crypto from "crypto";
import { authenticator } from "otplib";
import { prisma } from "../../config/db";
import {
  registerUser,
  beginTotpSetup,
  confirmTotpSetup,
  loginStepPassword,
  loginStepTotp,
} from "./auth.service";
import { AppError } from "../../middleware/errorHandler";

const PASSWORD = "Correct-Horse-Battery9!";

function uniqueEmail(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}@test.local`;
}

describe("MFA lifecycle (integration)", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("logs in without MFA before it's enabled", async () => {
    const email = uniqueEmail("mfa-before");
    await registerUser({ email, password: PASSWORD, displayName: "MFA Before" });

    const result = await loginStepPassword(email, PASSWORD, "127.0.0.1", "jest");
    expect(result.mfaRequired).toBe(false);
  });

  it("requires and accepts a real TOTP code once enabled", async () => {
    const email = uniqueEmail("mfa-full");
    const user = await registerUser({ email, password: PASSWORD, displayName: "MFA Full" });

    // beginTotpSetup returns the raw secret at the service layer (never
    // over HTTP - the controller only ever sends the QR image) so tests
    // can generate a real code the same way an authenticator app would.
    const { secret } = await beginTotpSetup(user.id);
    const setupCode = authenticator.generate(secret);
    await confirmTotpSetup(user.id, setupCode);

    const passwordStep = await loginStepPassword(email, PASSWORD, "127.0.0.1", "jest");
    expect(passwordStep.mfaRequired).toBe(true);
    if (!passwordStep.mfaRequired) throw new Error("expected mfaRequired");

    const loginCode = authenticator.generate(secret);
    const session = await loginStepTotp(passwordStep.mfaTicket, loginCode, "jest", "127.0.0.1");
    expect(session.accessToken).toBeTruthy();
    expect(session.refreshToken).toBeTruthy();
  });

  it("rejects a wrong TOTP code at login", async () => {
    const email = uniqueEmail("mfa-wrongcode");
    const user = await registerUser({ email, password: PASSWORD, displayName: "MFA Wrong" });
    const { secret } = await beginTotpSetup(user.id);
    await confirmTotpSetup(user.id, authenticator.generate(secret));

    const passwordStep = await loginStepPassword(email, PASSWORD, "127.0.0.1", "jest");
    if (passwordStep.mfaRequired === false) throw new Error("expected mfaRequired");

    await expect(loginStepTotp(passwordStep.mfaTicket, "000000", "jest", "127.0.0.1")).rejects.toBeInstanceOf(
      AppError
    );
  });

  it("rejects confirming setup with a code from an unrelated secret", async () => {
    const email = uniqueEmail("mfa-confirm-wrong");
    const user = await registerUser({ email, password: PASSWORD, displayName: "MFA Confirm Wrong" });
    await beginTotpSetup(user.id);

    const someOtherSecret = authenticator.generateSecret();
    await expect(confirmTotpSetup(user.id, authenticator.generate(someOtherSecret))).rejects.toBeInstanceOf(
      AppError
    );

    const stillDisabled = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(stillDisabled.totpEnabled).toBe(false);
  });
});
