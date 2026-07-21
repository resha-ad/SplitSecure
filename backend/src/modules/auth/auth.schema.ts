import { z } from "zod";

// Password policy: length + complexity + a denylist of common passwords is
// enforced here (breadth of the denylist is intentionally small in dev -
// in the report this is documented as "would call HaveIBeenPwned's
// k-anonymity range API in production" rather than pretending a 20-line
// array is a real breached-password check).
const COMMON_PASSWORDS = new Set([
  "password", "password1", "12345678", "qwerty123", "letmein123",
  "iloveyou1", "admin1234", "welcome123", "changeme1", "splitsecure",
]);

export const passwordSchema = z
  .string()
  .min(12, "Password must be at least 12 characters")
  .max(128)
  .regex(/[a-z]/, "Password must contain a lowercase letter")
  .regex(/[A-Z]/, "Password must contain an uppercase letter")
  .regex(/[0-9]/, "Password must contain a digit")
  .regex(/[^a-zA-Z0-9]/, "Password must contain a symbol")
  .refine((pw) => !COMMON_PASSWORDS.has(pw.toLowerCase()), {
    message: "This password is too common - choose something less guessable",
  });

export const registerSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(254),
    password: passwordSchema,
    displayName: z.string().trim().min(1).max(60),
  })
  // Cross-field check: complexity rules alone don't stop "Alice@2026!" for
  // alice@example.com - a password built from your own email/name is
  // exactly the kind of "technically complex, trivially guessable" pattern
  // per-field regex rules can't catch.
  .refine((data) => !data.password.toLowerCase().includes(data.email.split("@")[0].toLowerCase()), {
    message: "Password must not contain your email address",
    path: ["password"],
  });
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(128),
  captchaToken: z.string().optional(),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const totpVerifySchema = z.object({
  mfaTicket: z.string().min(1),
  code: z.string().regex(/^\d{6}$/, "TOTP code must be 6 digits"),
});
export type TotpVerifyInput = z.infer<typeof totpVerifySchema>;

export const totpSetupConfirmSchema = z.object({
  code: z.string().regex(/^\d{6}$/, "TOTP code must be 6 digits"),
});
