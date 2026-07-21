import { updateProfileSchema } from "./users.schema";

// Regression test for VULN-02 (mass assignment): confirms extra fields
// beyond the allow-listed shape never survive validation, however the
// request body is shaped.
describe("updateProfileSchema", () => {
  it("accepts a valid displayName", () => {
    const result = updateProfileSchema.parse({ displayName: "Alex" });
    expect(result).toEqual({ displayName: "Alex" });
  });

  it("strips fields beyond the allow-listed shape rather than passing them through", () => {
    const result = updateProfileSchema.parse({
      displayName: "Alex",
      totpEnabled: true,
      failedLoginAttempts: 0,
      lockedUntil: null,
      passwordHash: "attacker-controlled",
    });
    expect(result).toEqual({ displayName: "Alex" });
    expect(result).not.toHaveProperty("totpEnabled");
    expect(result).not.toHaveProperty("passwordHash");
  });

  it("rejects an empty displayName", () => {
    expect(updateProfileSchema.safeParse({ displayName: "" }).success).toBe(false);
  });
});
