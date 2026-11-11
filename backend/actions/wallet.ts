"use server";

import { WalletTransactionTypes } from "@backend/lib/enums.mjs";
import { recordId, moneyAmount, validationFailure } from "../lib/form-validation";

import { updateTag } from "next/cache";
import { z } from "zod";
import { db } from "../lib/db";
import { requireAdmin } from "../lib/session";
import { creditWalletBalance } from "../lib/wallet-balance";
import { logger } from "../lib/logger";

const log = logger.child({ scope: "action:wallet" });

export type WalletActionResult = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  balanceCents?: number;
};

function bustWallet() {
  updateTag("wallet");
}

const giftSchema = z.object({
  userId: recordId,
  amountCents: moneyAmount.refine(
    (value) => value >= 1 && value <= 10_000_000,
    "Enter an amount between 1 and 10000000 minor units",
  ),
  note: z.string().trim().max(500, "Use at most 500 characters").optional(),
});

export async function giftWallet(
  _prev: WalletActionResult | null,
  formData: FormData,
): Promise<WalletActionResult> {
  await requireAdmin();
  const parsed = giftSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { ok: false, ...validationFailure(parsed.error) };
  }
  const { userId, amountCents, note } = parsed.data;

  try {
    const result = await db.$transaction(async (tx) => {
      const wallet = await creditWalletBalance(tx, userId, amountCents);
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          amountCents,
          balanceAfterCents: wallet.balanceCents,
          type: WalletTransactionTypes.GIFT,
          note: note || null,
        },
      });
      return wallet.balanceCents;
    });
    bustWallet();
    return { ok: true, balanceCents: result };
  } catch (error) {
    if (error instanceof Error && error.message === "WALLET_BALANCE_LIMIT") {
      log.warn("giftWallet rejected", { code: "WALLET_BALANCE_LIMIT", userId, amountCents });
      return {
        ok: false,
        fieldErrors: {
          amountCents: [
            "This credit would exceed the supported wallet balance. Enter a smaller amount",
          ],
        },
      };
    }
    log.error("giftWallet failed", { error, userId, amountCents });
    return { ok: false, error: "Could not gift wallet credit" };
  }
}

const deductSchema = z.object({
  userId: recordId,
  amountCents: moneyAmount.refine(
    (value) => value >= 1 && value <= 10_000_000,
    "Enter an amount between 1 and 10000000 minor units",
  ),
  note: z.string().trim().max(500, "Use at most 500 characters").optional(),
});

export async function deductWallet(
  _prev: WalletActionResult | null,
  formData: FormData,
): Promise<WalletActionResult> {
  await requireAdmin();
  const parsed = deductSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { ok: false, ...validationFailure(parsed.error) };
  }
  const { userId, amountCents, note } = parsed.data;

  try {
    const result = await db.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({ where: { userId } });
      if (!wallet) throw new Error("NO_WALLET");
      if (wallet.balanceCents < amountCents) throw new Error("INSUFFICIENT");
      const debited = await tx.wallet.updateMany({
        where: { userId, balanceCents: { gte: amountCents } },
        data: { balanceCents: { decrement: amountCents } },
      });
      if (!debited.count) throw new Error("INSUFFICIENT");
      const updated = await tx.wallet.findUniqueOrThrow({ where: { userId } });
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          amountCents: -amountCents,
          balanceAfterCents: updated.balanceCents,
          type: WalletTransactionTypes.ADJUSTMENT,
          note: note || null,
        },
      });
      return updated.balanceCents;
    });
    bustWallet();
    return { ok: true, balanceCents: result };
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "NO_WALLET" || msg === "INSUFFICIENT") {
      log.warn("deductWallet rejected", { code: msg, userId, amountCents });
      return {
        ok: false,
        error: msg === "NO_WALLET" ? "This customer has no wallet" : "Insufficient wallet balance",
      };
    }
    log.error("deductWallet failed", { error: e, userId, amountCents });
    return { ok: false, error: "Could not deduct wallet credit" };
  }
}
