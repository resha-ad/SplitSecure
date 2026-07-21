import { authenticator } from "otplib";
import { generateTotpSecret, verifyTotpCode, totpQrCodeDataUrl } from "./totp";

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
