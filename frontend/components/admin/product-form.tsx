"use client";

import Image from "next/image";
import {
  ValidatedForm,
  ValidationInput,
  ValidationSelect,
  ValidationTextarea,
} from "@frontend/components/ui/validated-form";

import { useActionState, useEffect, useRef, useState } from "react";
import { saveProduct, type AdminActionResult } from "@backend/actions/admin";
import { useToast } from "@frontend/components/ui/toast";

export type ProductFormValues = {
  id?: string;
  name: string;
  nameBn?: string | null;
  slug: string;
  sku?: string | null;
  barcode?: string | null;
  description: string;
  descriptionBn?: string | null;
  priceCents: number;
  salePriceCents: number | null;
  costCents?: number | null;
  stock: number;
  weightGrams?: number | null;
  lengthMm?: number | null;
  widthMm?: number | null;
  heightMm?: number | null;
  categoryId: string;
  brandId: string | null;
  flashSale: boolean;
  featured: boolean;
  active: boolean;
  images: string[];
};

export function ProductForm({
  product,
  categories,
  brands,
  onSaved,
  className = "space-y-5 rounded-2xl border border-border bg-surface p-6",
}: {
  product?: ProductFormValues;
  categories: { id: string; name: string; nameBn?: string | null; parentId: string | null }[];
  brands: { id: string; name: string; nameBn?: string | null }[];
  onSaved?: () => void;
  className?: string;
}) {
  const [state, action, pending] = useActionState<AdminActionResult | null, FormData>(
    saveProduct,
    null,
  );
  const [price, setPrice] = useState(product?.priceCents ?? 0);
  const [salePrice, setSalePrice] = useState(product?.salePriceCents ?? 0);
  const [cost, setCost] = useState<number | null>(product?.costCents ?? null);
  const toast = useToast();
  const successMessage = product ? "Product updated successfully." : "Product added successfully.";

  const onSavedRef = useRef(onSaved);
  useEffect(() => {
    onSavedRef.current = onSaved;
  });
  useEffect(() => {
    if (state?.ok) {
      toast(successMessage);
      onSavedRef.current?.();
    }
  }, [state, successMessage, toast]);

  const off =
    price > 0 && salePrice > 0 && salePrice < price
      ? Math.round(((price - salePrice) / price) * 100)
      : null;

  return (
    <ValidatedForm
      errors={state?.fieldErrors}
      result={state}
      successToast={false}
      noValidate
      action={action}
      className={className}
    >
      {state?.error && !state.fieldErrors && (
        <p role="alert" className="rounded-lg bg-accent/10 px-3 py-2 text-sm text-accent">
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p className="rounded-lg bg-primary-light px-3 py-2 text-sm text-primary">Saved.</p>
      )}

      {product?.id && <ValidationInput type="hidden" name="id" value={product.id} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Name" name="name" defaultValue={product?.name} required />
        <Input label="Name in Bangla (বাংলা)" name="nameBn" defaultValue={product?.nameBn ?? ""} />
        <Input
          label="Slug"
          name="slug"
          defaultValue={product?.slug}
          placeholder="my-product-name"
          required
        />
        <Input
          label="SKU"
          name="sku"
          defaultValue={product?.sku ?? ""}
          placeholder="Leave blank to use the slug"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Description</span>
          <ValidationTextarea
            name="description"
            rows={4}
            defaultValue={product?.description}
            className="input min-h-24 resize-y"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Description in Bangla (বাংলা)</span>
          <ValidationTextarea
            name="descriptionBn"
            rows={4}
            defaultValue={product?.descriptionBn ?? ""}
            className="input min-h-24 resize-y"
          />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Input
          label="Price (৳)"
          name="price"
          type="number"
          defaultValue={product ? String(product.priceCents / 100) : undefined}
          onChange={(e) => setPrice(Math.round(Number(e.target.value) * 100))}
          required
        />
        <Input
          label="Sale price (৳)"
          name="salePrice"
          type="number"
          defaultValue={
            product?.salePriceCents != null ? String(product.salePriceCents / 100) : undefined
          }
          onChange={(e) => setSalePrice(Math.round(Number(e.target.value) * 100))}
        />
        {product?.id ? (
          <div>
            <span className="mb-1 block text-sm font-medium">Available stock</span>
            <p className="input">{product.stock}</p>
            <a
              className="mt-1 block text-xs text-primary"
              href={`/admin/products/${product.id}#inventory`}
            >
              Adjust stock with an audit reason
            </a>
          </div>
        ) : (
          <Input label="Initial stock" name="stock" type="number" defaultValue="0" required />
        )}
      </div>
      <ValidationInput type="hidden" name="priceCents" value={price} />
      <ValidationInput type="hidden" name="salePriceCents" value={salePrice || ""} />
      <ValidationInput type="hidden" name="costCents" value={cost == null ? "" : String(cost)} />
      {off && (
        <p className="inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">
          −{off}% discount — customers pay ৳{(salePrice / 100).toLocaleString()}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Input
          label="Cost price (৳)"
          name="cost"
          type="number"
          defaultValue={product?.costCents != null ? String(product.costCents / 100) : undefined}
          placeholder="0.00"
          onChange={(e) =>
            setCost(e.target.value === "" ? null : Math.round(Number(e.target.value) * 100))
          }
        />
        <Input
          label="Barcode"
          name="barcode"
          defaultValue={product?.barcode ?? ""}
          placeholder="Leave blank to auto-generate"
        />
        <Input
          label="Weight (g)"
          name="weightGrams"
          type="number"
          defaultValue={product?.weightGrams ?? undefined}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Input
          label="Length (mm)"
          name="lengthMm"
          type="number"
          defaultValue={product?.lengthMm ?? undefined}
        />
        <Input
          label="Width (mm)"
          name="widthMm"
          type="number"
          defaultValue={product?.widthMm ?? undefined}
        />
        <Input
          label="Height (mm)"
          name="heightMm"
          type="number"
          defaultValue={product?.heightMm ?? undefined}
        />
      </div>
      <p className="-mt-2 text-xs text-muted">
        Barcode, weight and size are used for scanning and courier labels. Leave the barcode blank
        and one is generated automatically when the product is saved. Leaving SKU blank uses the
        slug. Cost price powers margin reports and is never shown to customers.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Category</span>
          <ValidationSelect
            name="categoryId"
            defaultValue={product?.categoryId}
            required
            className="input"
          >
            <option value="" disabled>
              Select a category
            </option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.parentId ? "└ " : ""}
                {c.name}
              </option>
            ))}
          </ValidationSelect>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Brand</span>
          <ValidationSelect name="brandId" defaultValue={product?.brandId ?? ""} className="input">
            <option value="">None</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </ValidationSelect>
        </label>
      </div>

      <div className="flex flex-wrap gap-6">
        <Checkbox label="Flash sale" name="flashSale" defaultChecked={product?.flashSale} />
        <Checkbox label="Featured" name="featured" defaultChecked={product?.featured} />
        <Checkbox label="Active" name="active" defaultChecked={product?.active ?? true} />
      </div>

      <ImageManager initialImages={product?.images ?? []} />

      <p className="text-xs text-muted">
        Upload up to 5 JPEG, PNG, WebP, GIF or AVIF images at once (max 8 per product, 5 MB each);
        new photos are appended after the ones above. Sale price must be lower than the regular
        price.
      </p>
      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "Saving…" : "Save product"}
      </button>
    </ValidatedForm>
  );
}

function Input({
  label,
  name,
  type = "text",
  defaultValue,
  placeholder,
  required,
  onChange,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string | number;
  placeholder?: string;
  required?: boolean;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      <ValidationInput
        type={type}
        step={
          type === "number" && ["price", "salePrice", "cost"].includes(name) ? "0.01" : undefined
        }
        name={name}
        defaultValue={defaultValue != null ? String(defaultValue) : undefined}
        placeholder={placeholder}
        required={required}
        onChange={onChange}
        className="input"
      />
    </label>
  );
}

function Checkbox({
  label,
  name,
  defaultChecked,
}: {
  label: string;
  name: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="flex items-center gap-2 text-sm font-medium">
      <ValidationInput
        type="checkbox"
        name={name}
        value="true"
        defaultChecked={defaultChecked}
        className="h-4 w-4 accent-[var(--primary)]"
      />
      {label}
    </label>
  );
}

/**
 * Photo manager for the product form: thumbnail grid with per-photo remove
 * and reorder controls (first photo is the cover), plus a multi-file upload
 * that appends new photos on save. Keeps the comma-joined `images` field the
 * server action expects in sync with the visible list.
 */
function ImageManager({ initialImages }: { initialImages: string[] }) {
  const [images, setImages] = useState(initialImages);
  const full = images.length >= 8;

  function remove(index: number) {
    setImages((list) => list.filter((_, i) => i !== index));
  }
  function move(index: number, delta: -1 | 1) {
    setImages((list) => {
      const target = index + delta;
      if (target < 0 || target >= list.length) return list;
      const next = [...list];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-sm font-medium">Photos ({images.length}/8)</span>
        <span className="text-xs text-muted">First photo is the cover</span>
      </div>

      {images.length > 0 ? (
        <ul className="mb-3 grid grid-cols-3 gap-3 sm:grid-cols-5">
          {images.map((src, i) => (
            <li
              key={src + i}
              className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-surface-2"
            >
              <Image
                src={src}
                alt=""
                fill
                unoptimized
                sizes="120px"
                className="object-contain p-1.5"
              />
              {i === 0 && (
                <span className="absolute left-1 top-1 rounded bg-primary px-1.5 py-0.5 text-[10px] font-bold text-white">
                  Cover
                </span>
              )}
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/55 px-1 py-0.5 text-white">
                <button
                  type="button"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  aria-label={`Move photo ${i + 1} earlier`}
                  className="flex h-6 w-6 items-center justify-center rounded text-sm leading-none transition hover:bg-white/20 disabled:opacity-30"
                >
                  ‹
                </button>
                <button
                  type="button"
                  onClick={() => remove(i)}
                  aria-label={`Remove photo ${i + 1}`}
                  className="flex h-6 w-6 items-center justify-center rounded text-sm leading-none transition hover:bg-white/20"
                >
                  ×
                </button>
                <button
                  type="button"
                  onClick={() => move(i, 1)}
                  disabled={i === images.length - 1}
                  aria-label={`Move photo ${i + 1} later`}
                  className="flex h-6 w-6 items-center justify-center rounded text-sm leading-none transition hover:bg-white/20 disabled:opacity-30"
                >
                  ›
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-3 rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted">
          No photos yet — the first upload becomes the cover.
        </p>
      )}

      <input type="hidden" name="images" value={images.join(",")} />

      <label className="block">
        <span className="mb-1 block text-sm font-medium">Add photos (up to 5 at once)</span>
        <ValidationInput
          type="file"
          name="imageFiles"
          accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
          multiple
          disabled={full}
          className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-primary-light file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary"
        />
      </label>
      {full && (
        <p className="mt-1 text-xs text-accent">Photo limit reached — remove one to upload more.</p>
      )}
    </div>
  );
}
