import { Request, Response } from "express";
import { updateProfileSchema, importDataSchema } from "./users.schema";
import * as usersService from "./users.service";

export async function me(req: Request, res: Response) {
  const profile = await usersService.getProfile(req.userId!);
  res.json(profile);
}

export async function updateMe(req: Request, res: Response) {
  // updateProfileSchema already existed (allow-listing only displayName)
  // but was never actually applied here - the service used to receive
  // req.body verbatim, letting a caller write any real User column
  // (totpEnabled, failedLoginAttempts, lockedUntil, passwordHash, ...) via
  // Prisma's schema-valid-but-unrestricted update().
  const input = updateProfileSchema.parse(req.body);
  const profile = await usersService.updateProfile(req.userId!, input);
  res.json(profile);
}

export async function exportData(req: Request, res: Response) {
  const bundle = await usersService.exportUserData(req.userId!);
  res.setHeader("Content-Disposition", "attachment; filename=\"splitsecure-export.json\"");
  res.json(bundle);
}

export async function importData(req: Request, res: Response) {
  const input = importDataSchema.parse(req.body);
  const profile = await usersService.importUserData(req.userId!, input);
  res.json(profile);
}
