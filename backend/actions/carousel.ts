"use server";

import {
  recordId,
  safeLink,
  checkboxValue,
  fieldFailure,
  validationFailure,
} from "../lib/form-validation";
import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import { db } from "../lib/db";
import { requireAdmin } from "../lib/session";
import { saveResizedBannerImage } from "../lib/upload-image";
import type { AdminActionResult } from "./admin";
import { logger } from "../lib/logger";

const log = logger.child({ scope: "action:carousel" });

const slideSchema = z.object({
  id: recordId.optional(),
  title: z.string().trim().max(120, "Use at most 120 characters").optional().or(z.literal("")),
  imageUrl: safeLink.optional(),
  linkUrl: safeLink.optional(),
  campaignId: z.string().trim().max(100).optional().or(z.literal("")),
  order: z.coerce.number().int("Enter a whole display order").min(0).max(1000000).default(0),
  active: checkboxValue,
});

export async function saveSlide(
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
    return { ok: false, ...fieldFailure("bannerFile", "Slide image must be 5 MB or smaller") };
  if (
    bannerFile &&
    !["image/jpeg", "image/png", "image/webp", "image/avif"].includes(bannerFile.type)
  )
    return {
      ok: false,
      ...fieldFailure("bannerFile", "Use a JPEG, PNG, WebP or AVIF image"),
    };
  const parsed = slideSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, ...validationFailure(parsed.error) };
  const d = parsed.data;
  let uploadedImageUrl: string | null = null;
  if (bannerFile) {
    try {
      uploadedImageUrl = await saveResizedBannerImage(bannerFile, {
        folder: "carousel",
        label: "Slide",
      });
    } catch (error) {
      log.warn("saveSlide banner rejected", { error });
      return {
        ok: false,
        ...fieldFailure(
          "bannerFile",
          error instanceof Error ? error.message : "Could not process this slide image",
        ),
      };
    }
  }
  const imageUrl = uploadedImageUrl || d.imageUrl?.trim();
  if (!imageUrl)
    return {
      ok: false,
      ...fieldFailure("bannerFile", "Upload a slide image or enter an image URL"),
    };
  let linkUrl = d.linkUrl?.trim() ?? "";
  if (d.campaignId) {
    const campaign = await db.campaign.findUnique({
      where: { id: d.campaignId },
      select: { id: true },
    });
    if (!campaign)
      return { ok: false, ...fieldFailure("campaignId", "Selected campaign no longer exists") };
    linkUrl = `/products?campaign=${campaign.id}`;
  }
  const data = {
    imageUrl,
    title: d.title || null,
    linkUrl,
    order: d.order,
    active: Boolean(d.active),
  };
  if (d.id) await db.carouselSlide.update({ where: { id: d.id }, data });
  else await db.carouselSlide.create({ data });
  updateTag("carousel");
  revalidatePath("/admin/carousel");
  revalidatePath("/");
  return { ok: true };
}

export async function deleteSlide(id: string): Promise<AdminActionResult> {
  if (!recordId.safeParse(id).success)
    return { ok: false, error: "Invalid record. Refresh the page and try again" };
  await requireAdmin();
  await db.carouselSlide.deleteMany({ where: { id } });
  updateTag("carousel");
  revalidatePath("/admin/carousel");
  revalidatePath("/");
  return { ok: true };
}
