"use server";

import { OrderStatuses, ReviewStatuses, Roles } from "@backend/lib/enums.mjs";
import { resolveCourierAdapter } from "../lib/courier-adapter-registry";
import { CourierApiError, orderToParcel } from "../lib/courier-adapter";
import {
  personName,
  emailAddress,
  passwordValue,
  phoneNumber,
  optionalContactPhone,
  slugValue,
  recordId,
  safeLink,
  checkboxValue,
  moneyAmount,
  uploadError,
  fieldFailure,
  validationFailure,
} from "../lib/form-validation";

import { revalidatePath, updateTag } from "next/cache";
import type { Prisma, Role } from "@backend/generated/prisma/client";
import { transitionOrder, assignOrderDelivery } from "../lib/order-lifecycle";
import { selectCarrierForOrder } from "../lib/carrier-selection";
import {
  attachOrderToDailyManifest,
  handoverDispatchManifest,
  openDailyCourierManifests,
} from "../lib/dispatch-manifests";
import { syncShipmentRecord } from "../lib/shipment-sync";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { writeFile, mkdir } from "fs/promises";
import { generateBarcodeValue } from "../lib/barcode";
import path from "path";
import { randomUUID } from "node:crypto";
import { lockCampaignPricing } from "../lib/campaign-pricing";
import { db } from "../lib/db";
import { canonicalPhone } from "../lib/otp";
import { requireAdmin, requireOpsEditor } from "../lib/session";
import { lockAccountStatus, assertRiderCanDeactivate } from "../lib/account-status";
import { revalidateStore } from "../lib/revalidate";
import { saveResizedBannerImage } from "../lib/upload-image";
import { logger } from "../lib/logger";

const log = logger.child({ scope: "action:admin" });

/** Prisma "the record is referenced elsewhere" — maps to a friendly message. */
function isReferencedError(error: unknown): boolean {
  const code = (error as { code?: unknown } | null | undefined)?.code;
  return code === "P2003" || code === "P2014";
}

/** Prisma unique-constraint violation — maps to a "already exists" message. */
function isDuplicateError(error: unknown): boolean {
  return (error as { code?: unknown } | null | undefined)?.code === "P2002";
}

export type PurchaseOrderStatus = "Draft" | "Sent" | "Partial" | "Received" | "Cancelled";

export type PickListQueueItem = Prisma.PickListGetPayload<{
  include: {
    order: true;
    lines: { include: { orderItem: { include: { product: true } } } };
  };
}>;

export type AdminActionResult = {
  ok: boolean;
  error?: string;
  /** Completed with a caveat the operator should see (surfaced as a warning toast). */
  warning?: string;
  fieldErrors?: Record<string, string[]>;
  id?: string;
  poNumber?: string;
  orderNumber?: string;
  pickListId?: string;
  pickLists?: PickListQueueItem[];
  /** Manifests created by an "open today's manifests" run (§5.5). */
  created?: number;
};

/** Weight/length inputs shared by the product form; blank means "not measured". */
const optionalMeasurement = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.coerce
    .number({ error: "Enter a whole number" })
    .int("Enter a whole number")
    .min(0, "Cannot be negative")
    .max(1000000, "Value is too large")
    .optional(),
);

const productSchema = z
  .object({
    id: recordId.optional(),
    name: personName,
    nameBn: z.string().trim().max(100, "Use at most 100 characters").optional().or(z.literal("")),
    slug: slugValue,
    sku: z.string().trim().max(64, "Use at most 64 characters").optional(),
    barcode: z
      .string()
      .trim()
      .max(64, "Use at most 64 characters")
      .refine(
        (value) => !value || /^[0-9A-Za-z\-. $/+%]+$/.test(value),
        "Use letters, numbers and the symbols - . $ / + %",
      )
      .optional(),
    costCents: z.preprocess(
      (value) => (value === "" ? null : value),
      moneyAmount.optional().nullable(),
    ),
    weightGrams: optionalMeasurement,
    lengthMm: optionalMeasurement,
    widthMm: optionalMeasurement,
    heightMm: optionalMeasurement,
    description: z.string().trim().max(10000, "Use at most 10000 characters").default(""),
    descriptionBn: z
      .string()
      .trim()
      .max(10000, "Use at most 10000 characters")
      .optional()
      .or(z.literal("")),
    priceCents: moneyAmount.refine((value) => value > 0, "Price must be greater than zero"),
    salePriceCents: z.preprocess(
      (value) => (value === "" ? null : value),
      moneyAmount.optional().nullable(),
    ),
    stock: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.coerce.number().int("Enter a whole stock quantity").min(0).max(1000000).optional(),
    ),
    categoryId: recordId,
    brandId: recordId.or(z.literal("")).optional().nullable(),
    flashSale: checkboxValue,
    featured: checkboxValue,
    active: checkboxValue,
    images: z
      .string()
      .max(16384)
      .default("")
      .refine((value) => {
        const paths = value
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean);
        return paths.length <= 8 && paths.every((value) => safeLink.safeParse(value).success);
      }, "Use at most 8 valid image URLs or local paths"),
  })
  .refine((value) => Boolean(value.id) || value.stock !== undefined, {
    path: ["stock"],
    message: "Enter initial stock",
  });

/** Picks a random in-store EAN-13 value that no catalog product uses yet. */
async function uniqueBarcodeValue(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = generateBarcodeValue();
    const taken = await db.product.findFirst({
      where: { barcode: candidate },
      select: { id: true },
    });
    if (!taken) return candidate;
  }
  return generateBarcodeValue();
}

export async function saveProduct(
  _prev: AdminActionResult | null,
  formData: FormData,
): Promise<AdminActionResult> {
  await requireAdmin();

  const productInput = Object.fromEntries(formData.entries());
  // Existing-product catalog edits never accept inventory, including forged fields.
  if (productInput.id) delete productInput.stock;
  const parsed = productSchema.safeParse(productInput);
  if (!parsed.success) {
    return { ok: false, ...validationFailure(parsed.error) };
  }
  const d = parsed.data;
  if (d.salePriceCents && d.salePriceCents >= d.priceCents)
    return { ok: false, ...fieldFailure("salePriceCents", "Must be lower than the regular price") };
  if (!(await db.category.findUnique({ where: { id: d.categoryId }, select: { id: true } })))
    return { ok: false, ...fieldFailure("categoryId", "Select an existing category") };
  if (d.brandId && !(await db.brand.findUnique({ where: { id: d.brandId }, select: { id: true } })))
    return { ok: false, ...fieldFailure("brandId", "Select an existing brand") };
  const invalidUpload = uploadError(formData.getAll("imageFiles"));
  if (invalidUpload) return { ok: false, ...fieldFailure("imageFiles", invalidUpload) };

  // Handle image upload
  const imageFiles = formData
    .getAll("imageFiles")
    .filter((f): f is File => f instanceof File && f.size > 0);
  const uploadedPaths: string[] = [];
  for (const file of imageFiles.slice(0, 5)) {
    try {
      const saved = await saveUploadedImage(file);
      if (saved) uploadedPaths.push(saved);
    } catch (error) {
      log.warn("saveProduct image rejected", { error, productId: d.id });
      return {
        ok: false,
        ...fieldFailure(
          "imageFiles",
          error instanceof Error ? error.message : "Image storage failed",
        ),
      };
    }
  }

  const existingImages = d.images
    ? d.images
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  const images = [...existingImages, ...uploadedPaths].slice(0, 8);

  // Barcodes are assigned automatically on upload so every product can be
  // scanned and printed without extra data entry. A typed barcode wins, but
  // it must not already belong to another product.
  const typedBarcode = d.barcode?.trim() || null;
  if (typedBarcode) {
    const clash = await db.product.findFirst({
      where: { barcode: typedBarcode, ...(d.id ? { id: { not: d.id } } : {}) },
      select: { id: true },
    });
    if (clash) return { ok: false, ...fieldFailure("barcode", "Already used by another product") };
  }
  const barcode = typedBarcode ?? (await uniqueBarcodeValue());

  const data = {
    name: d.name,
    nameBn: d.nameBn || null,
    slug: d.slug,
    sku: d.sku?.trim() || d.slug,
    barcode,
    description: d.description,
    descriptionBn: d.descriptionBn || null,
    priceCents: d.priceCents,
    salePriceCents: d.salePriceCents || null,
    costCents: d.costCents ?? null,
    weightGrams: d.weightGrams ?? null,
    lengthMm: d.lengthMm ?? null,
    widthMm: d.widthMm ?? null,
    heightMm: d.heightMm ?? null,
    categoryId: d.categoryId,
    brandId: d.brandId || null,
    flashSale: Boolean(d.flashSale),
    featured: Boolean(d.featured),
    active: Boolean(d.active),
    images,
  };

  try {
    if (d.id) {
      await db.product.update({ where: { id: d.id }, data });
    } else {
      await db.product.create({ data: { ...data, stock: d.stock ?? 0 } });
    }
  } catch (e) {
    const error = e as { code?: string; meta?: { target?: unknown } };
    if (error.code === "P2002") {
      const target = String(error.meta?.target ?? "");
      log.warn("saveProduct rejected", { code: "P2002", target, productId: d.id });
      if (target.includes("sku"))
        return { ok: false, ...fieldFailure("sku", "SKU already exists") };
      if (target.includes("barcode"))
        return { ok: false, ...fieldFailure("barcode", "Barcode already exists") };
      return { ok: false, ...fieldFailure("slug", "Slug already exists") };
    }
    log.error("saveProduct failed", { error: e, productId: d.id });
    return { ok: false, error: "Could not save product" };
  }

  revalidateStore();
  revalidatePath("/admin/products");
  revalidatePath("/");
  return { ok: true };
}

export async function deleteProduct(id: string): Promise<AdminActionResult> {
  if (!recordId.safeParse(id).success)
    return { ok: false, error: "Invalid record. Refresh the page and try again" };
  await requireAdmin();
  try {
    await db.product.delete({ where: { id } });
  } catch (error) {
    if (isReferencedError(error)) log.warn("deleteProduct rejected", { productId: id });
    else log.error("deleteProduct failed", { error, productId: id });
    return {
      ok: false,
      error: "Could not delete product. Products with order history must be deactivated instead.",
    };
  }
  revalidateStore();
  revalidatePath("/admin/products");
  return { ok: true };
}

async function saveUploadedImage(file: File): Promise<string | null> {
  const cloud = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (cloud && apiKey && apiSecret) {
    try {
      const { v2: cloudinary } = await import("cloudinary");
      cloudinary.config({ cloud_name: cloud, api_key: apiKey, api_secret: apiSecret });
      const bytes = Buffer.from(await file.arrayBuffer());
      const b64 = bytes.toString("base64");
      const dataUri = `data:${file.type};base64,${b64}`;
      const result = await cloudinary.uploader.upload(dataUri, {
        folder: "storelaunch/products",
        resource_type: "image",
        unique_filename: true,
        overwrite: false,
      });
      return result.secure_url;
    } catch (error) {
      // The cause is lost in production (a generic message is thrown below),
      // so it must be recorded here or storage outages are invisible.
      log.error("saveUploadedImage cloudinary failed", { error, folder: "storelaunch/products" });
      if (process.env.NODE_ENV === "production")
        throw new Error("Product image storage is temporarily unavailable. Try again later");
    }
  }
  if (process.env.NODE_ENV === "production")
    throw new Error("Configure Cloudinary image storage before uploading product images");
  const ext = (
    {
      "image/jpeg": ".jpg",
      "image/png": ".png",
      "image/webp": ".webp",
      "image/gif": ".gif",
      "image/avif": ".avif",
    } as Record<string, string>
  )[file.type];
  const name = `${randomUUID()}${ext}`;
  const dir = path.join(process.cwd(), "public", "uploads");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, name), Buffer.from(await file.arrayBuffer()));
  return `/uploads/${name}`;
}

async function saveUploadedBanner(file: File): Promise<string> {
  return saveResizedBannerImage(file, { folder: "banners", label: "Banner" });
}

const categorySchema = z.object({
  id: recordId.optional(),
  name: personName,
  nameBn: z.string().trim().max(100, "Use at most 100 characters").optional().or(z.literal("")),
  slug: slugValue,
  imageUrl: safeLink.optional(),
  order: z.coerce.number().int("Enter a whole display order").min(0).max(1000000).default(0),
  parentId: recordId.or(z.literal("")).optional(),
});

export async function saveCategory(
  _prev: AdminActionResult | null,
  formData: FormData,
): Promise<AdminActionResult> {
  await requireAdmin();
  const parsed = categorySchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, ...validationFailure(parsed.error) };
  const d = parsed.data;
  if (d.parentId && d.parentId === d.id)
    return { ok: false, ...fieldFailure("parentId", "A category cannot be its own parent") };
  if (d.parentId) {
    const parent = await db.category.findUnique({
      where: { id: d.parentId },
      select: { parentId: true },
    });
    if (!parent || parent.parentId)
      return { ok: false, ...fieldFailure("parentId", "Select an existing top-level category") };
    if (d.id && (await db.category.count({ where: { parentId: d.id } })))
      return {
        ok: false,
        error: "Move this category's subcategories before making it a subcategory",
      };
  }
  const data = {
    name: d.name,
    nameBn: d.nameBn || null,
    slug: d.slug,
    imageUrl: d.imageUrl || null,
    order: d.order,
    parentId: d.parentId || null,
  };
  try {
    if (d.id) await db.category.update({ where: { id: d.id }, data });
    else await db.category.create({ data });
  } catch (error) {
    // Non-duplicate failures would be mislabelled as "slug exists", so the
    // real cause is logged here before the generic message is returned.
    if (isDuplicateError(error)) log.warn("saveCategory rejected", { code: "P2002", slug: d.slug });
    else log.error("saveCategory failed", { error, categoryId: d.id });
    return { ok: false, ...fieldFailure("slug", "Slug already exists") };
  }
  revalidateStore();
  return { ok: true };
}

export async function deleteCategory(id: string): Promise<AdminActionResult> {
  if (!recordId.safeParse(id).success)
    return { ok: false, error: "Invalid record. Refresh the page and try again" };
  await requireAdmin();
  try {
    await db.category.delete({ where: { id } });
  } catch (error) {
    if (isReferencedError(error)) log.warn("deleteCategory rejected", { categoryId: id });
    else log.error("deleteCategory failed", { error, categoryId: id });
    return {
      ok: false,
      error: "Category has products or subcategories — move or delete them first",
    };
  }
  revalidateStore();
  return { ok: true };
}

const brandSchema = z.object({
  id: recordId.optional(),
  name: personName,
  nameBn: z.string().trim().max(100, "Use at most 100 characters").optional().or(z.literal("")),
  slug: slugValue,
  imageUrl: safeLink.optional(),
});

export async function saveBrand(
  _prev: AdminActionResult | null,
  formData: FormData,
): Promise<AdminActionResult> {
  await requireAdmin();
  const parsed = brandSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { ok: false, ...validationFailure(parsed.error) };
  }
  const d = parsed.data;
  const data = {
    name: d.name,
    nameBn: d.nameBn || null,
    slug: d.slug,
    imageUrl: d.imageUrl || null,
  };
  try {
    if (d.id) await db.brand.update({ where: { id: d.id }, data });
    else await db.brand.create({ data });
  } catch (error) {
    if (isDuplicateError(error)) log.warn("saveBrand rejected", { code: "P2002", slug: d.slug });
    else log.error("saveBrand failed", { error, brandId: d.id });
    return { ok: false, ...fieldFailure("slug", "Slug already exists") };
  }
  revalidateStore();
  return { ok: true };
}

export async function deleteBrand(id: string): Promise<AdminActionResult> {
  if (!recordId.safeParse(id).success)
    return { ok: false, error: "Invalid record. Refresh the page and try again" };
  await requireAdmin();
  const count = await db.product.count({ where: { brandId: id } });
  if (count > 0) return { ok: false, error: "Brand has products — reassign or delete them first" };
  await db.brand.delete({ where: { id } }).catch(() => undefined);
  revalidateStore();
  return { ok: true };
}

const campaignSchema = z.object({
  id: recordId.optional(),
  title: personName,
  imageUrl: safeLink.optional(),
  linkUrl: safeLink,
  flashSale: checkboxValue,
  showOnHome: checkboxValue,
  showInCart: checkboxValue,
  order: z.coerce.number().int("Enter a whole display order").min(0).max(1000000).default(0),
  active: checkboxValue,
});

export async function saveCampaign(
  _prev: AdminActionResult | null,
  formData: FormData,
): Promise<AdminActionResult> {
  await requireAdmin();
  const bannerFileValue = formData.get("bannerFile");
  const bannerFile =
    typeof File !== "undefined" && bannerFileValue instanceof File && bannerFileValue.size > 0
      ? bannerFileValue
      : null;
  if (bannerFile && bannerFile.size > 5 * 1024 * 1024)
    return { ok: false, ...fieldFailure("bannerFile", "Banner image must be 5 MB or smaller") };
  if (
    bannerFile &&
    !["image/jpeg", "image/png", "image/webp", "image/avif"].includes(bannerFile.type)
  )
    return {
      ok: false,
      ...fieldFailure("bannerFile", "Use a JPEG, PNG, WebP or AVIF image"),
    };
  const parsed = campaignSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, ...validationFailure(parsed.error) };
  const d = parsed.data;
  let uploadedImageUrl: string | null = null;
  if (bannerFile) {
    try {
      uploadedImageUrl = await saveUploadedBanner(bannerFile);
    } catch (error) {
      log.warn("saveCampaign banner rejected", { error, campaignId: d.id });
      return {
        ok: false,
        ...fieldFailure(
          "bannerFile",
          error instanceof Error ? error.message : "Could not process this banner image",
        ),
      };
    }
  }
  const imageUrl = uploadedImageUrl || d.imageUrl?.trim();
  if (!imageUrl)
    return {
      ok: false,
      ...fieldFailure("bannerFile", "Upload a banner image or enter an image URL"),
    };
  const data = {
    title: d.title,
    imageUrl,
    linkUrl: d.linkUrl,
    order: d.order,
    active: Boolean(d.active),
    flashSale: Boolean(d.flashSale),
    showOnHome: Boolean(d.showOnHome),
    showInCart: Boolean(d.showInCart && d.active),
  };
  const campaign = await db.$transaction(async (tx) => {
    await lockCampaignPricing(tx);
    if (data.showInCart)
      await tx.campaign.updateMany({
        where: { showInCart: true, ...(d.id ? { id: { not: d.id } } : {}) },
        data: { showInCart: false },
      });
    if (d.id) return tx.campaign.update({ where: { id: d.id }, data });
    return tx.campaign.create({ data });
  });
  revalidateStore();
  return { ok: true, id: campaign.id };
}

export async function deleteCampaign(id: string): Promise<AdminActionResult> {
  if (!recordId.safeParse(id).success)
    return { ok: false, error: "Invalid record. Refresh the page and try again" };
  await requireAdmin();
  await db.$transaction(async (tx) => {
    await lockCampaignPricing(tx);
    await tx.campaign.deleteMany({ where: { id } });
  });
  revalidateStore();
  return { ok: true };
}

export async function updateOrderStatus(
  orderId: string,
  status: string,
  cashCollected = false,
): Promise<AdminActionResult> {
  if (!recordId.safeParse(orderId).success)
    return { ok: false, error: "Invalid record. Refresh the page and try again" };
  const admin = await requireAdmin();
  const result = await transitionOrder(orderId, status, {
    cashCollected: cashCollected === true,
    actor: { id: admin.id, name: admin.name ?? "Admin", role: Roles.Admin },
  });
  if (!result.ok) return result;
  updateTag("wallet");
  revalidateStore();
  revalidatePath("/account/refer");
  revalidatePath("/account/inbox");
  revalidatePath("/admin");
  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${result.number}`);
  revalidatePath(`/account/orders/${result.number}`);
  revalidatePath("/rider");
  revalidatePath("/rider/route");
  revalidatePath("/rider/history");
  revalidatePath("/rider/cash");
  revalidatePath(`/rider/orders/${result.number}`);
  return { ok: true };
}

export async function moderateReview(
  reviewId: string,
  action: "approve" | "hide" | "delete",
): Promise<AdminActionResult> {
  if (!recordId.safeParse(reviewId).success)
    return { ok: false, error: "Invalid record. Refresh the page and try again" };
  await requireAdmin();
  if (!["approve", "hide", "delete"].includes(action))
    return { ok: false, error: "Choose a valid review action" };
  if (action === "delete") {
    await db.review.delete({ where: { id: reviewId } }).catch(() => undefined);
  } else {
    await db.review.update({
      where: { id: reviewId },
      data: { status: action === "approve" ? ReviewStatuses.Approved : ReviewStatuses.Hidden },
    });
  }
  updateTag("products");
  revalidatePath("/admin/reviews");
  revalidatePath("/account/reviews");
  return { ok: true };
}

const customerSchema = z.object({
  name: personName,
  email: emailAddress,
  password: passwordValue,
});

export async function createCustomer(
  _prev: AdminActionResult | null,
  formData: FormData,
): Promise<AdminActionResult> {
  await requireAdmin();
  const parsed = customerSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { ok: false, ...validationFailure(parsed.error) };
  }
  const email = parsed.data.email.toLowerCase().trim();
  const existing = await db.user.findUnique({ where: { email } });
  if (existing)
    return { ok: false, ...fieldFailure("email", "An account with this email already exists") };

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  const user = await db.user.create({
    data: { email, name: parsed.data.name, passwordHash, roles: [Roles.Customer] },
  });
  revalidatePath("/admin/customers");
  revalidatePath("/admin/wallets");
  return { ok: true, id: user.id };
}

export async function createCustomerService(
  _prev: AdminActionResult | null,
  formData: FormData,
): Promise<AdminActionResult> {
  await requireAdmin();
  const parsed = customerSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { ok: false, ...validationFailure(parsed.error) };
  }
  const email = parsed.data.email.toLowerCase().trim();
  const existing = await db.user.findUnique({ where: { email } });
  if (existing)
    return { ok: false, ...fieldFailure("email", "An account with this email already exists") };

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  const user = await db.user.create({
    data: {
      email,
      name: parsed.data.name,
      passwordHash,
      roles: [Roles.Customer, Roles.Support],
    },
  });
  revalidatePath("/admin/users");
  return { ok: true, id: user.id };
}

/**
 * Sets a sales rep's commission rate in basis points (§10). Applied to future
 * orders only — already-issued orders keep their immutable snapshot.
 */
export async function saveSalesRepCommission(
  _prev: AdminActionResult | null,
  formData: FormData,
): Promise<AdminActionResult> {
  await requireAdmin();
  const userId = String(formData.get("userId") || "").trim();
  const bps = Number(String(formData.get("commissionBps") || "").trim());
  if (!userId) return { ok: false, error: "Rep ID required" };
  if (!Number.isInteger(bps) || bps < 0 || bps > 5000)
    return { ok: false, error: "Commission must be between 0% and 50%" };

  const rep = await db.user.findFirst({ where: { id: userId, roles: { has: Roles.Sales } } });
  if (!rep) return { ok: false, error: "Sales rep not found" };

  await db.user.update({ where: { id: userId }, data: { commissionBps: bps } });
  revalidatePath("/admin/commission");
  revalidatePath("/sales");
  return { ok: true };
}

const riderSchema = z.object({
  id: recordId.optional(),
  name: personName,
  phone: phoneNumber,
  email: emailAddress.optional().or(z.literal("")),
  password: passwordValue.or(z.literal("")).optional(),
  active: checkboxValue,
});

export async function saveRider(
  _prev: AdminActionResult | null,
  formData: FormData,
): Promise<AdminActionResult> {
  const admin = await requireAdmin();
  const parsed = riderSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { ok: false, ...validationFailure(parsed.error) };
  }
  const d = parsed.data;
  const active = parsed.data.active;
  const email = (d.email ?? "").toLowerCase().trim();
  const password = d.password ?? "";
  const phone = canonicalPhone(d.phone);
  if (phone.length < 10) return { ok: false, error: "Enter a valid phone number" };
  if (password && password.length < 8)
    return { ok: false, error: "Password must be at least 8 characters" };

  try {
    await db.$transaction(async (tx) => {
      await lockAccountStatus(tx);
      const rider = d.id ? await tx.rider.findUnique({ where: { id: d.id } }) : null;
      if (d.id && !rider) throw new Error("Rider not found");
      if (rider && !active) await assertRiderCanDeactivate(tx, rider.id);
      // Match both identifiers to one account before granting another role.
      const users = await tx.user.findMany({ where: { phone: { not: null } } });
      const phoneMatches = users.filter((u) => u.phone && canonicalPhone(u.phone) === phone);
      if (phoneMatches.length > 1)
        throw new Error(
          "This phone belongs to multiple accounts. Resolve the duplicate accounts first.",
        );
      const byPhone = phoneMatches[0];
      const byEmail = email ? await tx.user.findUnique({ where: { email } }) : null;
      if (byPhone && byEmail && byPhone.id !== byEmail.id)
        throw new Error("Email and phone belong to different accounts");
      let user = rider?.userId
        ? await tx.user.findUnique({ where: { id: rider.userId } })
        : (byEmail ?? byPhone);
      if (user && ((byEmail && byEmail.id !== user.id) || (byPhone && byPhone.id !== user.id))) {
        throw new Error("Email or phone belongs to another account");
      }
      if (user) {
        const linked = await tx.rider.findUnique({ where: { userId: user.id } });
        if (linked && linked.id !== d.id)
          throw new Error("This account already has a rider profile");
        user = await tx.user.update({
          where: { id: user.id },
          data: {
            phone,
            ...(rider?.userId && email ? { email } : {}),
            roles: Array.from(new Set([...user.roles, Roles.Rider])),
            ...(rider?.userId && password ? { passwordHash: await bcrypt.hash(password, 10) } : {}),
          },
        });
      } else {
        if (!email)
          throw new Error(
            "Email is required for a new account; existing accounts can be linked by phone",
          );
        if (password.length < 8)
          throw new Error("Password must be at least 8 characters for a new account");
        user = await tx.user.create({
          data: {
            email,
            name: d.name.trim(),
            phone,
            passwordHash: await bcrypt.hash(password, 10),
            roles: [Roles.Customer, Roles.Rider],
          },
        });
      }
      if (active && !user.active)
        throw new Error("Activate the linked account before activating the rider");
      const data = { name: d.name.trim(), phone, active, userId: user.id };
      if (rider && rider.active !== active)
        await tx.accountStatusEvent.create({
          data: {
            riderId: rider.id,
            actorId: admin.id,
            actorName: admin.name ?? "Admin",
            previousActive: rider.active,
            active,
          },
        });
      if (rider) await tx.rider.update({ where: { id: rider.id }, data });
      else await tx.rider.create({ data });
    });
  } catch (error) {
    // Messages that reach the admin verbatim (no Prisma internals) are
    // business rejections; everything else is a real persistence failure.
    const userFacing = error instanceof Error && !error.message.includes("prisma");
    if (userFacing) log.warn("saveRider rejected", { error });
    else log.error("saveRider failed", { error });
    return {
      ok: false,
      error:
        error instanceof Error && !error.message.includes("prisma")
          ? error.message
          : "Could not save rider",
    };
  }

  revalidatePath("/admin/riders");
  revalidatePath("/admin/orders");
  return { ok: true };
}

export async function deleteRider(id: string): Promise<AdminActionResult> {
  if (!recordId.safeParse(id).success)
    return { ok: false, error: "Invalid record. Refresh the page and try again" };
  await requireAdmin();
  try {
    await db.$transaction(async (tx) => {
      const rider = await tx.rider.findUnique({ where: { id }, select: { userId: true } });
      if (!rider) return;
      if (await tx.order.count({ where: { riderId: id } }))
        throw new Error(
          "This rider has order history. Complete open deliveries and deactivate the rider instead",
        );
      await tx.rider.delete({ where: { id } });
      if (rider.userId) {
        const user = await tx.user.findUnique({
          where: { id: rider.userId },
          select: { roles: true },
        });
        if (user)
          await tx.user.update({
            where: { id: rider.userId },
            data: { roles: user.roles.filter((role) => role !== Roles.Rider) },
          });
      }
    });
  } catch (error) {
    if (isReferencedError(error)) log.warn("deleteRider rejected", { riderId: id });
    else log.error("deleteRider failed", { error, riderId: id });
    return {
      ok: false,
      error:
        "This rider has order history. Complete open deliveries and deactivate the rider instead",
    };
  }
  revalidatePath("/admin/riders");
  revalidatePath("/admin/orders");
  return { ok: true };
}

export async function assignDelivery(orderId: string, value: string): Promise<AdminActionResult> {
  if (!recordId.safeParse(orderId).success)
    return { ok: false, error: "Invalid record. Refresh the page and try again" };
  const admin = await requireAdmin();
  if (
    typeof value !== "string" ||
    (value !== "" && !/^(rider|company):[a-zA-Z0-9_-]{1,100}$/.test(value))
  )
    return { ok: false, error: "Choose a valid delivery partner or company" };
  const result = await assignOrderDelivery(orderId, value, {
    id: admin.id,
    name: admin.name ?? "Admin",
    role: Roles.Admin,
  });
  if (!result.ok) return result;
  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${result.number}`);
  revalidatePath(`/account/orders/${result.number}`);
  revalidatePath("/rider");
  revalidatePath(`/rider/orders/${result.number}`);
  revalidatePath("/account/rider-review");
  return { ok: true };
}

const deliveryCompanySchema = z.object({
  id: recordId.optional(),
  name: personName,
  phone: optionalContactPhone,
  trackingUrl: safeLink.optional(),
  labelFormat: z.enum(["A4", "Thermal"]).default("A4"),
  volumeDiscountBps: z.coerce
    .number()
    .int("Enter a whole number of basis points")
    .min(0)
    .max(10000)
    .default(0),
  volumeMinParcels: z.coerce
    .number()
    .int("Enter a whole parcel count")
    .min(0)
    .max(1000000)
    .default(0),
  active: checkboxValue,
});

export async function saveDeliveryCompany(
  _prev: AdminActionResult | null,
  formData: FormData,
): Promise<AdminActionResult> {
  await requireAdmin();
  const parsed = deliveryCompanySchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { ok: false, ...validationFailure(parsed.error) };
  }
  const active = parsed.data.active;
  const data = {
    name: parsed.data.name.trim(),
    phone: parsed.data.phone?.trim() || null,
    trackingUrl: parsed.data.trackingUrl?.trim() || null,
    labelFormat: parsed.data.labelFormat,
    volumeDiscountBps: parsed.data.volumeDiscountBps,
    volumeMinParcels: parsed.data.volumeMinParcels,
    active,
  };
  if (
    parsed.data.id &&
    !active &&
    (await db.order.count({
      where: {
        deliveryCompanyId: parsed.data.id,
        status: {
          in: [
            OrderStatuses.Pending,
            OrderStatuses.Paid,
            OrderStatuses.Processing,
            OrderStatuses.Confirmed,
            OrderStatuses.Packing,
            OrderStatuses.Packed,
            OrderStatuses.Shipped,
          ],
        },
      },
    }))
  )
    return {
      ok: false,
      error: "Complete or reassign open deliveries before deactivating this company",
    };
  if (parsed.data.id) await db.deliveryCompany.update({ where: { id: parsed.data.id }, data });
  else await db.deliveryCompany.create({ data });
  revalidatePath("/admin/riders");
  revalidatePath("/admin/orders");
  return { ok: true };
}

export async function saveDeliveryZone(
  _prev: AdminActionResult | null,
  formData: FormData,
): Promise<AdminActionResult> {
  await requireAdmin();
  const name = String(formData.get("name") || "").trim();
  if (!name) return { ok: false, error: "Name required" };
  const id = String(formData.get("id") || "").trim() || undefined;
  const warehouseId = String(formData.get("warehouseId") || "").trim() || null;
  const deliveryHubId = String(formData.get("deliveryHubId") || "").trim() || null;
  if (warehouseId && !(await db.warehouse.findUnique({ where: { id: warehouseId } })))
    return { ok: false, error: "Selected warehouse no longer exists" };
  if (deliveryHubId && !(await db.deliveryHub.findUnique({ where: { id: deliveryHubId } })))
    return { ok: false, error: "Selected delivery hub no longer exists" };
  const data = {
    name,
    areas: String(formData.get("areas") || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    mode: String(formData.get("mode") || "OwnRider") as "OwnRider" | "Courier",
    warehouseId,
    deliveryHubId,
    rateCents: Number(formData.get("rateCents") || 0),
    codFeeCents: Number(formData.get("codFeeCents") || 0),
    freeOverCents: formData.get("freeOverCents") ? Number(formData.get("freeOverCents")) : null,
    etaDaysFrom: Number(formData.get("etaDaysFrom") || 1),
    etaDaysTo: Number(formData.get("etaDaysTo") || 3),
    active: formData.get("active") === "on",
  };
  if (id) await db.deliveryZone.update({ where: { id }, data });
  else await db.deliveryZone.create({ data });
  revalidatePath("/admin/delivery-zones");
  revalidatePath("/admin/delivery-hubs");
  return { ok: true };
}

export async function deleteDeliveryZone(id: string): Promise<AdminActionResult> {
  await requireAdmin();
  await db.deliveryZone.delete({ where: { id } }).catch(() => undefined);
  revalidatePath("/admin/delivery-zones");
  return { ok: true };
}

export async function saveManifest(
  _prev: AdminActionResult | null,
  formData: FormData,
): Promise<AdminActionResult> {
  await requireAdmin();
  const manifestNumber = String(formData.get("manifestNumber") || "").trim();
  const kind = String(formData.get("kind") || "Rider") as "Rider" | "Courier";
  const riderId = String(formData.get("riderId") || "").trim() || undefined;
  const deliveryCompanyId = String(formData.get("deliveryCompanyId") || "").trim() || undefined;
  if (!manifestNumber) return { ok: false, error: "Manifest number required" };
  const existing = await db.dispatchManifest.findFirst({ where: { number: manifestNumber } });
  if (existing) return { ok: false, error: "Manifest number already exists" };
  const linesInput = String(formData.get("lines") || "").trim();
  const lineIds = linesInput
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!lineIds.length) return { ok: false, error: "At least one order line required" };
  const orders = await db.order.findMany({
    where: { id: { in: lineIds }, status: OrderStatuses.Packed },
  });
  if (orders.length !== lineIds.length)
    return { ok: false, error: "Some selected orders are not Packed" };
  // One parcel = one manifest (§5.5): reject orders a daily manifest already holds.
  const attached = await db.dispatchManifestLine.findMany({
    where: { orderId: { in: lineIds } },
    select: { orderId: true },
  });
  if (attached.length)
    return { ok: false, error: "Some selected orders are already on a manifest" };
  await db.dispatchManifest.create({
    data: {
      number: manifestNumber,
      kind,
      riderId: kind === "Rider" ? riderId : undefined,
      deliveryCompanyId: kind === "Courier" ? deliveryCompanyId : undefined,
      status: "Open" as const,
      lines: {
        create: lineIds.map((oid) => ({ orderId: oid })),
      },
    },
  });
  revalidatePath("/admin/dispatch");
  return { ok: true };
}

/**
 * Opens today's manifest for every active courier (§5.5) so shipments can
 * auto-attach to a per-courier, per-day handover sheet.
 */
export async function openDailyManifests(): Promise<AdminActionResult> {
  await requireAdmin();
  const result = await openDailyCourierManifests();
  revalidatePath("/admin/dispatch");
  return { ok: true, created: result.created };
}

export async function handoverManifest(id: string): Promise<AdminActionResult> {
  await requireAdmin();
  const result = await handoverDispatchManifest(id);
  if (!result.ok) return result;
  revalidatePath("/admin/dispatch");
  revalidatePath("/admin/orders");
  revalidatePath("/admin/shipments");
  return { ok: true, orderNumber: result.number };
}

export async function saveShipment(
  _prev: AdminActionResult | null,
  formData: FormData,
): Promise<AdminActionResult> {
  await requireAdmin();
  const orderId = String(formData.get("orderId") || "").trim();
  const trackingNumber = String(formData.get("trackingNumber") || "").trim();
  const deliveryCompanyId = String(formData.get("deliveryCompanyId") || "").trim() || undefined;
  if (!orderId || !trackingNumber)
    return { ok: false, error: "Order ID and tracking number required" };
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order) return { ok: false, error: "Order not found" };
  const existing = await db.shipment.findUnique({ where: { orderId } });
  if (existing) return { ok: false, error: "Shipment already exists for this order" };
  await db.shipment.create({
    data: {
      orderId,
      deliveryCompanyId,
      trackingNumber,
      status: "Pending" as const,
      providerMode: "Manual" as const,
    },
  });
  // Same best-effort manifest roll-up as createShipment (§5.5).
  let warning: string | undefined;
  if (deliveryCompanyId) {
    try {
      await attachOrderToDailyManifest({ orderId, deliveryCompanyId });
    } catch (error) {
      // Best-effort step: a manifest hiccup must never block dispatch, but it
      // is still recorded so a missing manifest entry stays traceable.
      log.warn("saveShipment manifest attach failed", { orderId, error });
      warning =
        "Shipment saved, but today's courier manifest was not updated — attach the order to the manifest manually.";
    }
  }
  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin/shipments");
  revalidatePath("/admin/dispatch");
  return { ok: true, warning };
}

export async function deleteDeliveryCompany(id: string): Promise<AdminActionResult> {
  if (!recordId.safeParse(id).success)
    return { ok: false, error: "Invalid record. Refresh the page and try again" };
  await requireAdmin();
  if (await db.order.count({ where: { deliveryCompanyId: id } }))
    return { ok: false, error: "This company has order history. Deactivate it instead" };
  await db.deliveryCompany.delete({ where: { id } }).catch(() => undefined);
  revalidatePath("/admin/riders");
  revalidatePath("/admin/orders");
  return { ok: true };
}

export async function createPurchaseOrder(
  _prev: AdminActionResult | null,
  formData: FormData,
): Promise<AdminActionResult> {
  await requireAdmin();
  const supplierId = String(formData.get("supplierId") || "").trim();
  const supplierName = String(formData.get("supplierName") || "").trim();

  if (!supplierId || !supplierName) return { ok: false, error: "Supplier ID and name required" };

  const poNumber = `PO-${Date.now().toString().slice(-6)}`;

  await db.purchaseOrder.create({
    data: {
      number: poNumber,
      supplier: { connect: { id: supplierId } },
      status: "Draft",
    },
  });
  revalidatePath("/admin/purchase-orders");
  return { ok: true, poNumber };
}

export async function updatePurchaseOrderStatus(
  _prev: AdminActionResult | null,
  formData: FormData,
): Promise<AdminActionResult> {
  await requireAdmin();
  const poId = String(formData.get("poId") || "").trim();
  const status = String(formData.get("status") || "").trim() as PurchaseOrderStatus;
  if (!poId || !status) return { ok: false, error: "PO ID and status required" };

  const validStatuses: string[] = ["Draft", "Sent", "Partial", "Received", "Cancelled"];
  if (!validStatuses.includes(status)) return { ok: false, error: "Invalid status" };

  await db.purchaseOrder.update({
    where: { id: poId },
    data: { status },
  });
  revalidatePath("/admin/purchase-orders");
  return { ok: true };
}

export async function createReceipt(
  _prev: AdminActionResult | null,
  formData: FormData,
): Promise<AdminActionResult> {
  await requireOpsEditor();
  const poId = String(formData.get("poId") || "").trim();
  const warehouseId = String(formData.get("warehouseId") || "").trim();
  const receiverId = String(formData.get("receiverId") || "").trim();
  const notes = String(formData.get("notes") || "").trim() || undefined;

  if (!poId || !warehouseId || !receiverId)
    return { ok: false, error: "PO ID, warehouse ID, and receiver ID required" };

  const po = await db.purchaseOrder.findUnique({ where: { id: poId } });
  if (!po) return { ok: false, error: "PO not found" };

  const linesInput = String(formData.get("lines") || "").trim();
  type ReceiptLineInput = {
    productId: string;
    qtyAccepted?: number;
    qtyRejected?: number;
    condition?: string;
    unitCostCents?: number;
  };
  const lineDetails = JSON.parse(linesInput) as ReceiptLineInput[];

  if (!lineDetails || !lineDetails.length)
    return { ok: false, error: "At least one line required" };

  await db.$transaction(async (tx) => {
    await tx.purchaseOrder.update({
      where: { id: poId },
      data: { status: "Partial" },
    });
    await tx.receipt.create({
      data: {
        purchaseOrder: { connect: { id: poId } },
        warehouse: { connect: { id: warehouseId } },
        receivedById: receiverId,
        note: notes,
        lines: {
          create: lineDetails.map((ld) => ({
            productId: ld.productId,
            qtyAccepted: ld.qtyAccepted ?? 0,
            qtyRejected: ld.qtyRejected ?? 0,
            condition: ld.condition ?? "Good",
            unitCostCents: ld.unitCostCents,
          })),
        },
      },
    });

    for (const line of lineDetails) {
      const product = await tx.product.findUnique({ where: { id: line.productId } });
      if (!product) continue;

      const accepted = line.qtyAccepted ?? 0;
      if (accepted > 0) {
        const stockLevel = await tx.stockLevel.findFirst({
          where: { warehouseId, productId: line.productId },
        });
        if (stockLevel) {
          await tx.stockLevel.update({
            where: { id: stockLevel.id },
            data: { qty: { increment: accepted } },
          });
        }

        await tx.product.update({
          where: { id: line.productId },
          data: { stock: { increment: accepted } },
        });

        if (line.unitCostCents !== undefined) {
          await tx.product.update({
            where: { id: line.productId },
            data: { costCents: line.unitCostCents },
          });
        }

        await tx.stockMovement.create({
          data: {
            warehouseId,
            productId: line.productId,
            delta: accepted,
            reason: "Receiving",
            reasonCode: "Receiving",
            referenceId: poId,
            actorId: receiverId,
            actorName: null,
          },
        });
      }
    }
  });
  revalidatePath("/admin/purchase-orders");
  revalidatePath("/warehouse/receiving");
  return { ok: true };
}

export async function createPickList(
  _prev: AdminActionResult | null,
  formData: FormData,
): Promise<AdminActionResult> {
  await requireOpsEditor();
  const orderId = String(formData.get("orderId") || "").trim();
  if (!orderId) return { ok: false, error: "Order ID required" };

  const order = await db.order.findUnique({
    where: { id: orderId },
    include: { items: { include: { product: true } } },
  });
  if (!order) return { ok: false, error: "Order not found" };
  if (order.status !== "Packing") return { ok: false, error: "Order must be in Packing status" };

  const existing = await db.pickList.findUnique({ where: { orderId } });
  if (existing) return { ok: false, error: "Pick list already exists for this order" };

  const pickList = await db.pickList.create({
    data: {
      orderId,
      status: "Picking",
      lines: {
        create: order.items.map((item) => ({
          orderItemId: item.id,
          qtyOrdered: item.quantity,
        })),
      },
    },
    include: { lines: true },
  });

  revalidatePath("/admin/pick");
  revalidatePath("/warehouse/pick");
  return { ok: true, pickListId: pickList.id };
}

export async function pickItem(
  _prev: AdminActionResult | null,
  formData: FormData,
): Promise<AdminActionResult> {
  await requireOpsEditor();
  const pickListId = String(formData.get("pickListId") || "").trim();
  const orderItemId = String(formData.get("orderItemId") || "").trim();
  const qtyPicked = Number(formData.get("qtyPicked") || "0");
  const shortPickQty = Number(formData.get("shortPickQty") || "0");
  const shortPickReason = String(formData.get("shortPickReason") || "").trim() || undefined;

  if (!pickListId || !orderItemId || qtyPicked < 0 || shortPickQty < 0)
    return { ok: false, error: "Invalid pick data" };

  const pickList = await db.pickList.findUnique({
    where: { id: pickListId },
    include: { lines: true },
  });
  if (!pickList) return { ok: false, error: "Pick list not found" };
  if (pickList.status !== "Picking")
    return { ok: false, error: "Pick list is not in Picking status" };

  const line = pickList.lines.find((l) => l.orderItemId === orderItemId);
  if (!line) return { ok: false, error: "Order item not in pick list" };
  if (line.qtyPicked > 0) return { ok: false, error: "Line already picked" };

  const newQtyPicked = qtyPicked + shortPickQty;
  if (newQtyPicked !== line.qtyOrdered && shortPickQty === 0 && !shortPickReason)
    return { ok: false, error: "Short pick requires a reason" };

  await db.pickListLine.update({
    where: { id: line.id },
    data: {
      qtyPicked,
      shortPickQty,
      shortPickReason: shortPickQty > 0 ? shortPickReason : undefined,
    },
  });

  revalidatePath(`/admin/pick/${pickListId}`);
  revalidatePath(`/warehouse/pick/${pickListId}`);
  return { ok: true };
}

export async function markPicked(
  _prev: AdminActionResult | null,
  formData: FormData,
): Promise<AdminActionResult> {
  await requireOpsEditor();
  const pickListId = String(formData.get("pickListId") || "").trim();
  if (!pickListId) return { ok: false, error: "Pick list ID required" };

  const pickList = await db.pickList.findUnique({ where: { id: pickListId } });
  if (!pickList) return { ok: false, error: "Pick list not found" };
  if (pickList.status !== "Picking")
    return { ok: false, error: "Pick list is not in Picking status" };

  await db.pickList.update({
    where: { id: pickListId },
    data: { status: "Picked", pickedAt: new Date() },
  });

  revalidatePath("/admin/pick");
  revalidatePath(`/admin/pick/${pickListId}`);
  revalidatePath("/warehouse/pick");
  revalidatePath(`/warehouse/pick/${pickListId}`);
  return { ok: true };
}

export async function confirmPackLine(
  _prev: AdminActionResult | null,
  formData: FormData,
): Promise<AdminActionResult> {
  await requireOpsEditor();
  const pickListId = String(formData.get("pickListId") || "").trim();
  const orderItemId = String(formData.get("orderItemId") || "").trim();
  if (!pickListId || !orderItemId)
    return { ok: false, error: "Pick list ID and order item ID required" };

  const pickList = await db.pickList.findUnique({
    where: { id: pickListId },
    include: { lines: true },
  });
  if (!pickList) return { ok: false, error: "Pick list not found" };
  if (pickList.status !== "Picked")
    return { ok: false, error: "Pick list is not in Picked status" };

  const line = pickList.lines.find((l) => l.orderItemId === orderItemId);
  if (!line) return { ok: false, error: "Order item not in pick list" };
  if (line.confirmed) return { ok: false, error: "Line already confirmed" };
  if (line.qtyPicked === 0) return { ok: false, error: "Line must be picked first" };

  await db.pickListLine.update({
    where: { id: line.id },
    data: { confirmed: true, confirmedAt: new Date() },
  });

  revalidatePath(`/admin/pack/${pickListId}`);
  revalidatePath(`/warehouse/pack/${pickListId}`);
  return { ok: true };
}

export async function markPacked(
  _prev: AdminActionResult | null,
  formData: FormData,
): Promise<AdminActionResult> {
  await requireOpsEditor();
  const pickListId = String(formData.get("pickListId") || "").trim();
  if (!pickListId) return { ok: false, error: "Pick list ID required" };

  const pickList = await db.pickList.findUnique({
    where: { id: pickListId },
    include: { lines: true, order: true },
  });
  if (!pickList) return { ok: false, error: "Pick list not found" };
  if (pickList.status !== "Picked")
    return { ok: false, error: "Pick list is not in Picked status" };

  const allConfirmed = pickList.lines.every((l) => l.confirmed);
  if (!allConfirmed) return { ok: false, error: "All lines must be confirmed before packing" };

  await db.$transaction(async (tx) => {
    await tx.pickList.update({
      where: { id: pickListId },
      data: { status: "Packed", packedAt: new Date() },
    });
    await tx.order.update({
      where: { id: pickList.orderId },
      data: { status: "Packed", shippedAt: new Date() },
    });
  });

  revalidatePath("/admin/pack");
  revalidatePath(`/admin/pack/${pickListId}`);
  revalidatePath("/admin/orders");
  revalidatePath("/warehouse/pack");
  revalidatePath(`/warehouse/pack/${pickListId}`);
  return { ok: true };
}

export async function getPickQueue(): Promise<AdminActionResult> {
  await requireOpsEditor();
  const pickLists = await db.pickList.findMany({
    where: { status: "Picking" },
    include: {
      order: true,
      lines: { include: { orderItem: { include: { product: true } } } },
    },
    orderBy: { createdAt: "asc" },
  });
  return { ok: true, pickLists };
}

export async function getPackQueue(): Promise<AdminActionResult> {
  await requireOpsEditor();
  const pickLists = await db.pickList.findMany({
    where: { status: "Picked" },
    include: {
      order: true,
      lines: { include: { orderItem: { include: { product: true } } } },
    },
    orderBy: { pickedAt: "asc" },
  });
  return { ok: true, pickLists };
}

export async function createWarehouse(
  _prev: AdminActionResult | null,
  formData: FormData,
): Promise<AdminActionResult> {
  await requireAdmin();
  const name = String(formData.get("name") || "").trim();
  const code = String(formData.get("code") || "")
    .trim()
    .toUpperCase();
  const address = String(formData.get("address") || "").trim() || undefined;
  const isDefault = formData.get("isDefault") === "on";

  if (!name || !code) return { ok: false, error: "Name and code required" };

  await db.warehouse.create({
    data: { name, code, address, isDefault },
  });
  revalidatePath("/admin/warehouse");
  return { ok: true };
}

export async function updateWarehouse(
  _prev: AdminActionResult | null,
  formData: FormData,
): Promise<AdminActionResult> {
  await requireAdmin();
  const id = String(formData.get("id") || "").trim();
  const name = String(formData.get("name") || "").trim();
  const code = String(formData.get("code") || "")
    .trim()
    .toUpperCase();
  const address = String(formData.get("address") || "").trim() || undefined;
  const isDefault = formData.get("isDefault") === "on";
  const active = formData.get("active") === "on";

  if (!id || !name || !code) return { ok: false, error: "ID, name, and code required" };

  await db.warehouse.update({
    where: { id },
    data: { name, code, address, isDefault, active },
  });
  revalidatePath("/admin/warehouse");
  return { ok: true };
}

export async function toggleWarehouse(
  _prev: AdminActionResult | null,
  formData: FormData,
): Promise<AdminActionResult> {
  await requireAdmin();
  const id = String(formData.get("id") || "").trim();
  const active = formData.get("active") === "true";
  if (!id) return { ok: false, error: "ID required" };

  await db.warehouse.update({
    where: { id },
    data: { active },
  });
  revalidatePath("/admin/warehouse");
  return { ok: true };
}

export async function createStocktakeAdjustment(
  _prev: AdminActionResult | null,
  formData: FormData,
): Promise<AdminActionResult> {
  const actor = await requireOpsEditor();
  const warehouseId = String(formData.get("warehouseId") || "").trim();
  const productId = String(formData.get("productId") || "").trim();
  const countedQty = Number(formData.get("countedQty") || "0");

  if (!warehouseId || !productId || countedQty < 0)
    return { ok: false, error: "Invalid stocktake data" };

  const stockLevel = await db.stockLevel.findFirst({
    where: { warehouseId, productId },
  });
  if (!stockLevel) return { ok: false, error: "Stock level not found" };

  const delta = countedQty - stockLevel.qty;

  if (delta !== 0) {
    await db.$transaction(async (tx) => {
      await tx.stockLevel.update({
        where: { id: stockLevel.id },
        data: { qty: countedQty },
      });

      // Keep the sellable total in parity with the per-warehouse count.
      await tx.product.update({
        where: { id: productId },
        data: { stock: { increment: delta } },
      });

      await tx.inventoryAdjustment.create({
        data: {
          productId,
          warehouseId,
          delta,
          previousStock: stockLevel.qty,
          newStock: countedQty,
          reason: delta > 0 ? "Restock" : "Dispatch",
          reasonCode: delta > 0 ? "Restock" : "Dispatch",
          requestKey: randomUUID(),
          actorId: actor.id,
          actorName: actor.name ?? "Stocktake",
          expectedUpdatedAt: new Date(),
        },
      });

      await tx.stockMovement.create({
        data: {
          warehouseId,
          productId,
          delta,
          reason: "Stocktake",
          reasonCode: "Stocktake",
          referenceId: stockLevel.id,
          actorId: actor.id,
          actorName: actor.name ?? "Stocktake",
        },
      });
    });
  }

  revalidatePath("/warehouse/stocktake");
  revalidatePath("/warehouse/stock");
  revalidatePath("/admin/warehouse/stock");
  return { ok: true };
}

export async function createShipment(
  _prev: AdminActionResult | null,
  formData: FormData,
): Promise<AdminActionResult> {
  await requireAdmin();
  const orderId = String(formData.get("orderId") || "").trim();
  const trackingNumber = String(formData.get("trackingNumber") || "").trim();
  const requestedCompanyId = String(formData.get("deliveryCompanyId") || "").trim();
  const providerMode = String(formData.get("providerMode") || "Manual") as "Manual" | "Api";
  const status = String(formData.get("status") || "Pending") as
    "Pending" | "Created" | "InTransit" | "OutForDelivery" | "Delivered" | "Failed" | "Returned";

  if (!orderId) return { ok: false, error: "Order ID required" };

  const order = await db.order.findUnique({
    where: { id: orderId },
    include: { deliveryCompany: true },
  });
  if (!order) return { ok: false, error: "Order not found" };
  const existingShipment = await db.shipment.findUnique({ where: { orderId } });
  if (existingShipment) return { ok: false, error: "Shipment already exists for this order" };

  // Carrier selection: "auto" runs the live-ranking picker; an explicit
  // choice wins; otherwise fall back to the carrier routed at checkout.
  let selectionReason: string | null = null;
  // §10 cost/parcel: persist the effective quote (post volume discount) so
  // the delivery scorecard can average real carrier spend.
  let quotedCostCents: number | null = null;
  let deliveryCompanyId = requestedCompanyId || order.deliveryCompanyId || undefined;
  if (requestedCompanyId === "auto") {
    const selection = await selectCarrierForOrder(orderId);
    if (!selection.ok) return { ok: false, error: selection.error };
    deliveryCompanyId = selection.companyId;
    selectionReason = selection.reason;
    quotedCostCents = selection.rateCents;
  }

  const company = deliveryCompanyId
    ? await db.deliveryCompany.findUnique({ where: { id: deliveryCompanyId } })
    : null;

  let trackingNumberFinal = trackingNumber || null;
  let statusFinal = status;
  let labelUrl: string | null = null;
  let savedMode: "Manual" | "Api" = "Manual";
  /** Caveats worth surfacing to the operator as a warning toast (never fatal). */
  let dispatchWarning: string | undefined;

  if (providerMode === "Api") {
    // Resolves by providerKey (steadfast/pathao/redx) with that row's
    // credentials; unknown providers resolve to the manual adapter.
    const adapter = resolveCourierAdapter(company);
    if (adapter.isApi) {
      try {
        const result = await adapter.createShipment({
          parcel: orderToParcel(order),
          trackingNumber: trackingNumber || undefined,
        });
        trackingNumberFinal = result.trackingNumber;
        statusFinal = result.status as typeof status;
        labelUrl = result.labelUrl;
        savedMode = "Api";
      } catch (error) {
        // API onboarding failures must never block dispatch: keep the
        // shipment in manual mode so the parcel still ships today.
        if (!(error instanceof CourierApiError)) {
          log.error("createShipment courier onboarding failed", { error, orderId });
          throw error;
        }
        log.warn("createShipment courier onboarding rejected", {
          orderId,
          provider: error.provider,
          code: error.code,
        });
        dispatchWarning = `Shipment saved in manual mode — ${error.provider} API rejected the booking (${error.code}); book it with the courier and update tracking by hand.`;
      }
    }
  }

  await db.shipment.create({
    data: {
      orderId,
      deliveryCompanyId: deliveryCompanyId ?? null,
      trackingNumber: trackingNumberFinal,
      status: statusFinal,
      providerMode: savedMode,
      labelUrl,
      costCents: quotedCostCents,
      handedOverAt: savedMode === "Api" ? new Date() : null,
    },
  });

  // Roll the order into today's manifest for its courier. Best-effort:
  // a manifest hiccup must never block the parcel leaving the warehouse.
  if (deliveryCompanyId) {
    try {
      await attachOrderToDailyManifest({ orderId, deliveryCompanyId });
    } catch (error) {
      // Best-effort step: a manifest hiccup must never block dispatch, but it
      // is still recorded so a missing manifest entry stays traceable.
      log.warn("createShipment manifest attach failed", { orderId, error });
      dispatchWarning ??=
        "Shipment saved, but today's courier manifest was not updated — attach the order to the manifest manually.";
    }
  }

  await db.order.update({
    where: { id: orderId },
    data: {
      status: "Shipped",
      shippedAt: new Date(),
      deliveryCompanyId: deliveryCompanyId ?? order.deliveryCompanyId ?? null,
    },
  });

  await db.orderEvent.create({
    data: {
      orderId,
      type: "Shipped",
      actorId: "system",
      actorName: "System",
      actorRole: "System",
      message: `Shipment created (${savedMode === "Api" ? (company?.name ?? "carrier API") : "manual"}): ${trackingNumberFinal || "auto-generated"}${selectionReason ? ` — ${selectionReason}` : ""}`,
    },
  });

  revalidatePath("/admin/orders");
  revalidatePath("/admin/shipments");
  revalidatePath("/admin/dispatch");
  return { ok: true, warning: dispatchWarning };
}

export async function syncShipmentStatus(
  _prev: AdminActionResult | null,
  formData: FormData,
): Promise<AdminActionResult> {
  await requireAdmin();
  const shipmentId = String(formData.get("shipmentId") || "").trim();
  if (!shipmentId) return { ok: false, error: "Shipment ID required" };

  const shipment = await db.shipment.findUnique({
    where: { id: shipmentId },
    include: { deliveryCompany: true },
  });
  if (!shipment) return { ok: false, error: "Shipment not found" };

  // Same code path as the scheduled batch job (§5.5), minus the staleness
  // lease — an operator clicking Sync now always gets a fresh fetch.
  let outcome;
  try {
    outcome = await syncShipmentRecord(shipment);
  } catch (error) {
    if (!(error instanceof CourierApiError)) {
      log.error("syncShipmentStatus failed", { error, shipmentId });
      throw error;
    }
    log.warn("syncShipmentStatus rejected", {
      shipmentId,
      provider: error.provider,
      code: error.code,
    });
    return { ok: false, error: `Sync failed (${error.code}); try again later` };
  }
  if (!outcome.ok)
    return {
      ok: false,
      error: outcome.error
        ? outcome.error.includes("sync failed")
          ? `${outcome.error}; try again later`
          : outcome.error
        : "Sync failed; try again later",
    };

  revalidatePath("/admin/shipments");
  revalidatePath(`/admin/shipments/${shipmentId}`);
  return { ok: true };
}

const adminUserSchema = z.object({
  name: personName,
  email: emailAddress,
  phone: optionalContactPhone,
  password: passwordValue,
  roles: z.preprocess(
    (value) => (Array.isArray(value) ? value : value == null ? [] : [value]),
    z.array(z.enum(Roles)).min(1, "Select at least one role"),
  ),
});

const adminUserRolesSchema = z.object({
  id: recordId,
  roles: z.preprocess(
    (value) => (Array.isArray(value) ? value : value == null ? [] : [value]),
    z.array(z.enum(Roles)).min(1, "Select at least one role"),
  ),
});

function normalizeRoles(roles: Role[]): Role[] {
  return Array.from(new Set(roles)).sort();
}

async function syncUserRoleAssignments(
  tx: Prisma.TransactionClient,
  userId: string,
  roles: Role[],
) {
  const t = tx as Prisma.TransactionClient & {
    appRole?: {
      findMany: (args: {
        where: { name: { in: string[] } };
        select: { id: true; name: true };
      }) => Promise<Array<{ id: string; name: string }>>;
    };
    userAppRole?: {
      deleteMany: (args: { where: { userId: string } }) => Promise<unknown>;
      createMany: (args: {
        data: Array<{ userId: string; roleId: string }>;
        skipDuplicates: true;
      }) => Promise<unknown>;
    };
  };
  if (!t.appRole || !t.userAppRole) return;
  const roleRows = await t.appRole.findMany({
    where: { name: { in: roles } },
    select: { id: true, name: true },
  });
  await t.userAppRole.deleteMany({ where: { userId } });
  if (roleRows.length) {
    await t.userAppRole.createMany({
      data: roleRows.map((role) => ({ userId, roleId: role.id })),
      skipDuplicates: true,
    });
  }
}

export async function createUserAction(
  _prev: AdminActionResult | null,
  formData: FormData,
): Promise<AdminActionResult> {
  await requireAdmin();
  const parsed = adminUserSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    password: formData.get("password"),
    roles: formData.getAll("roles"),
  });
  if (!parsed.success) return { ok: false, ...validationFailure(parsed.error) };
  const email = parsed.data.email.toLowerCase().trim();
  const phone = parsed.data.phone ? canonicalPhone(parsed.data.phone) : null;
  if (phone && phone.length < 6)
    return { ok: false, ...fieldFailure("phone", "Enter a valid phone number") };
  const existingByEmail = await db.user.findUnique({
    where: { email },
    select: { id: true, email: true, phone: true },
  });
  if (existingByEmail)
    return { ok: false, ...fieldFailure("email", "An account with this email already exists") };
  if (phone) {
    const candidates = await db.user.findMany({
      where: { phone: { not: null } },
      select: { id: true, email: true, phone: true },
    });
    const phoneMatches = candidates.filter(
      (user) => user.phone && canonicalPhone(user.phone) === phone,
    );
    if (phoneMatches.length === 1)
      return {
        ok: false,
        ...fieldFailure(
          "phone",
          "An account with this phone already exists. Use role assignment on that account instead.",
        ),
      };
    if (phoneMatches.length > 1)
      return {
        ok: false,
        ...fieldFailure(
          "phone",
          "This phone belongs to multiple accounts. Resolve duplicate accounts before assigning roles.",
        ),
      };
  }
  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  const roles = normalizeRoles(parsed.data.roles);
  try {
    const user = await db.$transaction(async (tx) => {
      if (phone) {
        const candidates = await tx.user.findMany({
          where: { phone: { not: null } },
          select: { id: true, phone: true },
        });
        const duplicate = candidates.find(
          (candidate) => candidate.phone && canonicalPhone(candidate.phone) === phone,
        );
        if (duplicate) throw Object.assign(new Error("PHONE_EXISTS"), { code: "PHONE_EXISTS" });
      }
      const created = await tx.user.create({
        data: { email, name: parsed.data.name, phone: phone || null, passwordHash, roles },
      });
      await syncUserRoleAssignments(tx, created.id, roles);
      return created;
    });
    revalidatePath("/admin/users");
    revalidatePath("/admin/customers");
    revalidatePath("/admin/wallets");
    return { ok: true, id: user.id };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "PHONE_EXISTS")
      return {
        ok: false,
        ...fieldFailure(
          "phone",
          "An account with this phone already exists. Use role assignment on that account instead.",
        ),
      };
    if (isDuplicateError(error))
      return { ok: false, error: "An account with this email or phone already exists" };
    log.error("createUserAction failed", { error });
    return { ok: false, error: "Could not create the user. Please try again." };
  }
}

export async function updateUserRoles(
  _prev: AdminActionResult | null,
  formData: FormData,
): Promise<AdminActionResult> {
  const admin = await requireAdmin();
  const parsed = adminUserRolesSchema.safeParse({
    id: formData.get("id"),
    roles: formData.getAll("roles"),
  });
  if (!parsed.success) return { ok: false, ...validationFailure(parsed.error) };
  const roles = normalizeRoles(parsed.data.roles);
  try {
    await db.$transaction(async (tx) => {
      await lockAccountStatus(tx);
      const [actor, user] = await Promise.all([
        tx.user.findFirst({
          where: { id: admin.id, active: true, roles: { has: Roles.Admin } },
          select: { id: true },
        }),
        tx.user.findUnique({
          where: { id: parsed.data.id },
          select: { id: true, active: true, roles: true },
        }),
      ]);
      if (!actor) throw new Error("Only an active administrator can change user roles.");
      if (!user) throw new Error("Account not found.");
      if (user.active && user.roles.includes(Roles.Admin) && !roles.includes(Roles.Admin)) {
        const otherAdmins = await tx.user.count({
          where: { id: { not: user.id }, active: true, roles: { has: Roles.Admin } },
        });
        if (otherAdmins < 1) throw new Error("At least one active administrator must remain.");
      }
      if (
        user.id === admin.id &&
        user.roles.includes(Roles.Admin) &&
        !roles.includes(Roles.Admin)
      ) {
        throw new Error("You cannot remove your own administrator role.");
      }
      const rolesChanged = JSON.stringify(normalizeRoles(user.roles)) !== JSON.stringify(roles);
      await tx.user.update({
        where: { id: user.id },
        data: {
          roles,
          ...(rolesChanged ? { sessionVersion: { increment: 1 } } : {}),
        },
      });
      await syncUserRoleAssignments(tx, user.id, roles);
      if (rolesChanged) {
        await tx.loginChallenge.updateMany({
          where: { userId: user.id, consumedAt: null },
          data: { consumedAt: new Date() },
        });
      }
    });
    revalidatePath("/admin/users");
    revalidatePath("/admin/riders");
    revalidatePath("/admin/customers");
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (error) {
    const message =
      error instanceof Error && !error.message.includes("prisma")
        ? error.message
        : "Could not update user roles. Please try again.";
    if (error instanceof Error && !error.message.includes("prisma"))
      log.warn("updateUserRoles rejected", { userId: parsed.data.id, message });
    else log.error("updateUserRoles failed", { error, userId: parsed.data.id });
    return { ok: false, error: message };
  }
}
