import { NextFunction, Request, Response } from "express";
import { GroupRole } from "@prisma/client";
import { prisma } from "../config/db";
import { AppError } from "./errorHandler";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      groupRole?: GroupRole;
    }
  }
}

/**
 * Zero-trust group authorization.
 *
 * Group role is deliberately NOT carried in the JWT. A user can be ADMIN of
 * one group and a plain MEMBER of another, and roles change over time
 * (promotions, removals) - baking a role into a long-lived (15-day) access
 * token would mean a demoted or removed member keeps privileged access
 * until their token happens to expire. Instead every group-scoped request
 * re-reads GroupMember from the database, so a role change or removal takes
 * effect on the very next request, not on next token refresh.
 *
 * `minimumRole` uses MEMBER < ADMIN ordering - requiring MEMBER means "any
 * member of this group", requiring ADMIN means "must be a group admin".
 */
const ROLE_RANK: Record<GroupRole, number> = {
  MEMBER: 0,
  ADMIN: 1,
};

export function requireGroupRole(minimumRole: GroupRole) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const groupId = req.params.groupId;
    if (!groupId) {
      throw new AppError(400, "group_id_missing");
    }

    const membership = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId: req.userId! } },
    });

    if (!membership) {
      // 404, not 403: confirming a group *exists* to a non-member is its
      // own small information leak (group IDs/names), so non-membership
      // and non-existence look identical from the outside.
      throw new AppError(404, "group_not_found");
    }

    if (ROLE_RANK[membership.role] < ROLE_RANK[minimumRole]) {
      throw new AppError(403, "insufficient_group_role");
    }

    req.groupRole = membership.role;
    next();
  };
}
