import { Request, Response } from "express";
import { createSettlementSchema } from "./settlements.schema";
import * as settlementsService from "./settlements.service";

export async function listBalances(req: Request, res: Response) {
  const balances = await settlementsService.listBalances(req.params.groupId);
  res.json(balances);
}

export async function settleUp(req: Request, res: Response) {
  const input = createSettlementSchema.parse(req.body);
  const settlement = await settlementsService.settleUp(
    req.userId!,
    req.params.groupId,
    input.toUserId,
    input.amountCents,
    input.idempotencyKey
  );
  res.status(201).json(settlement);
}
