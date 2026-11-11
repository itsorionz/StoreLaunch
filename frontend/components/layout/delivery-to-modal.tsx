"use client";

import { AddressTypes } from "@backend/lib/enums.mjs";
import { ValidatedForm, ValidationInput } from "@frontend/components/ui/validated-form";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import {
  saveAddress,
  selectDeliveryAddress,
  type AccountActionResult,
} from "@backend/actions/account";
import { Modal } from "@frontend/components/ui/modal";
import { useToast } from "@frontend/components/ui/toast";
import { useDict } from "@frontend/i18n/provider";

type Addr = {
  id: string;
  type: typeof AddressTypes.HOME | typeof AddressTypes.OFFICE | typeof AddressTypes.OTHER;
  line1: string;
  line2: string | null;
  city: string;
  isDefault: boolean;
};

export function DeliveryToTrigger({
  addresses,
  selectedId,
  buttonLabel,
  signedIn,
}: {
  addresses: Addr[];
  selectedId: string | null;
  buttonLabel: string;
  signedIn: boolean;
}) {
  const dict = useDict();
  const toast = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [chooseError, setChooseError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addrType, setAddrType] = useState<
    typeof AddressTypes.HOME | typeof AddressTypes.OFFICE | typeof AddressTypes.OTHER
  >(AddressTypes.HOME);
  const [, startTransition] = useTransition();

  const [saveState, saveAction, savePending] = useActionState<AccountActionResult | null, FormData>(
    saveAddress,
    null,
  );

  const resetAddRef = useRef(() => setShowAdd(false));
  useEffect(() => {
    if (saveState?.ok) {
      resetAddRef.current();
      router.refresh();
    }
  }, [saveState, router]);

  function choose(id: string | null) {
    startTransition(async () => {
      const result = await selectDeliveryAddress(id);
      const message = result.error ?? null;
      setChooseError(message);
      if (!result.ok) {
        toast(message ?? "Could not update delivery address.", "error");
        return;
      }
      toast("Delivery address updated.");
      setOpen(false);
    });
  }

  const typeLabel = (t: Addr["type"]) =>
    t === AddressTypes.HOME
      ? dict.account.typeHome
      : t === AddressTypes.OFFICE
        ? dict.account.typeOffice
        : dict.account.typeOther;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 text-left"
        aria-label={dict.header.deliveryTo}
      >
        <LocationIcon />
        <span className="text-left leading-tight">
          <span className="block text-[11px] text-muted">{dict.header.deliveryTo}</span>
          <span className="flex items-center gap-1 text-sm font-semibold text-foreground">
            <span className="line-clamp-1 max-w-40">{buttonLabel}</span>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
              className="shrink-0 opacity-60"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </span>
        </span>
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title={dict.header.chooseAddress}>
        <div className="space-y-4">
          {chooseError && (
            <p role="alert" className="text-sm text-accent">
              {chooseError}
            </p>
          )}
          <ul className="space-y-2">
            <li>
              <button
                type="button"
                onClick={() => choose(null)}
                className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm font-medium transition-colors ${
                  selectedId === null
                    ? "border-primary bg-primary-light text-primary"
                    : "border-border bg-surface hover:border-primary/40"
                }`}
              >
                <span className="flex-1">{dict.header.deliverNationwide}</span>
                {selectedId === null && <Check />}
              </button>
            </li>
            {addresses.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => choose(a.id)}
                  className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
                    selectedId === a.id
                      ? "border-primary bg-primary-light"
                      : "border-border bg-surface hover:border-primary/40"
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-sm font-semibold">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${selectedId === a.id ? "bg-primary text-white" : "bg-surface-2 text-muted"}`}
                      >
                        {typeLabel(a.type)}
                      </span>
                      <span className="truncate">
                        {[a.line1, a.line2].filter(Boolean).join(", ")}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted">{a.city}</span>
                  </span>
                  {selectedId === a.id && <Check />}
                </button>
              </li>
            ))}
          </ul>

          {!signedIn && (
            <p className="rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm text-muted">
              {dict.header.signInAddresses}{" "}
              <Link
                href="/login?callbackUrl=/"
                className="font-semibold text-primary hover:underline"
              >
                {dict.auth.signIn}
              </Link>
            </p>
          )}

          {signedIn && !showAdd && (
            <button
              type="button"
              onClick={() => {
                setAddrType(AddressTypes.HOME);
                setShowAdd(true);
              }}
              className="btn-outline w-full"
            >
              + {dict.account.addAddress}
            </button>
          )}

          {signedIn && showAdd && (
            <ValidatedForm
              errors={saveState?.fieldErrors}
              result={saveState}
              successMessage="Address saved."
              noValidate
              action={saveAction}
              className="space-y-3 rounded-xl border border-border p-4"
            >
              <p className="text-sm font-bold">{dict.account.addAddress}</p>
              {saveState && !saveState.ok && saveState.error && !saveState.fieldErrors && (
                <p
                  role="alert"
                  className="rounded-lg bg-accent/10 px-3 py-2 text-xs font-medium text-accent"
                >
                  {saveState.error}
                </p>
              )}

              <fieldset>
                <legend className="mb-1 text-xs font-medium text-muted">
                  {dict.account.menuAddresses}
                </legend>
                <div className="flex flex-wrap gap-2">
                  {([AddressTypes.HOME, AddressTypes.OFFICE, AddressTypes.OTHER] as const).map(
                    (t) => (
                      <label
                        key={t}
                        className={`cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                          addrType === t
                            ? "border-primary bg-primary-light text-primary"
                            : "border-border bg-surface"
                        }`}
                      >
                        <ValidationInput
                          type="radio"
                          name="type"
                          value={t}
                          checked={addrType === t}
                          onChange={() => setAddrType(t)}
                          className="sr-only"
                        />
                        {typeLabel(t)}
                      </label>
                    ),
                  )}
                </div>
              </fieldset>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-muted">
                    {dict.account.fullName}
                  </span>
                  <ValidationInput
                    type="text"
                    name="name"
                    required
                    minLength={2}
                    className="input py-2 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-muted">
                    {dict.account.mobileNo}
                  </span>
                  <ValidationInput
                    type="tel"
                    name="phone"
                    required
                    className="input py-2 text-sm"
                    placeholder="+8801XXXXXXXXX"
                  />
                </label>
              </div>

              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted">
                  {dict.account.addressLine1}
                </span>
                <ValidationInput
                  type="text"
                  name="line1"
                  required
                  minLength={3}
                  className="input py-2 text-sm"
                  placeholder="House, road, area"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted">
                  {dict.account.city}
                </span>
                <ValidationInput type="text" name="city" required className="input py-2 text-sm" />
              </label>

              <div className="flex gap-2">
                <button type="submit" disabled={savePending} className="btn-primary btn-sm flex-1">
                  {savePending ? "…" : dict.account.saveAddress}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAdd(false)}
                  className="btn-outline btn-sm"
                >
                  {dict.common.cancel}
                </button>
              </div>
            </ValidatedForm>
          )}
        </div>
      </Modal>
    </>
  );
}

function Check() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="shrink-0 text-primary"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function LocationIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="shrink-0 text-foreground"
    >
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}
