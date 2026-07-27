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
          if (existing) {
            // Idempotent replay is only valid if it's a replay of *this
            // exact* request - a key collision (bug or otherwise) with
            // different parameters must not silently hand back someone
            // else's settlement under a matching key.
            const matches =
              existing.groupId === groupId &&
              existing.fromUserId === actingUserId &&
              existing.toUserId === toUserId &&
              existing.amountCents === amountCents;
            if (!matches) {
              throw new AppError(409, "idempotency_key_reused_with_different_parameters");
            }
            return existing;
          }

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
          const recipientBalance = balances.get(toUserId) ?? 0;

          if (outstanding >= 0) {
            throw new AppError(400, "no_outstanding_balance_to_settle");
          }
          if (amountCents > -outstanding) {
            throw new AppError(400, "amount_exceeds_outstanding_balance");
          }
          // Without this check, a payer could "settle" with any group
          // member regardless of whether that member is actually owed
          // anything - silently pushing the recipient's own balance into
          // artificial debt. Settling only ever makes sense towards
          // someone who is currently owed money, and never for more than
          // they're owed (otherwise the same artificial-debt problem
          // happens in the other direction).
          if (recipientBalance <= 0) {
            throw new AppError(400, "recipient_is_not_owed_money");
          }
          if (amountCents > recipientBalance) {
            throw new AppError(400, "amount_exceeds_recipient_owed_balance");
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
