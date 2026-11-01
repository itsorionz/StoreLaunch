"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { saveCampaignOffers, deleteCampaignOffer } from "@backend/actions/campaigns";
import type { AdminActionResult } from "@backend/actions/admin";
import { CampaignDiscountModes } from "@backend/lib/campaign-constants";
import {
  ValidatedForm,
  ValidationInput,
  ValidationSelect,
  FieldError,
  ActionResultToast,
} from "../ui/validated-form";
import { useToast } from "../ui/toast";
import { formatPrice } from "@backend/lib/money";

type Product = { id: string; name: string; priceCents: number; active: boolean };

function useSaved(state: AdminActionResult | null) {
  const router = useRouter();
  const toast = useToast();
  useEffect(() => {
    if (state?.ok) {
      toast("Campaign products saved");
      router.refresh();
    }
  }, [state, router, toast]);
}

function ErrorMessage({ state }: { state: AdminActionResult | null }) {
  return state?.error && !state.fieldErrors ? (
    <p role="alert" className="text-sm text-accent">
      {state.error}
    </p>
  ) : null;
}

export function AddCampaignProducts({
  campaignId,
  products,
  currencySymbol,
}: {
  campaignId: string;
  products: Product[];
  currencySymbol: string;
}) {
  const [state, action, pending] = useActionState<AdminActionResult | null, FormData>(
    saveCampaignOffers,
    null,
  );
  useSaved(state);
  const [selected, setSelected] = useState<string[]>([]);
  return (
    <ValidatedForm
      onReset={(event) => event.preventDefault()}
      action={action}
      errors={state?.fieldErrors}
      result={state}
      successToast={false}
      noValidate
      className="space-y-4"
    >
      <input type="hidden" name="campaignId" value={campaignId} />
      <ErrorMessage state={state} />
      <FieldError name="campaignId" />
      <div className="max-h-72 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
        {products.length ? (
          products.map((product) => (
            <label
              key={product.id}
              className="flex items-center gap-3 rounded p-2 text-sm hover:bg-surface-2"
            >
              <input
                type="checkbox"
                name="productIds"
                value={product.id}
                checked={selected.includes(product.id)}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setSelected((previous) =>
                    checked
                      ? [...previous, product.id]
                      : previous.filter((id) => id !== product.id),
                  );
                }}
                disabled={pending}
                className="h-4 w-4 accent-[var(--primary)]"
              />
              <span className="min-w-0 flex-1">
                {product.name}
                {!product.active && <span className="ml-2 text-xs text-muted">Inactive</span>}
              </span>
              <span className="shrink-0">{formatPrice(product.priceCents, currencySymbol)}</span>
            </label>
          ))
        ) : (
          <p className="p-2 text-sm text-muted">No matching products. Try another search.</p>
        )}
      </div>
      <FieldError name="productIds" />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium">
          Discount method
          <ValidationSelect
            name="mode"
            className="input mt-1"
            defaultValue={CampaignDiscountModes.Percentage}
          >
            <option value={CampaignDiscountModes.Percentage}>Percentage off regular price</option>
            <option value={CampaignDiscountModes.Price}>
              Fixed offer price ({currencySymbol})
            </option>
          </ValidationSelect>
        </label>
        <label className="text-sm font-medium">
          Percentage or offer price
          <ValidationInput
            name="amount"
            type="number"
            step="0.01"
            min="0.01"
            placeholder="e.g. 15 for 15% off"
            className="input mt-1"
            required
          />
        </label>
      </div>
      <p className="text-xs text-muted">
        Applies to checked products only. Selecting an existing campaign product updates its offer.
        Percentage discounts are calculated from the current regular price when saved.
      </p>
      <button type="submit" disabled={pending || !products.length} className="btn-primary">
        {pending ? "Saving..." : "Apply to selected products"}
      </button>
    </ValidatedForm>
  );
}

export function CampaignProductPrice({
  campaignId,
  productId,
  priceCents,
  currencySymbol,
}: {
  campaignId: string;
  productId: string;
  priceCents: number;
  currencySymbol: string;
}) {
  const [state, action, pending] = useActionState<AdminActionResult | null, FormData>(
    saveCampaignOffers,
    null,
  );
  const [removeState, removeAction, removing] = useActionState<AdminActionResult | null, FormData>(
    deleteCampaignOffer,
    null,
  );
  useSaved(state);
  useSaved(removeState);
  return (
    <div className="space-y-2">
      <ValidatedForm
        action={action}
        errors={state?.fieldErrors}
        result={state}
        successToast={false}
        noValidate
        className="flex flex-wrap items-start gap-2"
      >
        <input type="hidden" name="campaignId" value={campaignId} />
        <input type="hidden" name="productIds" value={productId} />
        <input type="hidden" name="mode" value={CampaignDiscountModes.Price} />
        <label className="text-xs text-muted">
          Offer price ({currencySymbol})
          <ValidationInput
            aria-label="Offer price"
            name="amount"
            type="number"
            step="0.01"
            min="0.01"
            defaultValue={(priceCents / 100).toFixed(2)}
            className="input mt-1 max-w-40"
            required
          />
        </label>
        <button type="submit" disabled={pending || removing} className="btn-outline btn-sm mt-5">
          {pending ? "Saving..." : "Save price"}
        </button>
        <ErrorMessage state={state} />
        <FieldError name="productIds" />
        <FieldError name="campaignId" />
      </ValidatedForm>
      <form action={removeAction}>
        <input type="hidden" name="campaignId" value={campaignId} />
        <input type="hidden" name="productId" value={productId} />
        <ActionResultToast result={removeState} successToast={false} />
        <button
          type="submit"
          disabled={pending || removing}
          className="text-xs font-medium text-accent underline"
        >
          {removing ? "Removing..." : "Remove from campaign"}
        </button>
        <ErrorMessage state={removeState} />
      </form>
    </div>
  );
}
