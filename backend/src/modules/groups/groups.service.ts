import { prisma } from "../../config/db";
import { AppError } from "../../middleware/errorHandler";
import { recordAudit } from "../../utils/audit";

export async function createGroup(userId: string, name: string) {
  const group = await prisma.group.create({
    data: {
      name,
      members: {
        create: { userId, role: "ADMIN" },
      },
    },
  });
  await recordAudit({ userId, action: "group.created", targetType: "Group", targetId: group.id });
  return group;
}

export async function listUserGroups(userId: string) {
  return prisma.group.findMany({
    where: { members: { some: { userId } } },
    include: { members: { select: { userId: true, role: true, user: { select: { displayName: true, email: true } } } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function getGroupDetail(groupId: string) {
  return prisma.group.findUniqueOrThrow({
    where: { id: groupId },
    include: {
      members: { select: { userId: true, role: true, user: { select: { displayName: true, email: true } } } },
    },
  });
}

export async function addMember(actingUserId: string, groupId: string, email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new AppError(404, "no_user_with_that_email");
  }

  const existing = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId: user.id } },
  });
  if (existing) {
    throw new AppError(409, "user_already_in_group");
  }

  const member = await prisma.groupMember.create({
    data: { groupId, userId: user.id, role: "MEMBER" },
  });
  await recordAudit({ userId: actingUserId, action: "group.member_added", targetType: "Group", targetId: groupId });
  return member;
}

export async function changeMemberRole(
  actingUserId: string,
  groupId: string,
  targetUserId: string,
  role: "ADMIN" | "MEMBER"
) {
  if (role === "MEMBER") {
    const adminCount = await prisma.groupMember.count({ where: { groupId, role: "ADMIN" } });
    const target = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId: targetUserId } },
    });
    if (target?.role === "ADMIN" && adminCount <= 1) {
      // Prevents a group from being left with zero admins, which would
      // permanently lock everyone out of admin-only actions (membership
      // management, forced settlement) with no recovery path.
      throw new AppError(400, "cannot_demote_last_admin");
    }
  }

  const updated = await prisma.groupMember.update({
    where: { groupId_userId: { groupId, userId: targetUserId } },
    data: { role },
  });
  await recordAudit({
    userId: actingUserId,
    action: "group.member_role_changed",
    targetType: "GroupMember",
    targetId: `${groupId}:${targetUserId}`,
  });
  return updated;
}

export async function removeMember(actingUserId: string, groupId: string, targetUserId: string) {
  const target = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId: targetUserId } },
  });
  if (!target) {
    throw new AppError(404, "member_not_found");
  }

  if (target.role === "ADMIN") {
    const adminCount = await prisma.groupMember.count({ where: { groupId, role: "ADMIN" } });
    if (adminCount <= 1) {
      throw new AppError(400, "cannot_remove_last_admin");
    }
  }

  await prisma.groupMember.delete({ where: { groupId_userId: { groupId, userId: targetUserId } } });
  await recordAudit({ userId: actingUserId, action: "group.member_removed", targetType: "GroupMember", targetId: `${groupId}:${targetUserId}` });
}
