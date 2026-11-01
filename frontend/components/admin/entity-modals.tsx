"use client";

import { useState } from "react";
import { Modal } from "@frontend/components/ui/modal";
import {
  CategoryForm,
  BrandForm,
  CampaignForm,
  RiderForm,
  DeliveryCompanyForm,
} from "./entity-forms";
import { PencilIcon } from "./action-icons";

type ParentOption = { id: string; name: string; nameBn?: string | null; parentId: string | null };
type CategoryVal = {
  id: string;
  name: string;
  nameBn?: string | null;
  slug: string;
  imageUrl: string | null;
  order: number;
  parentId: string | null;
};
type BrandVal = {
  id: string;
  name: string;
  nameBn?: string | null;
  slug: string;
  imageUrl: string | null;
};
type CampaignVal = {
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
type RiderVal = { id: string; name: string; phone: string; active: boolean; email?: string | null };
type CompanyVal = {
  id: string;
  name: string;
  phone: string | null;
  trackingUrl: string | null;
  volumeDiscountBps: number;
  volumeMinParcels: number;
  labelFormat: "A4" | "Thermal";
  active: boolean;
};

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

function EditButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="btn-icon text-primary transition-colors hover:bg-primary-light"
    >
      <PencilIcon size={16} />
    </button>
  );
}

function useModal() {
  const [open, setOpen] = useState(false);
  return { open, openModal: () => setOpen(true), closeModal: () => setOpen(false) };
}

export function AddCategoryModal({ parentOptions }: { parentOptions: ParentOption[] }) {
  const m = useModal();
  return (
    <>
      <AddButton label="Add category" onClick={m.openModal} />
      <Modal open={m.open} onClose={m.closeModal} title="Add category">
        <CategoryForm parentOptions={parentOptions} onSaved={m.closeModal} />
      </Modal>
    </>
  );
}

export function EditCategoryModal({
  category,
  parentOptions,
}: {
  category: CategoryVal;
  parentOptions: ParentOption[];
}) {
  const m = useModal();
  return (
    <>
      <EditButton label="Edit category" onClick={m.openModal} />
      <Modal open={m.open} onClose={m.closeModal} title="Edit category">
        <CategoryForm category={category} parentOptions={parentOptions} onSaved={m.closeModal} />
      </Modal>
    </>
  );
}

export function AddBrandModal() {
  const m = useModal();
  return (
    <>
      <AddButton label="Add brand" onClick={m.openModal} />
      <Modal open={m.open} onClose={m.closeModal} title="Add brand">
        <BrandForm onSaved={m.closeModal} />
      </Modal>
    </>
  );
}

export function EditBrandModal({ brand }: { brand: BrandVal }) {
  const m = useModal();
  return (
    <>
      <EditButton label="Edit brand" onClick={m.openModal} />
      <Modal open={m.open} onClose={m.closeModal} title="Edit brand">
        <BrandForm brand={brand} onSaved={m.closeModal} />
      </Modal>
    </>
  );
}

export function AddCampaignModal() {
  const m = useModal();
  return (
    <>
      <AddButton label="Add campaign" onClick={m.openModal} />
      <Modal open={m.open} onClose={m.closeModal} title="Add campaign">
        <CampaignForm onSaved={m.closeModal} />
      </Modal>
    </>
  );
}

export function EditCampaignModal({ campaign }: { campaign: CampaignVal }) {
  const m = useModal();
  return (
    <>
      <EditButton label="Edit campaign" onClick={m.openModal} />
      <Modal open={m.open} onClose={m.closeModal} title="Edit campaign">
        <CampaignForm campaign={campaign} onSaved={m.closeModal} />
      </Modal>
    </>
  );
}

export function AddRiderModal() {
  const m = useModal();
  return (
    <>
      <AddButton label="Add delivery partner" onClick={m.openModal} />
      <Modal open={m.open} onClose={m.closeModal} title="Add delivery partner">
        <RiderForm onSaved={m.closeModal} />
      </Modal>
    </>
  );
}

export function EditRiderModal({ rider }: { rider: RiderVal }) {
  const m = useModal();
  return (
    <>
      <EditButton label="Edit delivery partner" onClick={m.openModal} />
      <Modal open={m.open} onClose={m.closeModal} title="Edit delivery partner">
        <RiderForm rider={rider} onSaved={m.closeModal} />
      </Modal>
    </>
  );
}

export function AddCompanyModal() {
  const m = useModal();
  return (
    <>
      <AddButton label="Add delivery company" onClick={m.openModal} />
      <Modal open={m.open} onClose={m.closeModal} title="Add delivery company">
        <DeliveryCompanyForm onSaved={m.closeModal} />
      </Modal>
    </>
  );
}

export function EditCompanyModal({ company }: { company: CompanyVal }) {
  const m = useModal();
  return (
    <>
      <EditButton label="Edit delivery company" onClick={m.openModal} />
      <Modal open={m.open} onClose={m.closeModal} title="Edit delivery company">
        <DeliveryCompanyForm company={company} onSaved={m.closeModal} />
      </Modal>
    </>
  );
}
