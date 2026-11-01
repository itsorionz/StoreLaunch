"use client";

import { useActionState, useState } from "react";
import { giftWallet, deductWallet, type WalletActionResult } from "@backend/actions/wallet";
import { ActionResultToast } from "@frontend/components/ui/validated-form";

export function WalletActions({ userId, symbol = "৳" }: { userId: string; symbol?: string }) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [giftState, giftAction, giftPending] = useActionState<WalletActionResult | null, FormData>(
    giftWallet,
    null,
  );
  const [deductState, deductAction, deductPending] = useActionState<
    WalletActionResult | null,
    FormData
  >(deductWallet, null);

  const busy = giftPending || deductPending;
  const fieldErrors = giftState?.fieldErrors ?? deductState?.fieldErrors;
  const error =
    giftState && !giftState.ok
      ? giftState.error
      : deductState && !deductState.ok
        ? deductState.error
        : null;
  const ok = giftState?.ok ? giftState : deductState?.ok ? deductState : null;
  const amountCents = Math.round((Number(amount) || 0) * 100);

  return (
    <div className="flex flex-wrap items-end gap-3">
      <ActionResultToast result={giftState} successMessage="Wallet credit added." />
      <ActionResultToast result={deductState} successMessage="Wallet deduction recorded." />
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted">
          Amount ({symbol})
          <input
            type="number"
            min="1"
            step="1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="e.g. 100"
            className="input mt-1 w-32"
          />
          {amount !== "" &&
            (!Number.isFinite(Number(amount)) ||
              Number(amount) <= 0 ||
              Number(amount) > 100000) && (
              <span role="alert" className="mt-1 block text-xs text-accent">
                Enter an amount greater than zero and at most 100000.
              </span>
            )}
          {fieldErrors?.amountCents?.[0] && (
            <span role="alert" className="mt-1 block text-xs text-accent">
              {fieldErrors.amountCents[0].replace(/^[^:]+:\s*/, "")}
            </span>
          )}
        </label>
        <label className="text-xs font-medium text-muted">
          Note (optional)
          <input
            type="text"
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Loyalty bonus"
            className="input mt-1 w-56"
          />
          {fieldErrors?.note?.[0] && (
            <span role="alert" className="mt-1 block text-xs text-accent">
              {fieldErrors.note[0].replace(/^[^:]+:\s*/, "")}
            </span>
          )}
        </label>
      </div>

      <form noValidate action={giftAction} className="flex flex-col gap-1">
        <input type="hidden" name="userId" value={userId} />
        <input type="hidden" name="amountCents" value={amountCents} />
        <input type="hidden" name="note" value={note} />
        <button
          type="submit"
          disabled={busy || amountCents <= 0}
          className="btn-primary h-9 px-4 text-sm disabled:opacity-50"
        >
          {giftPending ? "…" : "Gift"}
        </button>
      </form>

      <form noValidate action={deductAction} className="flex flex-col gap-1">
        <input type="hidden" name="userId" value={userId} />
        <input type="hidden" name="amountCents" value={amountCents} />
        <input type="hidden" name="note" value={note} />
        <button
          type="submit"
          disabled={busy || amountCents <= 0}
          className="h-9 rounded-lg border border-border px-4 text-sm font-semibold text-accent transition-colors hover:bg-accent/10 disabled:opacity-50"
        >
          {deductPending ? "…" : "Deduct"}
        </button>
      </form>

      {error && !fieldErrors && (
        <p role="alert" className="w-full text-xs font-medium text-accent">
          {error}
        </p>
      )}
      {ok && (
        <p className="w-full text-xs font-medium text-primary">
          ✓ New balance: {symbol}
          {((ok.balanceCents ?? 0) / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}
        </p>
      )}
    </div>
  );
}
