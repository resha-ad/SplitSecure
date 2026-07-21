import { z } from "zod";

export const createSettlementSchema = z.object({
  toUserId: z.string().uuid(),
  amountCents: z.number().int().positive(),
  // Client-generated idempotency key (e.g. a UUID minted once per "Settle
  // up" button click). If the network retries the POST - or a user
  // double-clicks - the server recognises the repeat and returns the
  // original result instead of creating a second settlement.
  idempotencyKey: z.string().uuid(),
});
export type CreateSettlementInput = z.infer<typeof createSettlementSchema>;
