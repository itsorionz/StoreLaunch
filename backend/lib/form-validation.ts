import { z } from "zod";
import { canonicalPhone } from "./phone";

export const recordId = z
  .string()
  .trim()
  .min(1, "Select a valid record")
  .max(100, "Invalid record");
export const personName = z
  .string()
  .trim()
  .min(2, "Enter at least 2 characters")
  .max(100, "Use at most 100 characters");
export const emailAddress = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, "Email is too long")
  .email("Enter a valid email address");
export const passwordValue = z
  .string()
  .min(8, "Use at least 8 characters")
  .max(72, "Use at most 72 characters")
  .refine(
    (value) => new TextEncoder().encode(value).length <= 72,
    "Password must be at most 72 UTF-8 bytes",
  );
export const registrationSchema = z
  .object({
    name: personName,
    email: emailAddress,
    password: passwordValue,
    confirmPassword: z
      .string({ error: "Re-enter your password" })
      .min(1, "Re-enter your password")
      .max(72, "Use at most 72 characters"),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });
export const phoneNumber = z
  .string()
  .trim()
  .max(30, "Phone number is too long")
  .refine(
    (value) => /^[+\d\s()-]+$/.test(value) && /^8801[3-9]\d{8}$/.test(canonicalPhone(value)),
    "Enter a valid Bangladesh mobile number (01XXXXXXXXX)",
  )
  .transform(canonicalPhone);
export const optionalPhone = phoneNumber.or(z.literal("")).optional();
export const contactPhone = z
  .string()
  .trim()
  .max(30, "Phone number is too long")
  .refine(
    (value) =>
      /^\+?[\d\s()-]+$/.test(value) &&
      value.replace(/\D/g, "").length >= 5 &&
      value.replace(/\D/g, "").length <= 15,
    "Enter a valid contact number or hotline",
  );
export const optionalContactPhone = contactPhone.or(z.literal("")).optional();
export const slugValue = z
  .string()
  .trim()
  .min(2, "Enter at least 2 characters")
  .max(160, "Use at most 160 characters")
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and single dashes");
export const shortText = z.string().trim().max(200, "Use at most 200 characters");
export const addressLine = z
  .string()
  .trim()
  .min(3, "Enter at least 3 characters")
  .max(300, "Use at most 300 characters");
export const moneyAmount = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.coerce
    .number({ error: "Enter a valid amount" })
    .int("Enter a whole amount in minor units")
    .min(0, "Amount cannot be negative")
    .max(1000000000, "Amount is too large"),
);
export const checkboxValue = z.preprocess(
  (value) => (value === undefined ? false : value),
  z
    .enum(["true", "on", "false"])
    .transform((value) => value === "true" || value === "on")
    .or(z.literal(false)),
);
export const safeLink = z
  .string()
  .trim()
  .max(2048, "URL is too long")
  .refine((value) => {
    if (!value) return true;
    if (/[\x00-\x20\\]/.test(value)) return false;
    if (value.startsWith("/") && !value.startsWith("//")) return true;
    try {
      return ["http:", "https:"].includes(new URL(value).protocol);
    } catch {
      return false;
    }
  }, "Enter an http(s) URL or a local path starting with /");
export const birthDate = z
  .string()
  .trim()
  .refine((value) => {
    if (!value) return true;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return (
      !Number.isNaN(date.getTime()) &&
      date.toISOString().slice(0, 10) === value &&
      date <= new Date() &&
      date.getUTCFullYear() >= 1900
    );
  }, "Enter a real birth date from 1900 through today");

const labels: Record<string, string> = {
  priceCents: "Price",
  salePriceCents: "Sale price",
  deliveryFeeCents: "Delivery fee",
  freeShippingOverCents: "Free shipping threshold",
  walletCents: "Wallet amount",
  amountCents: "Amount",
  categoryId: "Category",
  brandId: "Brand",
  parentId: "Parent category",
  line1: "Address",
  line2: "Landmark",
  dateOfBirth: "Date of birth",
  imageFiles: "Images",
  images: "Images",
  bannerFile: "Banner image",
  campaignId: "Campaign",
  linkUrl: "Link",
  code: "OTP",
  rating: "Rating",
};
export function fieldFailure(name: string, message: string) {
  return { error: message, fieldErrors: { [name]: [message] } };
}
export function validationFailure(error: z.ZodError) {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    const label =
      labels[key] ?? key.replace(/([A-Z])/g, " $1").replace(/^./, (value) => value.toUpperCase());
    (fieldErrors[key] ??= []).push(`${label}: ${issue.message}`);
  }
  return { error: Object.values(fieldErrors).flat().join(". "), fieldErrors };
}

export function uploadError(files: FormDataEntryValue[]): string | null {
  const uploads = files.filter((file): file is File => file instanceof File && file.size > 0);
  if (uploads.length > 5) return "Images: Upload at most 5 images at a time";
  if (uploads.some((file) => file.size > 5 * 1024 * 1024))
    return "Images: Each image must be 5 MB or smaller";
  if (
    uploads.some(
      (file) =>
        !["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"].includes(file.type),
    )
  )
    return "Images: Use JPEG, PNG, WebP, GIF or AVIF files";
  return null;
}
