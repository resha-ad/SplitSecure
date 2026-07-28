/**
 * Integration test - requires a real Postgres reachable via DATABASE_URL.
 *
 * VULN-06 (TOTP replay): a captured/observed valid TOTP code should only
 * ever authenticate once. Without replay protection, the exact same code
 * can be submitted twice within its ~30-90s validity window and succeed
 * both times - defeating the point of a one-time code.
 */
import crypto from "crypto";
import { authenticator } from "otplib";
import { prisma } from "../../config/db";
import { registerUser, beginTotpSetup, confirmTotpSetup, loginStepPassword, loginStepTotp } from "./auth.service";

const PASSWORD = "Correct-Horse-Battery9!";

function uniqueEmail(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}@test.local`;
}

describe("TOTP replay protection (integration)", () => {
  beforeEach(() => {
    // A single fake clock for the whole test, advanced one 30s step at a
    // time - both code generation and the server's own step calculation
    // (see verifyTotpCodeWithReplayProtection) then agree on "now",
    // exactly like a real client and server would via NTP-synced clocks.
    jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate"] });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("rejects the same TOTP code being used twice", async () => {
    const email = uniqueEmail("totpreplay");
    const user = await registerUser({ email, password: PASSWORD, displayName: "Replay Test" });
    const { secret } = await beginTotpSetup(user.id);
    await confirmTotpSetup(user.id, authenticator.generate(secret));

    jest.setSystemTime(Date.now() + 30_000); // move to a fresh step, distinct from the setup code
    const passwordStep = await loginStepPassword(email, PASSWORD, "127.0.0.1", "jest");
    if (passwordStep.mfaRequired === false) throw new Error("expected mfaRequired");
    const code = authenticator.generate(secret);

    // First use succeeds.
    await loginStepTotp(passwordStep.mfaTicket, code, "jest", "127.0.0.1");

    // Get a fresh mfaTicket (the first is single-use by design) but replay
    // the *same* TOTP code - this must now fail even though the code is
    // still within its normal validity window.
    const passwordStep2 = await loginStepPassword(email, PASSWORD, "127.0.0.1", "jest");
    if (passwordStep2.mfaRequired === false) throw new Error("expected mfaRequired");

    await expect(loginStepTotp(passwordStep2.mfaTicket, code, "jest", "127.0.0.1")).rejects.toThrow();
  });

  it("accepts a genuinely different code from the next time-step", async () => {
    // Sanity check the fix doesn't lock the account out permanently - a
    // *different* code, one real 30s step later, must still work.
    const email = uniqueEmail("totpreplay2");
    const user = await registerUser({ email, password: PASSWORD, displayName: "Replay Test 2" });
    const { secret } = await beginTotpSetup(user.id);
    await confirmTotpSetup(user.id, authenticator.generate(secret));

    jest.setSystemTime(Date.now() + 30_000);
    const passwordStep = await loginStepPassword(email, PASSWORD, "127.0.0.1", "jest");
    if (passwordStep.mfaRequired === false) throw new Error("expected mfaRequired");
    await loginStepTotp(passwordStep.mfaTicket, authenticator.generate(secret), "jest", "127.0.0.1");

    jest.setSystemTime(Date.now() + 30_000);
    const passwordStep2 = await loginStepPassword(email, PASSWORD, "127.0.0.1", "jest");
    if (passwordStep2.mfaRequired === false) throw new Error("expected mfaRequired");
    await expect(
      loginStepTotp(passwordStep2.mfaTicket, authenticator.generate(secret), "jest", "127.0.0.1")
    ).resolves.toBeDefined();
  });
});
