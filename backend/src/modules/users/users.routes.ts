import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { verifyCsrf } from "../../middleware/csrf";
import { asyncHandler } from "../../middleware/asyncHandler";
import * as controller from "./users.controller";

export const usersRouter = Router();

usersRouter.use(requireAuth);
usersRouter.get("/me", asyncHandler(controller.me));
usersRouter.patch("/me", verifyCsrf, asyncHandler(controller.updateMe));
