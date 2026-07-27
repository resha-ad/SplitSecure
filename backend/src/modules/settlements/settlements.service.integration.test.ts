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

  it("rejects settling with a member who isn't owed anything", async () => {
    const payer = await makeUser(`payer3-${Date.now()}@test.local`);
    const ower = await makeUser(`ower3-${Date.now()}@test.local`);
    const bystander = await makeUser(`bystander-${Date.now()}@test.local`);
    const group = await prisma.group.create({
      data: {
        name: "Bystander Test Group",
        members: {
          create: [
            { userId: payer.id, role: "ADMIN" },
            { userId: ower.id, role: "MEMBER" },
            { userId: bystander.id, role: "MEMBER" },
          ],
        },
      },
    });
    // Bystander is not part of this expense at all - their balance stays 0.
    await prisma.expense.create({
      data: {
        groupId: group.id,
        paidById: payer.id,
        description: "Two-person expense",
        amountCents: 4000,
        splits: { create: [{ userId: payer.id, shareCents: 2000 }, { userId: ower.id, shareCents: 2000 }] },
      },
    });

    await expect(
      settleUp(ower.id, group.id, bystander.id, 2000, `${group.id}-bystander`)
    ).rejects.toBeInstanceOf(AppError);
  });

  it("rejects overpaying a specific creditor beyond what they're individually owed", async () => {
    // A owes money to two separate creditors (B and C) via two expenses.
    // A's *total* debt covers what's owed to both combined, but trying to
    // pay the whole thing to just one of them must fail - otherwise A
    // could mark themselves "settled" while the other creditor is never
    // actually paid.
    const a = await makeUser(`a2-${Date.now()}@test.local`);
    const b = await makeUser(`b2-${Date.now()}@test.local`);
    const c = await makeUser(`c2-${Date.now()}@test.local`);
    const group = await prisma.group.create({
      data: {
        name: "Multi Creditor Group",
        members: { create: [{ userId: a.id, role: "ADMIN" }, { userId: b.id, role: "MEMBER" }, { userId: c.id, role: "MEMBER" }] },
      },
    });

    await prisma.expense.create({
      data: {
        groupId: group.id,
        paidById: b.id,
        description: "B pays, split with A",
        amountCents: 2500,
        splits: { create: [{ userId: b.id, shareCents: 1250 }, { userId: a.id, shareCents: 1250 }] },
      },
    });
    await prisma.expense.create({
      data: {
        groupId: group.id,
        paidById: c.id,
        description: "C pays, split with A",
        amountCents: 2500,
        splits: { create: [{ userId: c.id, shareCents: 1250 }, { userId: a.id, shareCents: 1250 }] },
      },
    });

    const balances = await listBalances(group.id);
    expect(balances[a.id]).toBe(-2500); // A owes 2500 in total, across two people
    expect(balances[b.id]).toBe(1250); // B is only owed 1250 individually
    expect(balances[c.id]).toBe(1250); // C is only owed 1250 individually

    // A tries to pay their *entire* debt to B alone - must be rejected,
    // since B is only actually owed 1250, not 2500.
    await expect(settleUp(a.id, group.id, b.id, 2500, `${group.id}-overpay`)).rejects.toBeInstanceOf(AppError);

    // Paying B exactly what B is owed still works correctly.
    await settleUp(a.id, group.id, b.id, 1250, `${group.id}-correct-amount`);
    const balancesAfter = await listBalances(group.id);
    expect(balancesAfter[b.id]).toBe(0);
    expect(balancesAfter[a.id]).toBe(-1250); // still owes C
  });

  it("rejects a replayed idempotency key whose parameters don't match the original", async () => {
    const payer = await makeUser(`payer4-${Date.now()}@test.local`);
    const ower = await makeUser(`ower4-${Date.now()}@test.local`);
    const group = await prisma.group.create({
      data: {
        name: "Idempotency Mismatch Group",
        members: { create: [{ userId: payer.id, role: "ADMIN" }, { userId: ower.id, role: "MEMBER" }] },
      },
    });
    await prisma.expense.create({
      data: {
        groupId: group.id,
        paidById: payer.id,
        description: "Idempotency mismatch expense",
        amountCents: 4000,
        splits: { create: [{ userId: payer.id, shareCents: 2000 }, { userId: ower.id, shareCents: 2000 }] },
      },
    });

    const key = `${group.id}-mismatch`;
    await settleUp(ower.id, group.id, payer.id, 1000, key);

    // Same key, different amount - must not silently return the first
    // settlement as if it were a valid replay of this different request.
    await expect(settleUp(ower.id, group.id, payer.id, 2000, key)).rejects.toBeInstanceOf(AppError);
  });
});
