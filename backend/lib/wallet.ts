import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { db } from "./db";

export type WalletData = {
  id: string;
  balanceCents: number;
};

export async function getWallet(userId: string): Promise<WalletData | null> {
  "use cache";
  cacheLife("minutes");
  cacheTag("wallet");
  const w = await db.wallet.findUnique({
    where: { userId },
    select: { id: true, balanceCents: true },
  });
  return w;
}

export async function getWalletBalance(userId: string): Promise<number> {
  const w = await getWallet(userId);
  return w?.balanceCents ?? 0;
}

export type WalletTxView = {
  id: string;
  amountCents: number;
  balanceAfterCents: number;
  type: string;
  note: string | null;
  orderId: string | null;
  orderNumber: string | null;
  createdAt: Date;
};

export async function getWalletTransactions(userId: string, limit = 50): Promise<WalletTxView[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag("wallet");
  const w = await db.wallet.findUnique({ where: { userId }, select: { id: true } });
  if (!w) return [];
  const txs = await db.walletTransaction.findMany({
    where: { walletId: w.id },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      amountCents: true,
      balanceAfterCents: true,
      type: true,
      note: true,
      orderId: true,
      order: { select: { number: true } },
      createdAt: true,
    },
  });
  return txs.map((t) => ({
    id: t.id,
    amountCents: t.amountCents,
    balanceAfterCents: t.balanceAfterCents,
    type: t.type,
    note: t.note,
    orderId: t.orderId,
    orderNumber: t.order?.number ?? null,
    createdAt: t.createdAt,
  }));
}
