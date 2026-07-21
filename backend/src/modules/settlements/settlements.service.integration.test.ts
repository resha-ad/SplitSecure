/**
 * Integration test - requires a real Postgres reachable via DATABASE_URL
 * (see .github/workflows/ci.yml for the CI service container, or run
 * `docker compose up postgres -d` locally and `npx prisma migrate deploy`
 * before running this file).
 *
 * This specifically exercises the double-spend / race-condition defence
 * described in docs/pentest/vuln-03-settlement-race-condition.md: firing
 * concurrent settle requests against the same outstanding balance must
 * result in exactly one success, not two.
 */
import { prisma } from "../../config/db";
import { hashPassword } from "../../utils/password";
import { settleUp, listBalances } from "./settlements.service";
import { AppError } from "../../middleware/errorHandler";

async function makeUser(email: string) {
  return prisma.user.create({
    data: { email, displayName: email, passwordHash: await hashPassword("Irrelevant-For-This-Test9!") },
  });
}

describe("settlements.service (integration)", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("prevents settling more than the outstanding balance, including under concurrency", async () => {
    const payer = await makeUser(`payer-${Date.now()}@test.local`);
    const ower = await makeUser(`ower-${Date.now()}@test.local`);
    const group = await prisma.group.create({
      data: {
        name: "Integration Test Group",
        members: { create: [{ userId: payer.id, role: "ADMIN" }, { userId: ower.id, role: "MEMBER" }] },
      },
    });

    // payer pays £100, split evenly -> ower owes £50
    await prisma.expense.create({
      data: {
        groupId: group.id,
        paidById: payer.id,
        description: "Integration test expense",
        amountCents: 10000,
        splits: { create: [{ userId: payer.id, shareCents: 5000 }, { userId: ower.id, shareCents: 5000 }] },
      },
    });

    const balancesBefore = await listBalances(group.id);
    expect(balancesBefore[ower.id]).toBe(-5000);

    // Fire two concurrent settlements for the full owed amount - only one
    // should succeed; the other must be rejected, not silently doubled.
    const results = await Promise.allSettled([
      settleUp(ower.id, group.id, payer.id, 5000, `${group.id}-race-a`),
      settleUp(ower.id, group.id, payer.id, 5000, `${group.id}-race-b`),
    ]);

    const succeeded = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected");

    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(1);

    const balancesAfter = await listBalances(group.id);
    expect(balancesAfter[ower.id]).toBe(0); // not -5000 (double-spent into negative)
  });

  it("rejects an attempt to settle with no outstanding balance", async () => {
    const a = await makeUser(`a-${Date.now()}@test.local`);
    const b = await makeUser(`b-${Date.now()}@test.local`);
    const group = await prisma.group.create({
      data: { name: "No Balance Group", members: { create: [{ userId: a.id, role: "ADMIN" }, { userId: b.id, role: "MEMBER" }] } },
    });

    await expect(settleUp(a.id, group.id, b.id, 100, `${group.id}-nobalance`)).rejects.toBeInstanceOf(AppError);
  });

  it("treats a repeated idempotency key as a replay, not a new settlement", async () => {
    const payer = await makeUser(`payer2-${Date.now()}@test.local`);
    const ower = await makeUser(`ower2-${Date.now()}@test.local`);
    const group = await prisma.group.create({
      data: {
        name: "Idempotency Test Group",
        members: { create: [{ userId: payer.id, role: "ADMIN" }, { userId: ower.id, role: "MEMBER" }] },
      },
    });
    await prisma.expense.create({
      data: {
        groupId: group.id,
        paidById: payer.id,
        description: "Idempotency test expense",
        amountCents: 4000,
        splits: { create: [{ userId: payer.id, shareCents: 2000 }, { userId: ower.id, shareCents: 2000 }] },
      },
    });

    const key = `${group.id}-idempotent`;
    const first = await settleUp(ower.id, group.id, payer.id, 2000, key);
    const second = await settleUp(ower.id, group.id, payer.id, 2000, key);

    expect(second.id).toBe(first.id);
    const balances = await listBalances(group.id);
    expect(balances[ower.id]).toBe(0); // not -2000 (i.e. not double-counted)
  });
});
