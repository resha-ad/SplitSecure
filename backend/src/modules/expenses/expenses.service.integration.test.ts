/**
 * Integration test - requires a real Postgres reachable via DATABASE_URL
 * (see .github/workflows/ci.yml). Regression test for VULN-01 (IDOR): a
 * member of one group must not be able to read another group's expense by
 * ID, even when the group ID in the URL is one they legitimately belong to.
 */
import { prisma } from "../../config/db";
import { hashPassword } from "../../utils/password";
import { createExpense, getExpense } from "./expenses.service";
import { AppError } from "../../middleware/errorHandler";

async function makeUserInOwnGroup(email: string) {
  const user = await prisma.user.create({
    data: { email, displayName: email, passwordHash: await hashPassword("Irrelevant-For-This-Test9!") },
  });
  const group = await prisma.group.create({
    data: { name: `${email}'s group`, members: { create: { userId: user.id, role: "ADMIN" } } },
  });
  return { user, group };
}

describe("expenses.service (integration)", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("does not return an expense that belongs to a different group", async () => {
    const stamp = Date.now();
    const { user: userA, group: groupA } = await makeUserInOwnGroup(`a-${stamp}@test.local`);
    const { group: groupB } = await makeUserInOwnGroup(`b-${stamp}@test.local`);

    const foreignExpense = await createExpense(userA.id, groupA.id, {
      description: "Should not leak into group B",
      amountCents: 1000,
      currency: "GBP",
      splits: [{ userId: userA.id, shareCents: 1000 }],
    });

    // Attacker is a legitimate member of groupB, supplying groupB's own
    // (valid) ID alongside groupA's expense ID.
    await expect(getExpense(groupB.id, foreignExpense.id)).rejects.toBeInstanceOf(AppError);
  });

  it("does return the expense when the group ID actually matches", async () => {
    const stamp = Date.now();
    const { user, group } = await makeUserInOwnGroup(`c-${stamp}@test.local`);
    const expense = await createExpense(user.id, group.id, {
      description: "Legit same-group read",
      amountCents: 500,
      currency: "GBP",
      splits: [{ userId: user.id, shareCents: 500 }],
    });

    const fetched = await getExpense(group.id, expense.id);
    expect(fetched.id).toBe(expense.id);
  });
});
