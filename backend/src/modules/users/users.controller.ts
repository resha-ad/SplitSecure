import { Request, Response } from "express";
import * as usersService from "./users.service";

export async function me(req: Request, res: Response) {
  const profile = await usersService.getProfile(req.userId!);
  res.json(profile);
}

export async function updateMe(req: Request, res: Response) {
  const profile = await usersService.updateProfile(req.userId!, req.body);
  res.json(profile);
}
