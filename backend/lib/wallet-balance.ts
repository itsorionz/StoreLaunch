import "server-only";
import type { Prisma } from "@backend/generated/prisma/client";
import { isStoredMoney, MoneyLimits } from "./money-limits";

/** Must run inside the caller's transaction with its matching ledger entry. */
export async function creditWalletBalance(
  tx: Prisma.TransactionClient,
  userId: string,
  amountCents: number,
) {
  if (!isStoredMoney(amountCents) || amountCents === 0) throw new Error("WALLET_BALANCE_LIMIT");
  await tx.wallet.upsert({ where: { userId }, create: { userId, balanceCents: 0 }, update: {} });
  const credited = await tx.wallet.updateMany({
    where: { userId, balanceCents: { lte: MoneyLimits.maxStoredCents - amountCents } },
    data: { balanceCents: { increment: amountCents } },
  });
  if (!credited.count) throw new Error("WALLET_BALANCE_LIMIT");
  return tx.wallet.findUniqueOrThrow({ where: { userId } });
}
