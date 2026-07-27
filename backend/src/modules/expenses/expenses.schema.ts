import { z } from "zod";

const splitSchema = z.object({
  userId: z.string().uuid(),
  shareCents: z.number().int().positive(),
});

export const createExpenseSchema = z
  .object({
    description: z.string().trim().min(1).max(200),
    amountCents: z.number().int().positive(),
    currency: z.string().length(3).default("NPR"),
    splits: z.array(splitSchema).min(1).max(50),
  })
  .refine((data) => data.splits.reduce((sum, s) => sum + s.shareCents, 0) === data.amountCents, {
    message: "Split shares must add up exactly to the expense amount",
    path: ["splits"],
  });
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
