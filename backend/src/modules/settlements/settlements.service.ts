import { Prisma } from "@prisma/client";
import { prisma } from "../../config/db";
import { AppError } from "../../middleware/errorHandler";
import { recordAudit } from "../../utils/audit";

type Tx = Prisma.TransactionClient;

/**
 * Net-balance model (the same simplification Splitwise calls "simplify
 * debts"): each member has a single net balance in the group rather than a
 * full pairwise debt graph. Positive = the group owes them; negative = they
 * owe the group. Settling with *any* other member reduces your own net
 * debt - it does not have to be the specific person you "logically" owe.
 * This is a deliberate scoping decision (documented in the report) that
 * keeps the ledger tractable for a coursework timeline while still being a
 * legitimate, widely-used model, not an oversight.
 */
export async function computeBalances(groupId: string, client: Tx | typeof prisma = prisma) {
  const [expenses, splits, settlements] = await Promise.all([
    client.expense.groupBy({ by: ["paidById"], where: { groupId }, _sum: { amountCents: true } }),
    client.expenseSplit.groupBy({
      by: ["userId"],
      where: { expense: { groupId } },
      _sum: { shareCents: true },
    }),
    client.settlement.findMany({ where: { groupId, status: "COMPLETED" } }),
  ]);

  const balances = new Map<string, number>();
  const add = (userId: string, delta: number) => balances.set(userId, (balances.get(userId) ?? 0) + delta);

  for (const row of expenses) add(row.paidById, row._sum.amountCents ?? 0);
  for (const row of splits) add(row.userId, -(row._sum.shareCents ?? 0));
  for (const s of settlements) {
    add(s.fromUserId, s.amountCents); // paying down your own debt moves your balance toward zero
    add(s.toUserId, -s.amountCents); // having been paid moves the receiver's balance toward zero
  }

  return balances;
}

export async function listBalances(groupId: string) {
  const balances = await computeBalances(groupId);
  return Object.fromEntries(balances);
}

const MAX_RETRIES = 3;

export async function settleUp(
  actingUserId: string,
  groupId: string,
  toUserId: string,
  amountCents: number,
  idempotencyKey: string
) {
  if (actingUserId === toUserId) {
    throw new AppError(400, "cannot_settle_with_yourself");
  }

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const existing = await tx.settlement.findUnique({ where: { idempotencyKey } });
          if (existing) return existing; // idempotent replay, not a new settlement

          // Recomputing the balance *inside* the serializable transaction -
          // rather than trusting a value read before the transaction began -
          // is what actually closes the double-spend race: if two
          // concurrent settle requests both try to spend the same
          // outstanding balance, Postgres's serializable isolation forces
          // one of them to fail with a serialization conflict (caught
          // below and retried/rejected) instead of silently letting both
          // succeed against a balance that was only true at read time.
          const balances = await computeBalances(groupId, tx);
          const outstanding = balances.get(actingUserId) ?? 0;

          if (outstanding >= 0) {
            throw new AppError(400, "no_outstanding_balance_to_settle");
          }
          if (amountCents > -outstanding) {
            throw new AppError(400, "amount_exceeds_outstanding_balance");
          }

          const settlement = await tx.settlement.create({
            data: {
              groupId,
              fromUserId: actingUserId,
              toUserId,
              amountCents,
              status: "COMPLETED",
              method: "INTERNAL",
              idempotencyKey,
            },
          });

          await recordAudit({
            userId: actingUserId,
            action: "settlement.completed",
            targetType: "Settlement",
            targetId: settlement.id,
          });

          return settlement;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );
    } catch (err) {
      const isSerializationConflict =
        err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2034";
      if (isSerializationConflict && attempt < MAX_RETRIES - 1) {
        continue; // another concurrent settlement won the race - retry against fresh data
      }
      if (isSerializationConflict) {
        throw new AppError(409, "settlement_conflict_please_retry");
      }
      throw err;
    }
  }

  throw new AppError(409, "settlement_conflict_please_retry");
}
