"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  deleteProduct,
  deleteCategory,
  deleteBrand,
  deleteCampaign,
  deleteRider,
  deleteDeliveryZone,
} from "@backend/actions/admin";
import { deleteSlide } from "@backend/actions/carousel";
import { useConfirm } from "@frontend/components/ui/confirm-dialog";
import { useToast } from "@frontend/components/ui/toast";
import { TrashIcon } from "./action-icons";

export function DeleteProductButton({ id }: { id: string }) {
  const router = useRouter();
  const confirm = useConfirm();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={async () => {
        const ok = await confirm({
          title: "Delete product?",
          description:
            "This permanently removes the product from your catalog. This action cannot be undone.",
          confirmLabel: "Delete",
          danger: true,
        });
        if (!ok) return;
        startTransition(async () => {
          try {
            const result = await deleteProduct(id);
            if (!result.ok) {
              toast(result.error ?? "Could not delete product", "error");
              return;
            }
            toast("Product deleted");
            router.refresh();
          } catch {
            toast("Could not delete product. Please try again.", "error");
          }
        });
      }}
      className="btn-icon text-accent transition-colors hover:bg-accent/10 disabled:opacity-50"
      aria-label="Delete"
      title="Delete"
    >
      {pending ? "…" : <TrashIcon size={16} />}
    </button>
  );
}

export function DeleteCategoryButton({ id }: { id: string }) {
  const router = useRouter();
  const confirm = useConfirm();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={async () => {
        const ok = await confirm({
          title: "Delete category?",
          description:
            "Categories with products or subcategories cannot be deleted. Move them first.",
          confirmLabel: "Delete",
          danger: true,
        });
        if (!ok) return;
        startTransition(async () => {
          try {
            const res = await deleteCategory(id);
            if (!res.ok) toast(res.error ?? "Could not delete category", "error");
            else {
              toast("Category deleted");
              router.refresh();
            }
          } catch {
            toast("Could not delete category. Please try again.", "error");
          }
        });
      }}
      className="btn-icon text-accent transition-colors hover:bg-accent/10 disabled:opacity-50"
      aria-label="Delete"
      title="Delete"
    >
      {pending ? "…" : <TrashIcon size={16} />}
    </button>
  );
}

export function DeleteBrandButton({ id }: { id: string }) {
  const router = useRouter();
  const confirm = useConfirm();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={async () => {
        const ok = await confirm({
          title: "Delete brand?",
          description: "Brands with products cannot be deleted. Reassign the products first.",
          confirmLabel: "Delete",
          danger: true,
        });
        if (!ok) return;
        startTransition(async () => {
          try {
            const res = await deleteBrand(id);
            if (!res.ok) toast(res.error ?? "Could not delete brand", "error");
            else {
              toast("Brand deleted");
              router.refresh();
            }
          } catch {
            toast("Could not delete brand. Please try again.", "error");
          }
        });
      }}
      className="btn-icon text-accent transition-colors hover:bg-accent/10 disabled:opacity-50"
      aria-label="Delete"
      title="Delete"
    >
      {pending ? "…" : <TrashIcon size={16} />}
    </button>
  );
}

export function DeleteCampaignButton({ id }: { id: string }) {
  const router = useRouter();
  const confirm = useConfirm();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={async () => {
        const ok = await confirm({
          title: "Delete campaign?",
          description:
            "This removes the banner and all discounts belonging to this campaign. Other campaigns and regular prices stay unchanged.",
          confirmLabel: "Delete",
          danger: true,
        });
        if (!ok) return;
        startTransition(async () => {
          try {
            const res = await deleteCampaign(id);
            if (!res.ok) toast(res.error ?? "Could not delete campaign", "error");
            else {
              toast("Campaign deleted");
              router.refresh();
            }
          } catch {
            toast("Could not delete campaign. Please try again.", "error");
          }
        });
      }}
      className="btn-icon text-accent transition-colors hover:bg-accent/10 disabled:opacity-50"
      aria-label="Delete"
      title="Delete"
    >
      {pending ? "…" : <TrashIcon size={16} />}
    </button>
  );
}

export function DeleteSlideButton({ id }: { id: string }) {
  const router = useRouter();
  const confirm = useConfirm();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={async () => {
        const ok = await confirm({
          title: "Delete carousel slide?",
          description: "This removes the slide from the homepage carousel. This cannot be undone.",
          confirmLabel: "Delete",
          danger: true,
        });
        if (!ok) return;
        startTransition(async () => {
          try {
            const res = await deleteSlide(id);
            if (!res.ok) toast(res.error ?? "Could not delete slide", "error");
            else {
              toast("Carousel slide deleted");
              router.refresh();
            }
          } catch {
            toast("Could not delete slide. Please try again.", "error");
          }
        });
      }}
      className="btn-icon text-accent transition-colors hover:bg-accent/10 disabled:opacity-50"
      aria-label="Delete"
      title="Delete"
    >
      {pending ? "…" : <TrashIcon size={16} />}
    </button>
  );
}

export function DeleteRiderButton({ id }: { id: string }) {
  const router = useRouter();
  const confirm = useConfirm();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={async () => {
        const ok = await confirm({
          title: "Delete delivery partner?",
          description:
            "Orders keep their history - the partner will be unassigned from any orders.",
          confirmLabel: "Delete",
          danger: true,
        });
        if (!ok) return;
        startTransition(async () => {
          try {
            const res = await deleteRider(id);
            if (!res.ok) toast(res.error ?? "Could not delete delivery partner", "error");
            else {
              toast("Delivery partner deleted");
              router.refresh();
            }
          } catch {
            toast("Could not delete delivery partner. Please try again.", "error");
          }
        });
      }}
      className="btn-icon text-accent transition-colors hover:bg-accent/10 disabled:opacity-50"
      aria-label="Delete"
      title="Delete"
    >
      {pending ? "…" : <TrashIcon size={16} />}
    </button>
  );
}

export function DeleteDeliveryCompanyButton({ id }: { id: string }) {
  const router = useRouter();
  const confirm = useConfirm();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={async () => {
        const ok = await confirm({
          title: "Delete delivery company?",
          description:
            "Orders keep their history - the company will be unassigned from any orders.",
          confirmLabel: "Delete",
          danger: true,
        });
        if (!ok) return;
        startTransition(async () => {
          try {
            const res = await deleteDeliveryZone(id);
            if (!res.ok) toast(res.error ?? "Could not delete delivery company", "error");
            else {
              toast("Delivery company deleted");
              router.refresh();
            }
          } catch {
            toast("Could not delete delivery company. Please try again.", "error");
          }
        });
      }}
      className="btn-icon text-accent transition-colors hover:bg-accent/10 disabled:opacity-50"
      aria-label="Delete"
      title="Delete"
    >
      {pending ? "." : <TrashIcon size={16} />}
    </button>
  );
}
