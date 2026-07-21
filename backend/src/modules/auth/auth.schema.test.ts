import { passwordSchema, registerSchema } from "./auth.schema";

describe("passwordSchema", () => {
  it("accepts a strong password", () => {
    expect(passwordSchema.safeParse("C0rrect-Horse-Battery9").success).toBe(true);
  });

  it.each([
    ["too short", "Ab1!Ab1!"],
    ["no uppercase", "correcthorsebattery9!"],
    ["no lowercase", "CORRECTHORSEBATTERY9!"],
    ["no digit", "Correct-Horse-Battery!"],
    ["no symbol", "Correct1Horse2Battery9"],
    ["a known common password", "password1"],
  ])("rejects: %s", (_label, candidate) => {
    expect(passwordSchema.safeParse(candidate).success).toBe(false);
  });
});

describe("registerSchema", () => {
  it("lowercases and trims email", () => {
    const result = registerSchema.parse({
      email: "  Test@Example.COM  ",
      password: "C0rrect-Horse-Battery9",
      displayName: "Test User",
    });
    expect(result.email).toBe("test@example.com");
  });

  it("rejects an invalid email", () => {
    expect(
      registerSchema.safeParse({
        email: "not-an-email",
        password: "C0rrect-Horse-Battery9",
        displayName: "Test User",
      }).success
    ).toBe(false);
  });

  it("rejects a password built from the account's own email", () => {
    expect(
      registerSchema.safeParse({
        email: "alice@example.com",
        password: "Alice-Is-Cool9!",
        displayName: "Alice",
      }).success
    ).toBe(false);
  });

  it("accepts a strong password unrelated to the email", () => {
    expect(
      registerSchema.safeParse({
        email: "alice@example.com",
        password: "C0rrect-Horse-Battery9",
        displayName: "Alice",
      }).success
    ).toBe(true);
  });
});
