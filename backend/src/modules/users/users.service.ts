import { prisma } from "../../config/db";
import { UpdateProfileInput } from "./users.schema";

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

export async function updateProfile(userId: string, input: UpdateProfileInput) {
  // typed to the exact allow-listed shape from users.schema.ts - no way to
  // pass this function an arbitrary field, by construction.
  return prisma.user.update({
    where: { id: userId },
    data: { displayName: input.displayName },
    select: {
      id: true,
      email: true,
      displayName: true,
      totpEnabled: true,
      createdAt: true,
    },
  });
}
