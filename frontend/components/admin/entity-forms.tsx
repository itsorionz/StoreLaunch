"use client";

import {
  ValidatedForm,
  ValidationInput,
  ValidationSelect,
} from "@frontend/components/ui/validated-form";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@frontend/components/ui/toast";
import {
  saveCategory,
  saveBrand,
  saveCampaign,
  saveRider,
  saveDeliveryCompany,
  type AdminActionResult,
} from "@backend/actions/admin";

type ParentOption = { id: string; name: string; nameBn?: string | null; parentId: string | null };

function useSavedRefresh(
  state: AdminActionResult | null,
  successMessage: string,
  onSaved?: () => void,
) {
  const router = useRouter();
  const toast = useToast();
  const onSavedRef = useRef(onSaved);
  useEffect(() => {
    onSavedRef.current = onSaved;
  });
  useEffect(() => {
    if (state?.ok) {
      toast(successMessage);
      router.refresh();
      onSavedRef.current?.();
    }
  }, [state, router, successMessage, toast]);
}

export function CategoryForm({
  category,
  parentOptions = [],
  onSaved,
}: {
  category?: {
    id: string;
    name: string;
    nameBn?: string | null;
    slug: string;
    imageUrl: string | null;
    order: number;
    parentId: string | null;
  };
  parentOptions?: ParentOption[];
  onSaved?: () => void;
}) {
  const [state, action, pending] = useActionState<AdminActionResult | null, FormData>(
    saveCategory,
    null,
  );
  useSavedRefresh(
    state,
    category ? "Category updated successfully." : "Category added successfully.",
    onSaved,
  );
  const eligibleParents = parentOptions.filter((p) => p.id !== category?.id && p.parentId === null);
  return (
    <ValidatedForm
      errors={state?.fieldErrors}
      result={state}
      successToast={false}
      noValidate
      action={action}
      className="space-y-4"
    >
      {state?.error && !state.fieldErrors && (
        <p
          role="alert"
          className="rounded-lg bg-accent/10 px-3 py-2 text-sm font-medium text-accent"
        >
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p className="rounded-lg bg-primary-light px-3 py-2 text-sm font-medium text-primary">
          Saved.
        </p>
      )}
      {category?.id && <ValidationInput type="hidden" name="id" value={category.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <FInput label="Name" name="name" defaultValue={category?.name} required />
        <FInput
          label="Name in Bangla (বাংলা)"
          name="nameBn"
          defaultValue={category?.nameBn ?? ""}
        />
        <FInput label="Slug" name="slug" defaultValue={category?.slug} required />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <FInput
          label="Image URL"
          name="imageUrl"
          defaultValue={category?.imageUrl ?? ""}
          placeholder="/categories/photo-spices.webp"
        />
        <FInput
          label="Order"
          name="order"
          type="number"
          defaultValue={String(category?.order ?? 0)}
        />
      </div>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">Parent category</span>
        <ValidationSelect name="parentId" defaultValue={category?.parentId ?? ""} className="input">
          <option value="">None (top-level)</option>
          {eligibleParents.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </ValidationSelect>
      </label>
      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "Saving…" : category ? "Update category" : "Add category"}
      </button>
    </ValidatedForm>
  );
}

export function BrandForm({
  brand,
  onSaved,
}: {
  brand?: {
    id: string;
    name: string;
    nameBn?: string | null;
    slug: string;
    imageUrl: string | null;
  };
  onSaved?: () => void;
}) {
  const [state, action, pending] = useActionState<AdminActionResult | null, FormData>(
    saveBrand,
    null,
  );
  useSavedRefresh(
    state,
    brand ? "Brand updated successfully." : "Brand added successfully.",
    onSaved,
  );
  return (
    <ValidatedForm
      errors={state?.fieldErrors}
      result={state}
      successToast={false}
      noValidate
      action={action}
      className="space-y-4"
    >
      {state?.error && !state.fieldErrors && (
        <p
          role="alert"
          className="rounded-lg bg-accent/10 px-3 py-2 text-sm font-medium text-accent"
        >
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p className="rounded-lg bg-primary-light px-3 py-2 text-sm font-medium text-primary">
          Saved.
        </p>
      )}
      {brand?.id && <ValidationInput type="hidden" name="id" value={brand.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <FInput label="Name" name="name" defaultValue={brand?.name} required />
        <FInput label="Name in Bangla (বাংলা)" name="nameBn" defaultValue={brand?.nameBn ?? ""} />
        <FInput label="Slug" name="slug" defaultValue={brand?.slug} required />
      </div>
      <FInput
        label="Image URL"
        name="imageUrl"
        defaultValue={brand?.imageUrl ?? ""}
        placeholder="/brands/acme.svg"
      />
      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "Saving…" : brand ? "Update brand" : "Add brand"}
      </button>
    </ValidatedForm>
  );
}

export function CampaignForm({
  campaign,
  onSaved,
}: {
  campaign?: {
    id: string;
    title: string;
    imageUrl: string;
    linkUrl: string;
    order: number;
    active: boolean;
    flashSale?: boolean;
    showOnHome?: boolean;
    showInCart?: boolean;
  };
  onSaved?: () => void;
}) {
  const [state, action, pending] = useActionState<AdminActionResult | null, FormData>(
    saveCampaign,
    null,
  );
  useSavedRefresh(
    state,
    campaign ? "Campaign updated successfully." : "Campaign added successfully.",
    onSaved,
  );
  return (
    <ValidatedForm
      errors={state?.fieldErrors}
      result={state}
      successToast={false}
      noValidate
      action={action}
      className="space-y-4"
    >
      {state?.error && !state.fieldErrors && (
        <p
          role="alert"
          className="rounded-lg bg-accent/10 px-3 py-2 text-sm font-medium text-accent"
        >
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p className="rounded-lg bg-primary-light px-3 py-2 text-sm font-medium text-primary">
          Saved.
        </p>
      )}
      {campaign?.id && <ValidationInput type="hidden" name="id" value={campaign.id} />}
      <FInput label="Title" name="title" defaultValue={campaign?.title} required />
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">
          Upload a real banner or product photo
        </span>
        <ValidationInput
          type="file"
          name="bannerFile"
          accept="image/jpeg,image/png,image/webp,image/avif"
          className="input block w-full file:mr-3 file:rounded-lg file:border-0 file:bg-primary-light file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary"
        />
        <span className="mt-1 block text-xs text-muted">
          JPEG, PNG, WebP or AVIF, up to 5 MB. Images are automatically cropped and resized to the
          homepage slider size (1600 × 500).
        </span>
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <FInput
          label="Or use an image URL"
          name="imageUrl"
          defaultValue={campaign?.imageUrl}
          placeholder="/uploads/banners/banner.webp"
        />
        <FInput
          label="Optional banner destination"
          name="linkUrl"
          defaultValue={campaign?.linkUrl}
          placeholder="Leave blank to show campaign products"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <FInput
          label="Order"
          name="order"
          type="number"
          defaultValue={String(campaign?.order ?? 0)}
        />
        <label className="flex items-end gap-2.5 pb-2.5 text-sm font-medium">
          <ValidationInput
            type="checkbox"
            name="active"
            value="true"
            defaultChecked={campaign?.active ?? true}
            className="h-4 w-4 accent-[var(--primary)]"
          />
          Active
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <ValidationInput
          type="checkbox"
          name="showOnHome"
          value="true"
          defaultChecked={campaign?.showOnHome ?? false}
        />
        Show as a product section on homepage
      </label>
      <label className="flex items-center gap-2 text-sm">
        <ValidationInput
          type="checkbox"
          name="flashSale"
          value="true"
          defaultChecked={campaign?.flashSale ?? false}
        />
        Include discounted products in Flash Sale
      </label>
      <label className="flex items-start gap-2 text-sm">
        <ValidationInput
          type="checkbox"
          name="showInCart"
          value="true"
          defaultChecked={campaign?.showInCart ?? false}
          className="mt-0.5 h-4 w-4 accent-[var(--primary)]"
        />
        <span>
          Feature this campaign in the cart
          <span className="mt-0.5 block text-xs text-muted">
            Show its discounted products in “You may also like”. If Flash Sale is enabled, show its
            banner there too. Only one active campaign can be featured at a time.
          </span>
        </span>
      </label>
      <p className="text-xs text-muted">
        The homepage carousel is managed under Marketing → Carousel; active campaign banners only
        appear there as a fallback. After saving, use Manage products to choose products and offer
        prices. Inactive campaigns do not apply discounts. Leave the destination blank to open the
        campaign collection.
      </p>
      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "Saving…" : campaign ? "Update campaign" : "Add campaign"}
      </button>
    </ValidatedForm>
  );
}

export function RiderForm({
  rider,
  onSaved,
}: {
  rider?: { id: string; name: string; phone: string; active: boolean; email?: string | null };
  onSaved?: () => void;
}) {
  const [state, action, pending] = useActionState<AdminActionResult | null, FormData>(
    saveRider,
    null,
  );
  useSavedRefresh(
    state,
    rider ? "Rider updated successfully." : "Rider added successfully.",
    onSaved,
  );
  const linked = Boolean(rider?.id && rider?.email);
  return (
    <ValidatedForm
      errors={state?.fieldErrors}
      result={state}
      successToast={false}
      noValidate
      action={action}
      className="space-y-4"
    >
      {state?.error && !state.fieldErrors && (
        <p
          role="alert"
          className="rounded-lg bg-accent/10 px-3 py-2 text-sm font-medium text-accent"
        >
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p className="rounded-lg bg-primary-light px-3 py-2 text-sm font-medium text-primary">
          Saved.
        </p>
      )}
      {rider?.id && <ValidationInput type="hidden" name="id" value={rider.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <FInput label="Name" name="name" defaultValue={rider?.name} required />
        <FInput
          label="Phone"
          name="phone"
          defaultValue={rider?.phone}
          placeholder="+8801XXXXXXXXX"
          required
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <FInput
          label={linked ? "Login email" : "Email (login)"}
          name="email"
          type="email"
          defaultValue={rider?.email ?? ""}
          placeholder="rider@store.local"
          required={false}
        />
        <FInput
          label={rider?.id ? "New password (leave blank to keep)" : "Password (new accounts only)"}
          name="password"
          type="password"
          placeholder={rider?.id ? "••••••••" : "min 8 characters"}
          required={false}
        />
      </div>
      <p className="text-xs text-muted">
        Use an existing email or phone to add delivery access to the same account. Its current
        password and other roles are kept.
      </p>
      <label className="flex items-center gap-2.5 text-sm font-medium">
        <ValidationInput
          type="checkbox"
          name="active"
          value="true"
          defaultChecked={rider?.active ?? true}
          className="h-4 w-4 accent-[var(--primary)]"
        />
        Active (available for assignment &amp; login)
      </label>
      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "Saving…" : rider ? "Update rider" : "Add rider"}
      </button>
    </ValidatedForm>
  );
}

function FInput({
  label,
  name,
  type = "text",
  defaultValue,
  placeholder,
  required,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      <ValidationInput
        type={type}
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        required={required}
        className="input"
      />
    </label>
  );
}

export function DeliveryCompanyForm({
  company,
  onSaved,
}: {
  company?: {
    id: string;
    name: string;
    phone: string | null;
    trackingUrl: string | null;
    volumeDiscountBps: number;
    volumeMinParcels: number;
    labelFormat: "A4" | "Thermal";
    active: boolean;
  };
  onSaved?: () => void;
}) {
  const [state, action, pending] = useActionState<AdminActionResult | null, FormData>(
    saveDeliveryCompany,
    null,
  );
  useSavedRefresh(
    state,
    company ? "Delivery company updated successfully." : "Delivery company added successfully.",
    onSaved,
  );
  return (
    <ValidatedForm
      errors={state?.fieldErrors}
      result={state}
      successToast={false}
      noValidate
      action={action}
      className="space-y-4"
    >
      {state?.error && !state.fieldErrors && (
        <p
          role="alert"
          className="rounded-lg bg-accent/10 px-3 py-2 text-sm font-medium text-accent"
        >
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p className="rounded-lg bg-primary-light px-3 py-2 text-sm font-medium text-primary">
          Saved.
        </p>
      )}
      {company?.id && <ValidationInput type="hidden" name="id" value={company.id} />}
      <FInput
        label="Company name"
        name="name"
        defaultValue={company?.name}
        placeholder="Steadfast"
        required
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <FInput
          label="Phone (optional)"
          name="phone"
          defaultValue={company?.phone ?? ""}
          placeholder="+8801XXXXXXXXX"
        />
        <FInput
          label="Tracking URL (optional)"
          name="trackingUrl"
          defaultValue={company?.trackingUrl ?? ""}
          placeholder="https://example.com/track"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <FInput
          label="Volume discount (bps)"
          name="volumeDiscountBps"
          type="number"
          defaultValue={String(company?.volumeDiscountBps ?? 0)}
          placeholder="0"
        />
        <FInput
          label="Discount needs parcels / 30 days"
          name="volumeMinParcels"
          type="number"
          defaultValue={String(company?.volumeMinParcels ?? 0)}
          placeholder="0"
        />
      </div>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">Shipping label format</span>
        <ValidationSelect
          name="labelFormat"
          defaultValue={company?.labelFormat ?? "A4"}
          className="input"
        >
          <option value="A4">Laser — A4 sheet</option>
          <option value="Thermal">Thermal — 4×6 in roll</option>
        </ValidationSelect>
      </label>
      <label className="flex items-center gap-2.5 text-sm font-medium">
        <ValidationInput
          type="checkbox"
          name="active"
          value="true"
          defaultChecked={company?.active ?? true}
          className="h-4 w-4 accent-[var(--primary)]"
        />
        Active (available for assignment)
      </label>
      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "Saving…" : company ? "Update company" : "Add company"}
      </button>
    </ValidatedForm>
  );
}
