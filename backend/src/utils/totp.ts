import { authenticator } from "otplib";
import QRCode from "qrcode";

authenticator.options = { window: 1 }; // allow 1 step (~30s) of clock drift, no more

export function generateTotpSecret(): string {
  return authenticator.generateSecret();
}

export function verifyTotpCode(secret: string, code: string): boolean {
  try {
    return authenticator.check(code, secret);
  } catch {
    return false;
  }
}

const STEP_SECONDS = 30;

function currentStep(): number {
  return Math.floor(Date.now() / 1000 / STEP_SECONDS);
}

export interface ReplayCheckResult {
  valid: boolean;
  step: number | null;
}

// VULN-06 fix: `verifyTotpCode` alone (checkDelta without a "last used"
// comparison) accepts the same code repeatedly for as long as it stays
// inside the validity window - a captured code is a valid code multiple
// times over. `checkDelta` tells us *which* time-step actually matched
// (current step + delta), so the caller can reject anything at or before
// the step that last succeeded, while still accepting a genuinely new
// code from a later step.
export function verifyTotpCodeWithReplayProtection(
  secret: string,
  code: string,
  lastUsedStep: number | null | undefined
): ReplayCheckResult {
  let delta: number | null;
  try {
    delta = authenticator.checkDelta(code, secret);
  } catch {
    return { valid: false, step: null };
  }

  if (delta === null) return { valid: false, step: null };

  const matchedStep = currentStep() + delta;
  if (lastUsedStep != null && matchedStep <= lastUsedStep) {
    return { valid: false, step: null };
  }

  return { valid: true, step: matchedStep };
}

export async function totpQrCodeDataUrl(email: string, secret: string): Promise<string> {
  const otpauth = authenticator.keyuri(email, "SplitSecure", secret);
  return QRCode.toDataURL(otpauth);
}
