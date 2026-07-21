import { prisma } from "../../config/db";

export async function getProfile(userId: string) {
  return prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      displayName: true,
      totpEnabled: true,
      createdAt: true,
    },
  });
}

export async function updateProfile(userId: string, body: Record<string, unknown>) {
  return prisma.user.update({
    where: { id: userId },
    data: body,
    select: {
      id: true,
      email: true,
      displayName: true,
      totpEnabled: true,
      createdAt: true,
    },
  });
}
