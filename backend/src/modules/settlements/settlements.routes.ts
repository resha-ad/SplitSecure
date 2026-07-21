import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { requireGroupRole } from "../../middleware/rbac";
import { verifyCsrf } from "../../middleware/csrf";
import { sensitiveActionRateLimiter } from "../../middleware/rateLimiter";
import { asyncHandler } from "../../middleware/asyncHandler";
import * as controller from "./settlements.controller";

export const settlementsRouter = Router({ mergeParams: true });

settlementsRouter.use(requireAuth);
settlementsRouter.use(requireGroupRole("MEMBER"));

settlementsRouter.get("/balances", asyncHandler(controller.listBalances));
settlementsRouter.post("/", verifyCsrf, sensitiveActionRateLimiter, asyncHandler(controller.settleUp));
