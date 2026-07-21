import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../../middleware/auth";
import { requireGroupRole } from "../../middleware/rbac";
import { verifyCsrf } from "../../middleware/csrf";
import { asyncHandler } from "../../middleware/asyncHandler";
import * as controller from "./expenses.controller";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

export const expensesRouter = Router({ mergeParams: true });

expensesRouter.use(requireAuth);
expensesRouter.use(requireGroupRole("MEMBER"));

expensesRouter.post("/", verifyCsrf, asyncHandler(controller.createExpense));
expensesRouter.get("/", asyncHandler(controller.listExpenses));
expensesRouter.get("/:expenseId", asyncHandler(controller.getExpense));
expensesRouter.delete("/:expenseId", verifyCsrf, asyncHandler(controller.deleteExpense));
expensesRouter.post(
  "/:expenseId/receipt",
  verifyCsrf,
  upload.single("receipt"),
  asyncHandler(controller.uploadReceipt)
);
expensesRouter.get("/:expenseId/receipt", asyncHandler(controller.downloadReceipt));
