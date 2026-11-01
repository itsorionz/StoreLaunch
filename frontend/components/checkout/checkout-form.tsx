"use client";

import type { UserAddress } from "@backend/lib/addresses";
import { PaymentMethods } from "@backend/lib/enums.mjs";
import {
  ValidatedForm,
  ValidationInput,
  ValidationTextarea,
} from "@frontend/components/ui/validated-form";

import { useActionState, useState } from "react";
import Link from "next/link";
import { placeOrder, type CheckoutState } from "@backend/actions/checkout";
import { useDict } from "@frontend/i18n/provider";

function fmt(cents: number, symbol: string) {
  return `${symbol}${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}

export function CheckoutForm({
  walletBalanceCents,
  address,
  userEmail,
  totalCents,
  currencySymbol = "৳",
}: {
  address?: UserAddress;
  userEmail?: string;
  walletBalanceCents: number;
  totalCents: number;
  currencySymbol?: string;
}) {
  const dict = useDict();
  const [state, action, pending] = useActionState<CheckoutState, FormData>(placeOrder, null);
  const [useWallet, setUseWallet] = useState(false);
  const [method, setMethod] = useState<typeof PaymentMethods.COD | typeof PaymentMethods.GATEWAY>(
    PaymentMethods.COD,
  );

  const walletUsed = useWallet ? Math.min(walletBalanceCents, totalCents) : 0;
  const remaining = totalCents - walletUsed;
  const coversAll = useWallet && walletBalanceCents >= totalCents;

  return (
    <ValidatedForm
      errors={state?.fieldErrors}
      result={state}
      noValidate
      action={action}
      className="card grid min-h-0 gap-5 p-4 lg:h-full lg:grid-cols-[minmax(0,1.5fr)_minmax(220px,1fr)]"
    >
      <section className="min-h-0 space-y-3 lg:overflow-y-auto lg:pr-1">
        <h2 className="text-base font-bold">{dict.checkout.deliveryAddress}</h2>
        {state?.error && !state.fieldErrors && (
          <p role="alert" className="rounded-lg bg-accent/10 px-3 py-2 text-sm text-accent">
            {state.error}
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label={dict.checkout.fullName}
            name="name"
            defaultValue={address?.name ?? ""}
            required
          />
          <Input
            label={dict.checkout.phone}
            name="phone"
            type="tel"
            defaultValue={address?.phone ?? ""}
            required
            placeholder="01XXXXXXXXX"
          />
        </div>
        <Input
          label={dict.checkout.addressLine}
          name="line1"
          defaultValue={address?.line1 ?? ""}
          required
          placeholder="House, road, area"
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label={dict.checkout.landmark} name="line2" defaultValue={address?.line2 ?? ""} />
          <Input
            label={dict.checkout.email}
            name="email"
            defaultValue={userEmail ?? ""}
            type="email"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Input
            label={dict.checkout.city}
            name="city"
            defaultValue={address?.city ?? ""}
            required
          />
          <Input label={dict.checkout.region} name="region" defaultValue={address?.region ?? ""} />
          <Input label={dict.checkout.postal} name="postal" defaultValue={address?.postal ?? ""} />
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-medium">{dict.checkout.additionalInfo}</span>
          <ValidationTextarea
            name="additionalInfo"
            rows={2}
            maxLength={1000}
            className="input !px-3 !py-2"
            placeholder={dict.checkout.additionalInfoPlaceholder}
          />
          <span className="mt-1 block text-[10px] leading-4 text-muted">
            {dict.checkout.additionalInfoHint}
          </span>
        </label>
      </section>
      <div className="flex min-h-0 flex-col gap-3 border-t border-border pt-4 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-4">
        {walletBalanceCents > 0 && (
          <div className="rounded-lg border border-border bg-surface-2 p-3">
            <label className="flex cursor-pointer items-start gap-2">
              <ValidationInput
                type="checkbox"
                checked={useWallet}
                onChange={(event) => setUseWallet(event.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--primary)]"
              />
              <span>
                <span className="block text-xs font-semibold">
                  {dict.checkout.walletTitle} - {fmt(walletBalanceCents, currencySymbol)}
                </span>
                <span className="mt-1 block text-[10px] leading-4 text-muted">
                  {coversAll
                    ? dict.checkout.walletFull
                    : useWallet
                      ? dict.checkout.walletUseHint.replace(
                          "{amount}",
                          fmt(walletUsed, currencySymbol),
                        )
                      : `${dict.checkout.walletBalance}: ${fmt(walletBalanceCents, currencySymbol)}`}
                </span>
              </span>
            </label>
          </div>
        )}
        {useWallet && <ValidationInput type="hidden" name="walletCents" value={walletUsed} />}
        {coversAll ? (
          <p className="rounded-lg bg-primary-light px-3 py-2 text-xs font-medium text-primary">
            {dict.checkout.walletPaidFull}
          </p>
        ) : (
          <fieldset className="space-y-2">
            <legend className="mb-2 text-base font-bold">{dict.checkout.paymentSection}</legend>
            <PaymentRadio
              id="method-cod"
              checked={method === PaymentMethods.COD}
              onChange={() => setMethod(PaymentMethods.COD)}
              title={dict.checkout.payCod}
              hint={dict.checkout.payCodHint.replace("{amount}", fmt(remaining, currencySymbol))}
              name="paymentMethod"
              value={PaymentMethods.COD}
            />
            <PaymentRadio
              id="method-gateway"
              checked={method === PaymentMethods.GATEWAY}
              onChange={() => setMethod(PaymentMethods.GATEWAY)}
              title={dict.checkout.payOnline}
              hint={dict.checkout.payOnlineHint.replace("{amount}", fmt(remaining, currencySymbol))}
              name="paymentMethod"
              value={PaymentMethods.GATEWAY}
            />
          </fieldset>
        )}
        <div className="mt-auto border-t border-border pt-3">
          <button
            type="submit"
            data-checkout-submit
            disabled={pending}
            className="btn-primary w-full"
          >
            {pending
              ? coversAll || method === PaymentMethods.COD
                ? dict.checkout.placeOrder
                : dict.checkout.redirecting
              : dict.checkout.placeOrder}
          </button>
          <p className="mt-2 text-[10px] leading-4 text-muted">
            {dict.checkout.termsBefore}{" "}
            <Link
              href="/terms"
              className="underline underline-offset-2 transition-colors hover:text-primary"
            >
              {dict.checkout.termsLink}
            </Link>
            {dict.checkout.termsAfter}
          </p>
        </div>
      </div>
    </ValidatedForm>
  );
}

function PaymentRadio({
  id,
  checked,
  onChange,
  title,
  hint,
  name,
  value,
}: {
  id: string;
  checked: boolean;
  onChange: () => void;
  title: string;
  hint: string;
  name: string;
  value: string;
}) {
  return (
    <label
      htmlFor={id}
      className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 transition-colors ${
        checked ? "border-primary bg-primary-light" : "border-border hover:border-primary/40"
      }`}
    >
      <ValidationInput
        id={id}
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        className="mt-1 h-4 w-4 accent-[var(--primary-brand)]"
      />
      <span>
        <span className="block text-xs font-semibold">{title}</span>
        <span className="mt-1 block text-[10px] leading-4 text-muted">{hint}</span>
      </span>
    </label>
  );
}

function Input({
  label,
  name,
  type = "text",
  required,
  placeholder,
  defaultValue,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  defaultValue?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-foreground">{label}</span>
      <ValidationInput
        defaultValue={defaultValue}
        type={type}
        name={name}
        required={required}
        placeholder={placeholder}
        className="input !px-3 !py-2"
      />
    </label>
  );
}
