"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@frontend/components/ui/modal";
import { ProductForm, type ProductFormValues } from "./product-form";
import { PencilIcon } from "./action-icons";

export function AddProductModal({
  categories,
  brands,
}: {
  categories: { id: string; name: string; parentId: string | null }[];
  brands: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn-primary">
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          aria-hidden
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
        Add product
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Add product" wide>
        <ProductForm
          categories={categories}
          brands={brands}
          className="space-y-5"
          onSaved={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      </Modal>
    </>
  );
}

export function EditProductModal({
  product,
  categories,
  brands,
}: {
  product: ProductFormValues;
  categories: { id: string; name: string; parentId: string | null }[];
  brands: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Edit product"
        title="Edit product"
        className="btn-icon text-primary transition-colors hover:bg-primary-light"
      >
        <PencilIcon size={16} />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Edit product" wide>
        <ProductForm
          product={product}
          categories={categories}
          brands={brands}
          className="space-y-5"
          onSaved={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      </Modal>
    </>
  );
}
