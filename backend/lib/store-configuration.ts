import "server-only";
import { z } from "zod";
import { db } from "./db";
import { Roles } from "./enums.mjs";
import {
  personName,
  safeLink,
  emailAddress,
  optionalContactPhone,
  shortText,
  moneyAmount,
  validationFailure,
  fieldFailure,
} from "./form-validation";
import { saveResizedLogoImage } from "./upload-image";
import { logger } from "./logger";

const log = logger.child({ scope: "store-configuration" });

export const settingsSchema = z.object({
  referralEnabled: z.preprocess(
    (value) => (value === "on" || value === "true" ? true : value === "false" ? false : value),
    z.boolean().default(true),
  ),
  referralRewardAmount: z
    .string()
    .trim()
    .regex(/^\d{1,6}(\.\d{1,2})?$/, "Enter a valid amount with up to 2 decimal places")
    .transform((value) => Math.round(Number(value) * 100))
    .refine((value) => value <= 10_000_000, "Reward cannot exceed 100,000")
    .optional(),
  storeName: personName,
  logoUrl: safeLink.optional(),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  currencySymbol: z.string().trim().min(1, "Enter a currency symbol").max(4),
  currencyCode: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{3}$/, "Enter a 3-letter currency code")
    .transform((value) => value.toUpperCase()),
  language: z.enum(["en", "bn"], { error: "Choose English or Bengali" }),
  contactEmail: emailAddress.optional().or(z.literal("")),
  contactPhone: optionalContactPhone,
  address: z.string().trim().max(500).optional(),
  headerAnnouncement: z.string().trim().max(200, "Use at most 200 characters").optional(),
  headerAnnouncementBackground: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Choose a valid announcement background color")
    .default("#e6f4ec"),
  headerAnnouncementDirection: z.enum(["left", "right"]).default("left"),
  headerAnnouncementSpeed: z.coerce
    .number()
    .int()
    .min(8, "Speed must be at least 8 seconds")
    .max(90, "Speed cannot exceed 90 seconds")
    .default(24),
  headerSupportLabel: z.string().trim().max(60, "Use at most 60 characters").optional(),
  emailVerificationSubject: z
    .string()
    .trim()
    .min(1, "Enter an email subject")
    .max(150, "Use at most 150 characters"),
  emailVerificationBody: z
    .string()
    .trim()
    .min(1, "Enter the email verification message")
    .max(2000, "Use at most 2000 characters")
    .refine((value) => value.includes("{{code}}"), "Message must contain the {{code}} placeholder"),
  smsVerificationBody: z
    .string()
    .trim()
    .min(1, "Enter the SMS verification message")
    .max(500, "Use at most 500 characters")
    .refine((value) => value.includes("{{code}}"), "Message must contain the {{code}} placeholder"),
  careerNotificationEmail: z.preprocess(
    (value) => (value === null ? undefined : value),
    emailAddress.optional().or(z.literal("")),
  ),
  careerEmailSubject: z
    .string()
    .trim()
    .min(1, "Enter an application email subject")
    .max(150, "Use at most 150 characters"),
  careerEmailBody: z
    .string()
    .trim()
    .min(1, "Enter the application notification message")
    .max(5000, "Use at most 5000 characters")
    .refine((value) => value.includes("{{jobTitle}}"), "Message must contain {{jobTitle}}"),
  deliveryEstimate: shortText.optional(),
  deliveryFeeCents: moneyAmount,
  returnWindowDays: z.coerce
    .number()
    .int()
    .min(0, "Return window cannot be negative")
    .max(90, "Return window cannot exceed 90 days"),
  freeShippingOverCents: z.preprocess(
    (value) => (value === "" || value === null ? undefined : value),
    moneyAmount.optional(),
  ),
});

export async function saveStoreConfiguration(
  actorId: string,
  input: unknown,
): Promise<{ ok: boolean; error?: string; fieldErrors?: Record<string, string[]> }> {
  const fields: Record<string, unknown> =
    input && typeof input === "object" ? { ...(input as Record<string, unknown>) } : {};
  const rawLogoFile = fields.logoFile;
  delete fields.logoFile;
  const logoFile =
    typeof File !== "undefined" && rawLogoFile instanceof File && rawLogoFile.size > 0
      ? rawLogoFile
      : null;
  if (logoFile && logoFile.size > 5 * 1024 * 1024)
    return { ok: false, ...fieldFailure("logoFile", "Store logo must be 5 MB or smaller") };
  if (logoFile && !["image/jpeg", "image/png", "image/webp", "image/avif"].includes(logoFile.type))
    return {
      ok: false,
      ...fieldFailure("logoFile", "Use a JPEG, PNG, WebP or AVIF image for the store logo"),
    };
  const parsed = settingsSchema.safeParse(fields);
  if (!parsed.success) return { ok: false, ...validationFailure(parsed.error) };
  const value = parsed.data;
  let uploadedLogoUrl: string | null = null;
  if (logoFile) {
    try {
      uploadedLogoUrl = await saveResizedLogoImage(logoFile);
    } catch (error) {
      log.warn("store logo rejected", { error });
      return {
        ok: false,
        ...fieldFailure(
          "logoFile",
          error instanceof Error ? error.message : "Could not process the store logo",
        ),
      };
    }
  }
  const { referralRewardAmount, ...configuration } = value;
  return db.$transaction(async (tx) => {
    // Acquire before touching settings rows; activity triggers take the shared counterpart.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('store-currency'))::text`;
    const admin = await tx.user.findFirst({
      where: { id: actorId, active: true, roles: { has: Roles.Admin } },
      select: { id: true },
    });
    if (!admin) return { ok: false, error: "An active administrator account is required" };
    const existing = await tx.storeSettings.findUnique({ where: { singletonKey: 1 } });
    if (!existing) return { ok: false, error: "Store settings not found" };
    if (value.currencyCode !== existing.currencyCode && existing.currencyLockedAt)
      return {
        ok: false,
        ...fieldFailure(
          "currencyCode",
          "Currency is locked after products or monetary activity exist. Existing prices, wallet credit and refunds cannot be relabeled",
        ),
      };
    await tx.storeSettings.update({
      where: { id: existing.id },
      data: {
        ...configuration,
        ...(referralRewardAmount !== undefined
          ? { referralRewardCents: referralRewardAmount }
          : {}),
        logoUrl: (uploadedLogoUrl ?? value.logoUrl) || null,
        contactEmail: value.contactEmail || null,
        careerNotificationEmail: value.careerNotificationEmail || null,
        contactPhone: value.contactPhone || null,
        address: value.address || null,
        headerAnnouncement: value.headerAnnouncement || null,
        headerSupportLabel: value.headerSupportLabel || null,
        deliveryEstimate: value.deliveryEstimate || "12-24 HOURS",
        freeShippingOverCents: value.freeShippingOverCents ?? null,
      },
    });
    return { ok: true };
  });
}
