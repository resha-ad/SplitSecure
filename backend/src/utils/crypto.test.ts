import { encryptField, decryptField, encryptBuffer, decryptBuffer, timingSafeEqual } from "./crypto";

describe("envelope encryption", () => {
  it("round-trips a string field", () => {
    const plaintext = "JBSWY3DPEHPK3PXP"; // shape of a TOTP secret
    const encrypted = encryptField(plaintext);
    expect(encrypted.ciphertext).not.toContain(plaintext);
    expect(decryptField(encrypted)).toBe(plaintext);
  });

  it("round-trips a binary buffer", () => {
    const original = Buffer.from([0, 1, 2, 255, 254, 10, 13]);
    const encrypted = encryptBuffer(original);
    expect(decryptBuffer(encrypted)).toEqual(original);
  });

  it("fails to decrypt if the auth tag has been tampered with", () => {
    const encrypted = encryptField("secret-value");
    const tampered = { ...encrypted, authTag: Buffer.alloc(16, 1).toString("base64") };
    expect(() => decryptField(tampered)).toThrow();
  });

  it("fails to decrypt if the ciphertext has been tampered with", () => {
    const encrypted = encryptField("secret-value");
    const tamperedBytes = Buffer.from(encrypted.ciphertext, "base64");
    tamperedBytes[0] ^= 0xff;
    expect(() => decryptField({ ...encrypted, ciphertext: tamperedBytes.toString("base64") })).toThrow();
  });
});

describe("timingSafeEqual", () => {
  it("returns true for identical strings", () => {
    expect(timingSafeEqual("abc123", "abc123")).toBe(true);
  });

  it("returns false for different strings of the same length", () => {
    expect(timingSafeEqual("abc123", "abc124")).toBe(false);
  });

  it("returns false for different-length strings without throwing", () => {
    expect(timingSafeEqual("short", "a-lot-longer-string")).toBe(false);
  });
});
