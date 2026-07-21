import { Request, Response } from "express";
import {
  registerSchema,
  loginSchema,
  totpVerifySchema,
  totpSetupConfirmSchema,
} from "./auth.schema";
import * as authService from "./auth.service";
import { setRefreshCookie, clearRefreshCookie, REFRESH_COOKIE } from "./cookies";
import { issueCsrfCookie } from "../../middleware/csrf";
import { verifyCaptcha } from "../../utils/captcha";
import { AppError } from "../../middleware/errorHandler";

function sendSession(res: Response, session: { accessToken: string; refreshToken: string }) {
  setRefreshCookie(res, session.refreshToken);
  issueCsrfCookie(res);
  res.json({ accessToken: session.accessToken });
}

export async function register(req: Request, res: Response) {
  const input = registerSchema.parse(req.body);
  const user = await authService.registerUser(input);
  const session = await authService.issueSession(user.id, req.header("user-agent"));
  sendSession(res, session);
}

export async function login(req: Request, res: Response) {
  const input = loginSchema.parse(req.body);

  const captchaOk = await verifyCaptcha(input.captchaToken);
  if (!captchaOk) {
    throw new AppError(400, "captcha_verification_failed");
  }

  const result = await authService.loginStepPassword(
    input.email,
    input.password,
    req.ip,
    req.header("user-agent")
  );

  if (result.mfaRequired) {
    return res.json({ mfaRequired: true, mfaTicket: result.mfaTicket });
  }

  sendSession(res, result);
}

export async function loginTotp(req: Request, res: Response) {
  const input = totpVerifySchema.parse(req.body);
  const session = await authService.loginStepTotp(
    input.mfaTicket,
    input.code,
    req.header("user-agent"),
    req.ip
  );
  sendSession(res, session);
}

export async function refresh(req: Request, res: Response) {
  const presented = req.cookies?.[REFRESH_COOKIE];
  if (!presented) {
    throw new AppError(401, "no_refresh_token_presented");
  }
  const session = await authService.rotateRefreshToken(presented, req.header("user-agent"));
  sendSession(res, session);
}

export async function logout(req: Request, res: Response) {
  const presented = req.cookies?.[REFRESH_COOKIE];
  if (presented) {
    await authService.revokeRefreshToken(presented);
  }
  clearRefreshCookie(res);
  res.status(204).send();
}

export async function totpSetup(req: Request, res: Response) {
  const { qrDataUrl } = await authService.beginTotpSetup(req.userId!);
  res.json({ qrDataUrl });
}

export async function totpConfirm(req: Request, res: Response) {
  const input = totpSetupConfirmSchema.parse(req.body);
  await authService.confirmTotpSetup(req.userId!, input.code);
  res.status(204).send();
}
