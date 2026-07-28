import { prisma } from "../../config/db";
import { AppError } from "../../middleware/errorHandler";
import { recordAudit } from "../../utils/audit";
import { encryptBuffer, decryptBuffer } from "../../utils/crypto";
import { sniffFileType } from "../../utils/fileSignature";
import { CreateExpenseInput } from "./expenses.schema";

const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;
const ALLOWED_RECEIPT_MIME = new Set(["image/png", "image/jpeg", "application/pdf"]);

export async function createExpense(actingUserId: string, groupId: string, input: CreateExpenseInput) {
  const memberIds = new Set(
    (await prisma.groupMember.findMany({ where: { groupId }, select: { userId: true } })).map((m) => m.userId)
  );

  for (const split of input.splits) {
    if (!memberIds.has(split.userId)) {
      throw new AppError(400, "split_assigned_to_non_member");
    }
  }

  const expense = await prisma.expense.create({
    data: {
      groupId,
      paidById: actingUserId,
      description: input.description,
      amountCents: input.amountCents,
      currency: input.currency,
      splits: { create: input.splits },
    },
    include: { splits: true },
  });

  await recordAudit({ userId: actingUserId, action: "expense.created", targetType: "Expense", targetId: expense.id });
  return expense;
}

export async function listGroupExpenses(groupId: string) {
  return prisma.expense.findMany({
    where: { groupId },
    include: { splits: true, paidBy: { select: { id: true, displayName: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function getExpense(groupId: string, expenseId: string) {
  const expense = await prisma.expense.findUnique({
    where: { id: expenseId },
    include: { splits: true, paidBy: { select: { id: true, displayName: true } } },
  });
  // the RBAC middleware only proves the caller belongs to :groupId - it
  // says nothing about whether *this* expense belongs to that group.
  // without this check, any member of any group could read another
  // group's expenses just by knowing/guessing the expense ID.
  if (!expense || expense.groupId !== groupId) {
    throw new AppError(404, "expense_not_found");
  }
  return expense;
}

export async function deleteExpense(actingUserId: string, groupId: string, expenseId: string, isGroupAdmin: boolean) {
  const expense = await prisma.expense.findUnique({ where: { id: expenseId } });
  if (!expense || expense.groupId !== groupId) {
    throw new AppError(404, "expense_not_found");
  }
  if (expense.paidById !== actingUserId && !isGroupAdmin) {
    throw new AppError(403, "only_payer_or_admin_can_delete_expense");
  }

  await prisma.expense.delete({ where: { id: expenseId } });
  await recordAudit({ userId: actingUserId, action: "expense.deleted", targetType: "Expense", targetId: expenseId });
}

export async function attachReceipt(
  actingUserId: string,
  groupId: string,
  expenseId: string,
  file: { buffer: Buffer; mimetype: string; size: number }
) {
  const expense = await prisma.expense.findUnique({ where: { id: expenseId } });
  if (!expense || expense.groupId !== groupId) {
    throw new AppError(404, "expense_not_found");
  }
  if (file.size > MAX_RECEIPT_BYTES) {
    throw new AppError(400, "receipt_too_large");
  }
  if (!ALLOWED_RECEIPT_MIME.has(file.mimetype)) {
    throw new AppError(400, "unsupported_receipt_type");
  }
  // VULN-07 fix: file.mimetype is just the Content-Type header of the
  // multipart part the *client* sent - entirely attacker-controlled, not
  // verified against the bytes that follow it. Sniffing the actual file
  // signature and requiring it to match closes the gap a spoofed header
  // alone left open (e.g. HTML/JS content declared as image/png).
  const actualType = sniffFileType(file.buffer);
  if (actualType === null || actualType !== file.mimetype) {
    throw new AppError(400, "file_content_does_not_match_declared_type");
  }

  const encrypted = encryptBuffer(file.buffer);
  await prisma.expense.update({
    where: { id: expenseId },
    data: { receiptEnc: encrypted.ciphertext, receiptIv: encrypted.iv, receiptTag: encrypted.authTag },
  });
  await recordAudit({ userId: actingUserId, action: "expense.receipt_uploaded", targetType: "Expense", targetId: expenseId });
}

export async function getReceipt(groupId: string, expenseId: string): Promise<Buffer> {
  const expense = await prisma.expense.findUnique({ where: { id: expenseId } });
  if (!expense || expense.groupId !== groupId) {
    throw new AppError(404, "expense_not_found");
  }
  if (!expense.receiptEnc || !expense.receiptIv || !expense.receiptTag) {
    throw new AppError(404, "no_receipt_attached");
  }
  return decryptBuffer({
    ciphertext: expense.receiptEnc,
    iv: expense.receiptIv,
    authTag: expense.receiptTag,
  });
}
