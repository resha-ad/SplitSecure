import { Request, Response } from "express";
import { createExpenseSchema } from "./expenses.schema";
import * as expensesService from "./expenses.service";

export async function createExpense(req: Request, res: Response) {
  const input = createExpenseSchema.parse(req.body);
  const expense = await expensesService.createExpense(req.userId!, req.params.groupId, input);
  res.status(201).json(expense);
}

export async function listExpenses(req: Request, res: Response) {
  const expenses = await expensesService.listGroupExpenses(req.params.groupId);
  res.json(expenses);
}

export async function getExpense(req: Request, res: Response) {
  const expense = await expensesService.getExpense(req.params.expenseId);
  res.json(expense);
}

export async function deleteExpense(req: Request, res: Response) {
  await expensesService.deleteExpense(
    req.userId!,
    req.params.groupId,
    req.params.expenseId,
    req.groupRole === "ADMIN"
  );
  res.status(204).send();
}

export async function uploadReceipt(req: Request, res: Response) {
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: "no_file_uploaded" });
    return;
  }
  await expensesService.attachReceipt(req.userId!, req.params.groupId, req.params.expenseId, file);
  res.status(204).send();
}

export async function downloadReceipt(req: Request, res: Response) {
  const buffer = await expensesService.getReceipt(req.params.groupId, req.params.expenseId);
  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Content-Disposition", "attachment; filename=\"receipt\"");
  res.send(buffer);
}
