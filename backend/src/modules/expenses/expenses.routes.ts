import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../../middleware/auth";
import { requireGroupRole } from "../../middleware/rbac";
import { verifyCsrf } from "../../middleware/csrf";
import { sensitiveActionRateLimiter } from "../../middleware/rateLimiter";
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
// Receipts get their own stricter limit on top of the router-wide one -
// the global 120/min is sized for normal CRUD polling, not for a file
// endpoint that's a more attractive target for enumeration/scraping
// attempts once someone has a valid session in *a* group.
expensesRouter.post(
  "/:expenseId/receipt",
  verifyCsrf,
  sensitiveActionRateLimiter,
  upload.single("receipt"),
  asyncHandler(controller.uploadReceipt)
);
expensesRouter.get(
  "/:expenseId/receipt",
  sensitiveActionRateLimiter,
  asyncHandler(controller.downloadReceipt)
);
