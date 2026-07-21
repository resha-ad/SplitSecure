import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { requireGroupRole } from "../../middleware/rbac";
import { verifyCsrf } from "../../middleware/csrf";
import { asyncHandler } from "../../middleware/asyncHandler";
import * as controller from "./groups.controller";

export const groupsRouter = Router();

groupsRouter.use(requireAuth);

groupsRouter.post("/", verifyCsrf, asyncHandler(controller.createGroup));
groupsRouter.get("/", asyncHandler(controller.listGroups));

groupsRouter.get("/:groupId", requireGroupRole("MEMBER"), asyncHandler(controller.getGroup));

groupsRouter.post(
  "/:groupId/members",
  requireGroupRole("ADMIN"),
  verifyCsrf,
  asyncHandler(controller.addMember)
);

groupsRouter.patch(
  "/:groupId/members/:userId/role",
  requireGroupRole("ADMIN"),
  verifyCsrf,
  asyncHandler(controller.changeMemberRole)
);

groupsRouter.delete(
  "/:groupId/members/:userId",
  requireGroupRole("ADMIN"),
  verifyCsrf,
  asyncHandler(controller.removeMember)
);
