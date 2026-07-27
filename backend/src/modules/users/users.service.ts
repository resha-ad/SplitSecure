import { prisma } from "../../config/db";
import { UpdateProfileInput, ImportDataInput } from "./users.schema";
import { recordAudit } from "../../utils/audit";

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

/**
 * Data export - a portability/privacy feature (data minimisation: this
 * returns only what *this* user is entitled to see about themselves, not
 * a raw dump of every group they're in). For expenses/settlements, other
 * members' identities are included only as opaque IDs and display names
 * (needed to make the export legible), never their email or any other
 * profile field - exporting your own data shouldn't leak someone else's.
 */
export async function exportUserData(userId: string) {
  const [user, memberships, expensesPaid, mySplits, settlementsFrom, settlementsTo] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, email: true, displayName: true, totpEnabled: true, createdAt: true },
    }),
    prisma.groupMember.findMany({
      where: { userId },
      select: { role: true, joinedAt: true, group: { select: { id: true, name: true } } },
    }),
    prisma.expense.findMany({
      where: { paidById: userId },
      select: { id: true, groupId: true, description: true, amountCents: true, currency: true, createdAt: true },
    }),
    prisma.expenseSplit.findMany({
      where: { userId },
      select: { shareCents: true, expense: { select: { id: true, groupId: true, description: true } } },
    }),
    prisma.settlement.findMany({
      where: { fromUserId: userId },
      select: { id: true, groupId: true, toUserId: true, amountCents: true, status: true, createdAt: true },
    }),
    prisma.settlement.findMany({
      where: { toUserId: userId },
      select: { id: true, groupId: true, fromUserId: true, amountCents: true, status: true, createdAt: true },
    }),
  ]);

  await recordAudit({ userId, action: "user.data_exported", targetType: "User", targetId: userId });

  return {
    exportedAt: new Date().toISOString(),
    profile: user,
    groups: memberships.map((m) => ({
      id: m.group.id,
      name: m.group.name,
      role: m.role,
      joinedAt: m.joinedAt,
    })),
    expensesPaidByMe: expensesPaid,
    myExpenseShares: mySplits.map((s) => ({
      expenseId: s.expense.id,
      groupId: s.expense.groupId,
      description: s.expense.description,
      myShareCents: s.shareCents,
    })),
    settlementsSent: settlementsFrom,
    settlementsReceived: settlementsTo,
  };
}

/**
 * Data import is deliberately narrow: only `profile.displayName` is ever
 * applied, even though the accepted shape mirrors the full export bundle.
 * Re-importing financial records (expenses/settlements) from a client-
 * supplied file would mean trusting the client for ledger integrity - a
 * genuine risk (duplicate/fabricated transactions), not something this
 * scope needed to take on. Documented here as a deliberate boundary, not
 * a forgotten feature.
 */
export async function importUserData(userId: string, input: ImportDataInput) {
  if (!input.profile?.displayName) {
    return getProfile(userId);
  }
  const updated = await updateProfile(userId, { displayName: input.profile.displayName });
  await recordAudit({ userId, action: "user.data_imported", targetType: "User", targetId: userId });
  return updated;
}
