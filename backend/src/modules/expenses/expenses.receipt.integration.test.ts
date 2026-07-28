/**
 * Integration test - requires a real Postgres reachable via DATABASE_URL.
 *
 * VULN-07: receipt upload validated only the client-supplied
 * `file.mimetype` (the multipart Content-Type header), never the actual
 * file content. A request with a spoofed Content-Type: image/png header
 * carrying arbitrary bytes (e.g. an HTML/JS payload) passed validation.
 */
import crypto from "crypto";
import { prisma } from "../../config/db";
import { hashPassword } from "../../utils/password";
import { createExpense, attachReceipt, getReceipt } from "./expenses.service";
import { AppError } from "../../middleware/errorHandler";

function uniqueEmail(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}@test.local`;
}

async function makeUserInOwnGroup(prefix: string) {
  const user = await prisma.user.create({
    data: {
      email: uniqueEmail(prefix),
      displayName: prefix,
      passwordHash: await hashPassword("Irrelevant-For-This-Test9!"),
    },
  });
  const group = await prisma.group.create({
    data: { name: `${prefix}'s group`, members: { create: { userId: user.id, role: "ADMIN" } } },
  });
  return { user, group };
}

describe("receipt upload content validation (integration)", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("rejects a file whose content doesn't match its claimed type, even with an allow-listed Content-Type", async () => {
    const { user, group } = await makeUserInOwnGroup("receipttest");
    const expense = await createExpense(user.id, group.id, {
      description: "Test expense",
      amountCents: 1000,
      currency: "GBP",
      splits: [{ userId: user.id, shareCents: 1000 }],
    });

    // A real attack shape: HTML/JS content with a spoofed image/png
    // Content-Type header - exactly what an attacker controls in a
    // multipart upload, and exactly what multer hands us as `mimetype`.
    const maliciousBuffer = Buffer.from("<script>alert(document.cookie)</script>", "utf8");

    await expect(
      attachReceipt(user.id, group.id, expense.id, {
        buffer: maliciousBuffer,
        mimetype: "image/png",
        size: maliciousBuffer.length,
      })
    ).rejects.toBeInstanceOf(AppError);
  });

  it("accepts a genuine PNG whose content matches its declared type", async () => {
    const { user, group } = await makeUserInOwnGroup("receipttest2");
    const expense = await createExpense(user.id, group.id, {
      description: "Test expense 2",
      amountCents: 1000,
      currency: "GBP",
      splits: [{ userId: user.id, shareCents: 1000 }],
    });

    const realPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00]);
    await attachReceipt(user.id, group.id, expense.id, {
      buffer: realPng,
      mimetype: "image/png",
      size: realPng.length,
    });

    const stored = await getReceipt(group.id, expense.id);
    expect(stored.equals(realPng)).toBe(true);
  });
});
