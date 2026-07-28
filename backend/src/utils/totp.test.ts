import { authenticator } from "otplib";
import { generateTotpSecret, verifyTotpCode, verifyTotpCodeWithReplayProtection, totpQrCodeDataUrl } from "./totp";

describe("totp", () => {
  it("generates a distinct secret each call", () => {
    expect(generateTotpSecret()).not.toBe(generateTotpSecret());
  });

  it("accepts a code generated from the matching secret", () => {
    const secret = generateTotpSecret();
    const code = authenticator.generate(secret);
    expect(verifyTotpCode(secret, code)).toBe(true);
  });

  it("rejects a code generated from a different secret", () => {
    const secret = generateTotpSecret();
    const otherSecret = generateTotpSecret();
    const codeForOther = authenticator.generate(otherSecret);
    expect(verifyTotpCode(secret, codeForOther)).toBe(false);
  });

  it("rejects garbage input without throwing", () => {
    const secret = generateTotpSecret();
    expect(verifyTotpCode(secret, "not-a-code")).toBe(false);
  });

  it("produces a scannable QR code data URL containing the issuer", async () => {
    const secret = generateTotpSecret();
    const dataUrl = await totpQrCodeDataUrl("alice@test.local", secret);
    expect(dataUrl.startsWith("data:image/png;base64,")).toBe(true);
  });
});

describe("verifyTotpCodeWithReplayProtection", () => {
  it("accepts a fresh code with no prior step recorded", () => {
    const secret = generateTotpSecret();
    const code = authenticator.generate(secret);
    const result = verifyTotpCodeWithReplayProtection(secret, code, null);
    expect(result.valid).toBe(true);
    expect(result.step).not.toBeNull();
  });

  it("rejects a code matching a step at or before the last used step", () => {
    const secret = generateTotpSecret();
    const code = authenticator.generate(secret);
    const first = verifyTotpCodeWithReplayProtection(secret, code, null);
    expect(first.valid).toBe(true);

    // Replaying the exact same code - simulating an attacker who captured
    // it - must be rejected even though the code itself is still within
    // otplib's own validity window.
    const replay = verifyTotpCodeWithReplayProtection(secret, code, first.step);
    expect(replay.valid).toBe(false);
  });

  it("rejects invalid codes without throwing", () => {
    const secret = generateTotpSecret();
    expect(verifyTotpCodeWithReplayProtection(secret, "000000", null).valid).toBe(false);
  });
});
