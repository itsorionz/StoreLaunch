"use client";

import { AddressTypes } from "@backend/lib/enums.mjs";
import { ValidatedForm, ValidationInput } from "@frontend/components/ui/validated-form";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  saveAddress,
  deleteAddress,
  setDefaultAddress,
  type AccountActionResult,
} from "@backend/actions/account";
import { useDict } from "@frontend/i18n/provider";
import { useToast } from "@frontend/components/ui/toast";

export type AddressItem = {
  id: string;
  name: string;
  phone: string;
  type: typeof AddressTypes.HOME | typeof AddressTypes.OFFICE | typeof AddressTypes.OTHER;
  line1: string;
  line2: string | null;
  city: string;
  region: string | null;
  postal: string | null;
  isDefault: boolean;
};

export function AddressManager({ addresses }: { addresses: AddressItem[] }) {
  const dict = useDict();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [addrType, setAddrType] = useState<
    typeof AddressTypes.HOME | typeof AddressTypes.OFFICE | typeof AddressTypes.OTHER
  >(AddressTypes.HOME);

  const [state, action, pending] = useActionState<AccountActionResult | null, FormData>(
    saveAddress,
    null,
  );
  const previousSave = useRef<AccountActionResult | null>(null);

  const savedRef = useRef(() => {
    setAdding(false);
    setEditingId(null);
  });
  useEffect(() => {
    if (state?.ok && state !== previousSave.current) {
      previousSave.current = state;
      toast(editingId ? "Address updated successfully." : "Address added successfully.");
      savedRef.current();
    }
  }, [state, editingId, toast]);

  const formOpen = adding || editingId !== null;
  const editing = addresses.find((a) => a.id === editingId) ?? null;

  async function onDelete(id: string) {
    setDeleting(id);
    try {
      const result = await deleteAddress(id);
      setActionError(result.error ?? null);
      if (result.ok) {
        setConfirmId(null);
        toast("Address deleted.");
      } else toast(result.error ?? "Could not delete address.", "error");
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{dict.account.menuAddresses}</h1>
        {!formOpen && (
          <button
            type="button"
            onClick={() => {
              setAddrType(AddressTypes.HOME);
              setAdding(true);
            }}
            className="btn-primary"
          >
            + {dict.account.addAddress}
          </button>
        )}
      </div>

      {actionError && (
        <p role="alert" className="text-sm text-accent">
          {actionError}
        </p>
      )}
      {formOpen && (
        <ValidatedForm
          errors={state?.fieldErrors}
          result={state}
          successToast={false}
          noValidate
          action={action}
          className="card space-y-4 p-5"
        >
          <p className="font-bold">
            {editing ? dict.account.editAddress : dict.account.addAddress}
          </p>
          {state && !state.ok && state.error && !state.fieldErrors && (
            <p
              role="alert"
              className="rounded-lg bg-accent/10 px-3 py-2 text-sm font-medium text-accent"
            >
              {state.error}
            </p>
          )}
          {editingId && <ValidationInput type="hidden" name="id" value={editingId} />}

          <fieldset>
            <legend className="mb-1.5 block text-sm font-medium">
              {dict.account.menuAddresses}
            </legend>
            <div className="flex flex-wrap gap-2">
              {([AddressTypes.HOME, AddressTypes.OFFICE, AddressTypes.OTHER] as const).map((t) => (
                <label
                  key={t}
                  className={`cursor-pointer rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors ${
                    addrType === t
                      ? "border-primary bg-primary-light text-primary"
                      : "border-border bg-surface hover:border-primary/40"
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
                  {t === AddressTypes.HOME
                    ? dict.account.typeHome
                    : t === AddressTypes.OFFICE
                      ? dict.account.typeOffice
                      : dict.account.typeOther}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">{dict.account.fullName}</span>
              <ValidationInput
                type="text"
                name="name"
                defaultValue={editing?.name ?? ""}
                required
                minLength={2}
                className="input"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">{dict.account.mobileNo}</span>
              <ValidationInput
                type="tel"
                name="phone"
                defaultValue={editing?.phone ?? ""}
                required
                className="input"
                placeholder="+8801XXXXXXXXX"
              />
            </label>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">{dict.account.addressLine1}</span>
            <ValidationInput
              type="text"
              name="line1"
              defaultValue={editing?.line1 ?? ""}
              required
              minLength={3}
              className="input"
              placeholder="House, road, area"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">{dict.account.addressLine2}</span>
            <ValidationInput
              type="text"
              name="line2"
              defaultValue={editing?.line2 ?? ""}
              className="input"
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">{dict.account.city}</span>
              <ValidationInput
                type="text"
                name="city"
                defaultValue={editing?.city ?? ""}
                required
                className="input"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">{dict.account.region}</span>
              <ValidationInput
                type="text"
                name="region"
                defaultValue={editing?.region ?? ""}
                className="input"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">{dict.account.postal}</span>
              <ValidationInput
                type="text"
                name="postal"
                defaultValue={editing?.postal ?? ""}
                className="input"
              />
            </label>
          </div>

          <label className="flex items-center gap-2 text-sm font-medium">
            <ValidationInput
              type="checkbox"
              name="isDefault"
              defaultChecked={editing?.isDefault ?? false}
              className="h-4 w-4 rounded border-border accent-[var(--color-primary,#16a34a)]"
            />
            {dict.account.setDefault}
          </label>

          <div className="flex gap-3">
            <button type="submit" disabled={pending} className="btn-primary">
              {pending ? "…" : dict.account.saveAddress}
            </button>
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setEditingId(null);
              }}
              className="btn-outline"
            >
              {dict.common.cancel ?? "Cancel"}
            </button>
          </div>
        </ValidatedForm>
      )}

      {addresses.length === 0 && !formOpen && (
        <div className="card p-10 text-center text-muted">{dict.account.noAddresses}</div>
      )}

      <ul className="grid gap-3 sm:grid-cols-2">
        {addresses.map((a) => (
          <li key={a.id} className="card p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  {a.name}
                  <span className="badge badge-muted ml-2 align-middle">
                    {a.type === AddressTypes.HOME
                      ? dict.account.typeHome
                      : a.type === AddressTypes.OFFICE
                        ? dict.account.typeOffice
                        : dict.account.typeOther}
                  </span>
                  {a.isDefault && (
                    <span className="badge badge-primary ml-2 align-middle">
                      {dict.account.defaultTag}
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-xs text-muted">{a.phone}</p>
              </div>
            </div>
            <p className="mt-2 text-sm text-muted">
              {[a.line1, a.line2, a.city, a.region, a.postal].filter(Boolean).join(", ")}
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              {!a.isDefault && (
                <button
                  type="button"
                  onClick={async () => {
                    const result = await setDefaultAddress(a.id);
                    setActionError(result.error ?? null);
                    if (result.ok) toast("Default address updated.");
                    else toast(result.error ?? "Could not update default address.", "error");
                  }}
                  className="text-primary hover:underline"
                >
                  {dict.account.setDefault}
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setAdding(false);
                  setAddrType(a.type);
                  setEditingId(a.id);
                }}
                className="btn-outline btn-sm"
              >
                {dict.common.edit ?? "Edit"}
              </button>
              {confirmId === a.id ? (
                <span className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={deleting === a.id}
                    onClick={() => onDelete(a.id)}
                    className="btn-sm rounded-lg bg-accent px-2.5 py-1 font-semibold text-white"
                  >
                    {deleting === a.id ? "…" : "✓"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmId(null)}
                    className="btn-sm text-muted hover:text-foreground"
                  >
                    {dict.common.cancel ?? "Cancel"}
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmId(a.id)}
                  className="btn-sm rounded-lg px-2.5 py-1 font-semibold text-accent hover:bg-accent/10"
                >
                  {dict.common.delete ?? "Delete"}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
