"use server";

import { AddressTypes, Genders } from "@backend/lib/enums.mjs";
import {
  personName,
  phoneNumber,
  shortText,
  addressLine,
  birthDate,
  checkboxValue,
  recordId,
  validationFailure,
} from "../lib/form-validation";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { db } from "../lib/db";
import { getCurrentUser } from "../lib/session";
import { DELIVERY_ADDR_COOKIE } from "../lib/addresses";
import { prepareProfilePhoto } from "../lib/profile-photo";
import { randomUUID } from "node:crypto";
import { ContactChannel } from "@backend/generated/prisma/client";
import {
  confirmContactVerification,
  requestContactVerification,
} from "../lib/contact-verification";
import { emailAddress } from "../lib/form-validation";
import { sendEmail } from "../lib/mail";
import { sendSms } from "../lib/sms";

export type AccountActionResult = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

export type ContactVerificationActionResult = {
  ok?: boolean;
  sent?: boolean;
  channel?: "Email" | "Phone";
  target?: string;
  challengeId?: string;
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

export async function requestContactOtp(
  previous: ContactVerificationActionResult | null,
  formData: FormData,
): Promise<ContactVerificationActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in first" };
  const channel = z
    .enum([ContactChannel.Email, ContactChannel.Phone])
    .safeParse(formData.get("channel"));
  if (!channel.success)
    return { fieldErrors: { channel: ["Choose email or mobile verification"] } };
  const targetInput = formData.get("target");
  const parsedTarget =
    channel.data === ContactChannel.Email
      ? emailAddress.safeParse(targetInput)
      : phoneNumber.safeParse(targetInput);
  if (!parsedTarget.success) return { ...validationFailure(parsedTarget.error) };

  const target = parsedTarget.data;
  const result = await requestContactVerification(channel.data, target, user.id);
  if (result.ok)
    return {
      sent: true,
      channel: channel.data,
      target: result.target,
      challengeId: result.challengeId,
    };
  if (result.code === "SAME_CONTACT")
    return {
      ...(previous?.sent && previous.target === target ? previous : {}),
      fieldErrors: { target: ["This is already your current contact detail"] },
    };
  if (result.code === "ALREADY_USED")
    return {
      ...(previous?.sent && previous.target === target ? previous : {}),
      fieldErrors: { target: ["This contact detail is already linked to another account"] },
    };
  if (result.code === "RATE_LIMIT")
    return {
      ...(previous?.sent ? previous : {}),
      error: `Please wait ${result.wait ?? 60} seconds before requesting another code.`,
    };
  return {
    ...(previous?.sent ? previous : {}),
    fieldErrors: {
      target: [
        "We could not send the verification code. Check your contact settings and try again.",
      ],
    },
  };
}

export async function confirmContactOtp(
  _previous: ContactVerificationActionResult | null,
  formData: FormData,
): Promise<ContactVerificationActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in first" };
  const channel = z
    .enum([ContactChannel.Email, ContactChannel.Phone])
    .safeParse(formData.get("channel"));
  if (!channel.success)
    return { fieldErrors: { channel: ["Choose email or mobile verification"] } };
  const parsed = z
    .object({
      target: channel.data === ContactChannel.Email ? emailAddress : phoneNumber,
      challengeId: z.string().uuid(),
      code: z
        .string()
        .trim()
        .regex(/^\d{6}$/, "Enter the 6-digit verification code"),
    })
    .safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ...validationFailure(parsed.error) };

  const result = await confirmContactVerification({
    channel: channel.data,
    target: parsed.data.target,
    challengeId: parsed.data.challengeId,
    code: parsed.data.code,
    userId: user.id,
  });
  if (!result.ok) {
    const message =
      result.code === "ALREADY_USED"
        ? "This contact detail is already linked to another account"
        : result.code === "CONTACT_CHANGED"
          ? "Your contact details changed. Start again to request a new code"
          : "The code is invalid or expired. Check it and try again";
    return { fieldErrors: { code: [message] } };
  }

  if (result.oldValue) {
    const notice = `Your StoreLaunch account ${channel.data === ContactChannel.Email ? "email" : "mobile number"} was changed. If you did not make this change, contact store support.`;
    if (channel.data === ContactChannel.Email)
      await sendEmail({ to: result.oldValue, subject: "Account email changed", body: notice });
    else await sendSms(result.oldValue, notice);
  }
  revalidatePath("/account");
  revalidatePath("/", "layout");
  return { ok: true, channel: channel.data, target: parsed.data.target };
}

const profileSchema = z.object({
  name: personName,
  gender: z.enum([Genders.male, Genders.female, Genders.other, ""]).optional().default(""),
  dateOfBirth: birthDate.optional().default(""),
});

export async function updateProfile(
  _prev: AccountActionResult | null,
  formData: FormData,
): Promise<AccountActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in first" };

  const rider = await db.rider.findUnique({ where: { userId: user.id }, select: { id: true } });
  const parsed = profileSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { ok: false, ...validationFailure(parsed.error) };
  }
  const { name, gender, dateOfBirth } = parsed.data;

  let dob: Date | null = null;
  if (dateOfBirth) {
    dob = new Date(dateOfBirth);
    if (Number.isNaN(dob.getTime()))
      return { ok: false, fieldErrors: { dateOfBirth: ["Enter a valid date"] } };
  }

  let photo: Buffer | undefined;
  const upload = formData.get("profilePhoto");
  if (upload instanceof File && upload.size > 0) {
    try {
      photo = await prepareProfilePhoto(upload);
    } catch (error) {
      return {
        ok: false,
        fieldErrors: {
          profilePhoto: [error instanceof Error ? error.message : "Choose a valid photo"],
        },
      };
    }
  }
  const removePhoto = formData.get("removePhoto") === "on";
  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: {
        name,
        gender: gender || null,
        dateOfBirth: dob,
        ...(photo
          ? { profilePhoto: new Uint8Array(photo), profilePhotoVersion: randomUUID() }
          : removePhoto
            ? { profilePhoto: null, profilePhotoVersion: null }
            : {}),
      },
    });
    if (rider) await tx.rider.update({ where: { id: rider.id }, data: { name } });
  });
  revalidatePath("/account");
  revalidatePath("/", "layout");
  return { ok: true };
}

const addressSchema = z.object({
  id: recordId.optional(),
  name: personName,
  phone: phoneNumber,
  type: z
    .enum([AddressTypes.HOME, AddressTypes.OFFICE, AddressTypes.OTHER])
    .default(AddressTypes.HOME),
  line1: addressLine,
  line2: shortText.optional().default(""),
  city: shortText.min(2, "Enter a city"),
  region: shortText.optional().default(""),
  postal: shortText.optional().default(""),
  isDefault: checkboxValue,
});

export async function saveAddress(
  _prev: AccountActionResult | null,
  formData: FormData,
): Promise<AccountActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in first" };

  const parsed = addressSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { ok: false, ...validationFailure(parsed.error) };
  }
  const d = parsed.data;

  const data = {
    name: d.name,
    phone: d.phone,
    type: d.type,
    line1: d.line1,
    line2: d.line2 || null,
    city: d.city,
    region: d.region || null,
    postal: d.postal || null,
    isDefault: d.isDefault,
  };

  const saved = await db.$transaction(async (tx) => {
    // Serialize changes to this user's default address, including concurrent edits.
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${user.id} FOR UPDATE`;
    if (d.id && !(await tx.address.findFirst({ where: { id: d.id, userId: user.id } })))
      return false;
    if (d.isDefault)
      await tx.address.updateMany({ where: { userId: user.id }, data: { isDefault: false } });
    if (d.id) await tx.address.update({ where: { id: d.id }, data });
    else await tx.address.create({ data: { ...data, userId: user.id } });
    return true;
  });
  if (!saved) return { ok: false, error: "Address not found" };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteAddress(addressId: string): Promise<AccountActionResult> {
  if (!recordId.safeParse(addressId).success)
    return { ok: false, error: "Invalid record. Refresh the page and try again" };
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in first" };
  await db.address.deleteMany({ where: { id: addressId, userId: user.id } });
  revalidatePath("/account/addresses");
  return { ok: true };
}

export async function setDefaultAddress(addressId: string): Promise<AccountActionResult> {
  if (!recordId.safeParse(addressId).success)
    return { ok: false, error: "Invalid record. Refresh the page and try again" };
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in first" };
  const saved = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${user.id} FOR UPDATE`;
    if (!(await tx.address.findFirst({ where: { id: addressId, userId: user.id } }))) return false;
    await tx.address.updateMany({ where: { userId: user.id }, data: { isDefault: false } });
    await tx.address.update({ where: { id: addressId }, data: { isDefault: true } });
    return true;
  });
  if (!saved) return { ok: false, error: "Address not found" };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function selectDeliveryAddress(
  addressId: string | null,
): Promise<AccountActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in first" };

  if (addressId !== null && !recordId.safeParse(addressId).success)
    return { ok: false, error: "Choose a valid delivery address" };
  const jar = await cookies();
  if (addressId) {
    const a = await db.address.findFirst({
      where: { id: addressId, userId: user.id },
      select: { id: true },
    });
    if (!a) return { ok: false, error: "Address not found" };
    jar.set(DELIVERY_ADDR_COOKIE, addressId, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
    });
  } else {
    jar.set(DELIVERY_ADDR_COOKIE, "", { path: "/", httpOnly: true, sameSite: "lax", maxAge: 0 });
  }
  revalidatePath("/", "layout");
  return { ok: true };
}
