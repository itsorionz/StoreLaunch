"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Modal } from "@frontend/components/ui/modal";
import { ValidatedForm, ValidationInput } from "@frontend/components/ui/validated-form";
import { saveSlide } from "@backend/actions/carousel";
import type { AdminActionResult } from "@backend/actions/admin";
import { useToast } from "@frontend/components/ui/toast";
import { PencilIcon } from "./action-icons";

type SlideVal = {
  id: string;
  imageUrl: string;
  title: string | null;
  linkUrl: string | null;
  order: number;
  active: boolean;
};
type CampaignOption = { id: string; title: string };

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

export function CarouselForm({
  slide,
  campaigns = [],
  onSaved,
}: {
  slide?: SlideVal;
  campaigns?: CampaignOption[];
  onSaved?: () => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [state, action, pending] = useActionState<AdminActionResult | null, FormData>(
    async (previous, data) => {
      const result = await saveSlide(previous, data);
      if (result.ok) {
        setPreview(null);
        if (fileRef.current) fileRef.current.value = "";
      }
      return result;
    },
    null,
  );
  useSavedRefresh(
    state,
    slide ? "Carousel slide updated successfully." : "Carousel slide added successfully.",
    onSaved,
  );

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  const campaignPrefix = "/products?campaign=";
  const selectedCampaignId = slide?.linkUrl?.startsWith(campaignPrefix)
    ? slide.linkUrl.slice(campaignPrefix.length)
    : "";
  const bannerFileError = state?.fieldErrors?.bannerFile?.[0];

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
      {slide?.id && <ValidationInput type="hidden" name="id" value={slide.id} />}

      <div className="overflow-hidden rounded-xl border border-border bg-surface-2">
        <div className="relative aspect-[16/5] w-full">
          {preview ? (
            <img
              src={preview}
              alt="Selected slide preview"
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : slide?.imageUrl ? (
            <Image
              src={slide.imageUrl}
              alt={slide.title ?? "Current slide"}
              fill
              unoptimized
              sizes="(max-width: 640px) 100vw, 480px"
              className="object-cover"
            />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center text-sm text-muted">
              Image preview (1600 × 500)
            </span>
          )}
        </div>
      </div>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">Slide image</span>
        <input
          ref={fileRef}
          type="file"
          name="bannerFile"
          accept="image/jpeg,image/png,image/webp,image/avif"
          aria-invalid={bannerFileError ? true : undefined}
          onChange={(event) => {
            const file = event.target.files?.[0];
            setPreview((previous) => {
              if (previous) URL.revokeObjectURL(previous);
              return file ? URL.createObjectURL(file) : null;
            });
          }}
          className="input block w-full file:mr-3 file:rounded-lg file:border-0 file:bg-primary-light file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary"
        />
        <span className="mt-1 block text-xs text-muted">
          JPEG, PNG, WebP or AVIF, up to 5 MB. The image is automatically cropped and resized to the
          homepage slider size (1600 × 500) so it looks right on mobile and desktop. The preview
          updates as soon as you pick a file.
        </span>
        {bannerFileError && (
          <span role="alert" className="mt-1 block text-xs text-accent">
            {bannerFileError}
          </span>
        )}
      </label>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">Or use an image URL</span>
        <ValidationInput
          name="imageUrl"
          defaultValue={slide?.imageUrl}
          placeholder="/uploads/carousel/slide.webp"
          className="input"
        />
      </label>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">Caption (optional)</span>
        <ValidationInput
          name="title"
          defaultValue={slide?.title ?? ""}
          maxLength={120}
          placeholder="e.g. Eid sale — up to 40% off"
          className="input"
        />
      </label>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">Link to campaign (optional)</span>
        <ValidationSelect name="campaignId" defaultValue={selectedCampaignId}>
          <option value="">No campaign — use the custom link below</option>
          {campaigns.map((campaign) => (
            <option key={campaign.id} value={campaign.id}>
              {campaign.title}
            </option>
          ))}
        </ValidationSelect>
        <span className="mt-1 block text-xs text-muted">
          When a campaign is selected, clicking the slide opens that campaign&apos;s product section
          (/products?campaign=…).
        </span>
      </label>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">Or custom link URL (optional)</span>
        <ValidationInput
          name="linkUrl"
          defaultValue={slide?.linkUrl ?? ""}
          placeholder="/categories/spices or https://…"
          className="input"
        />
        <span className="mt-1 block text-xs text-muted">
          Ignored when a campaign is selected above.
        </span>
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium">
          Display order
          <ValidationInput
            name="order"
            type="number"
            min={0}
            defaultValue={String(slide?.order ?? 0)}
            className="input mt-1"
          />
        </label>
        <label className="flex items-end gap-2.5 pb-2.5 text-sm font-medium">
          <ValidationInput
            type="checkbox"
            name="active"
            value="true"
            defaultChecked={slide?.active ?? true}
            className="h-4 w-4 accent-[var(--primary)]"
          />
          Active
        </label>
      </div>

      <p className="text-xs text-muted">
        Active slides rotate in random order on the homepage so visitors see every offer. Inactive
        slides stay hidden.
      </p>
      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "Saving…" : slide ? "Update slide" : "Add slide"}
      </button>
    </ValidatedForm>
  );
}

function ValidationSelect({
  name,
  defaultValue,
  children,
}: {
  name: string;
  defaultValue?: string;
  children: React.ReactNode;
}) {
  return (
    <select name={name} defaultValue={defaultValue} className="input mt-1">
      {children}
    </select>
  );
}

function useModal() {
  const [open, setOpen] = useState(false);
  return { open, openModal: () => setOpen(true), closeModal: () => setOpen(false) };
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="btn-primary">
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
      {label}
    </button>
  );
}

export function AddSlideModal({ campaigns }: { campaigns: CampaignOption[] }) {
  const m = useModal();
  return (
    <>
      <AddButton label="Add slide" onClick={m.openModal} />
      <Modal open={m.open} onClose={m.closeModal} title="Add carousel slide">
        <CarouselForm campaigns={campaigns} onSaved={m.closeModal} />
      </Modal>
    </>
  );
}

export function EditSlideModal({
  slide,
  campaigns,
}: {
  slide: SlideVal;
  campaigns: CampaignOption[];
}) {
  const m = useModal();
  return (
    <>
      <button
        type="button"
        onClick={m.openModal}
        aria-label="Edit slide"
        title="Edit slide"
        className="btn-icon text-primary transition-colors hover:bg-primary-light"
      >
        <PencilIcon size={16} />
      </button>
      <Modal open={m.open} onClose={m.closeModal} title="Edit carousel slide">
        <CarouselForm slide={slide} campaigns={campaigns} onSaved={m.closeModal} />
      </Modal>
    </>
  );
}
