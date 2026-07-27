import { z } from "zod";

// NPR 10.00 - a sensible floor to stop trivial/placeholder entries (also
// keeps percentage-split rounding well clear of the "shares don't sum to
// the total because of an absurdly tiny amount" edge case).
export const MIN_EXPENSE_AMOUNT_CENTS = 1000;

const splitSchema = z.object({
  userId: z.string().uuid(),
  shareCents: z.number().int().positive(),
});

export const createExpenseSchema = z
  .object({
    description: z.string().trim().min(1).max(200),
    amountCents: z.number().int().min(MIN_EXPENSE_AMOUNT_CENTS, "Amount must be at least NPR 10.00"),
    currency: z.string().length(3).default("NPR"),
    splits: z.array(splitSchema).min(1).max(50),
  })
  .refine((data) => data.splits.reduce((sum, s) => sum + s.shareCents, 0) === data.amountCents, {
    message: "Split shares must add up exactly to the expense amount",
    path: ["splits"],
  });
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
