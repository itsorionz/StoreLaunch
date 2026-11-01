"use server";

import { Roles } from "@backend/lib/enums.mjs";
import {
  registrationSchema,
  emailAddress,
  phoneNumber,
  shortText,
  validationFailure,
} from "../lib/form-validation";

import { AuthError } from "next-auth";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { signIn, signOut } from "../lib/auth";
import { db } from "../lib/db";
import { prepareEmailLogin, preparePhoneLogin, type LoginProof } from "../lib/login";
import type { Role } from "@backend/generated/prisma/client";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LOGIN_ROLE_COOKIE, abandonLoginProof } from "../lib/login";
import { createPhoneOtp } from "../lib/otp";
import { verifyPhoneOtp } from "../lib/otp";
import { createReferredCustomer } from "../lib/referrals";
import {
  createPhoneResetTicket,
  completePasswordReset,
  requestEmailPasswordReset,
} from "../lib/password-recovery";

export type AuthFormState = {
  error?: string;
  errorCode?: string;
  wait?: number;
  fieldErrors?: Record<string, string[]>;
  sent?: boolean;
  phone?: string;
  ticket?: string;
  roles?: Role[];
} | null;

const loginSchema = z.object({
  email: emailAddress,
  password: z.string().min(1, "Enter your password").max(1024, "Password is too long"),
  callbackUrl: shortText.optional(),
});

type LoginRole = Role;

function landingFor(role: LoginRole): string {
  if (role === Roles.Rider) return "/rider";
  if (role === Roles.Admin) return "/admin";
  if (role === Roles.Manager) return "/hrm";
  if (role === Roles.Support) return "/support";
  return "/";
}

function loginDestination(role: LoginRole, callbackUrl?: string): string {
  if (!callbackUrl?.startsWith("/") || callbackUrl.startsWith("//") || callbackUrl.includes("\\"))
    return landingFor(role);
  const path = callbackUrl.split(/[?#]/)[0];
  const inArea = (area: string) => path === area || path.startsWith(`${area}/`);
  if (role === Roles.Rider) return inArea("/rider") ? callbackUrl : "/rider";
  if (role === Roles.Support) return inArea("/support") ? callbackUrl : "/support";
  if (
    inArea("/rider") ||
    inArea("/support") ||
    (inArea("/admin") && role !== Roles.Admin) ||
    (inArea("/hrm") && role !== Roles.Admin && role !== Roles.Manager)
  )
    return landingFor(role);
  return callbackUrl;
}

async function finishVerifiedLogin(
  ticket: string,
  role: LoginRole,
  callbackUrl?: string,
): Promise<AuthFormState> {
  try {
    await signIn("credentials", {
      loginTicket: ticket,
      role,
      redirectTo: loginDestination(role, callbackUrl),
    });
  } catch (error) {
    if (error instanceof AuthError)
      return { error: "Your login expired or this role is no longer available. Sign in again" };
    (await cookies()).set(LOGIN_ROLE_COOKIE, "", { path: "/login", maxAge: 0 });
    throw error;
  }
  return null;
}

async function chooseOrSignIn(proof: LoginProof, callbackUrl?: string): Promise<AuthFormState> {
  if (proof.roles.length > 1) {
    (await cookies()).set(LOGIN_ROLE_COOKIE, proof.ticket, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/login",
      maxAge: 300,
    });
    return { ticket: proof.ticket, roles: proof.roles };
  }
  return finishVerifiedLogin(proof.ticket, proof.roles[0], callbackUrl);
}

export async function loginAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ...validationFailure(parsed.error) };
  const proof = await prepareEmailLogin(parsed.data.email, parsed.data.password);
  if (!proof) return { error: "Invalid email or password" };
  return chooseOrSignIn(proof, parsed.data.callbackUrl);
}

export async function selectLoginRoleAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const role = formData.get("role");
  const ticket = formData.get("ticket");
  if (
    typeof ticket !== "string" ||
    (role !== Roles.Customer &&
      role !== Roles.Admin &&
      role !== Roles.Rider &&
      role !== Roles.Support &&
      role !== Roles.Warehouse &&
      role !== Roles.Sales &&
      role !== Roles.Manager)
  )
    return { error: "Select an available role or sign in again" };
  return finishVerifiedLogin(ticket, role, String(formData.get("callbackUrl") ?? ""));
}

export async function restartLoginAction(formData: FormData) {
  await abandonLoginProof(formData.get("ticket"));
  (await cookies()).set(LOGIN_ROLE_COOKIE, "", { path: "/login", maxAge: 0 });
  const callbackUrl = String(formData.get("callbackUrl") ?? "");
  redirect(callbackUrl ? `/login?callbackUrl=${encodeURIComponent(callbackUrl)}` : "/login");
}

type AuthFormStateLocal = { error?: string; fieldErrors?: Record<string, string[]> } | null;

export async function registerAction(
  _prev: AuthFormStateLocal,
  formData: FormData,
): Promise<AuthFormStateLocal> {
  const parsed = registrationSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { ...validationFailure(parsed.error) };
  }
  const email = parsed.data.email.toLowerCase().trim();
  const referral = z
    .string()
    .trim()
    .max(32, "Referral code is too long")
    .regex(/^[A-Za-z0-9]*$/, "Enter a valid referral code")
    .safeParse(formData.get("referralCode") ?? "");
  if (!referral.success) return { fieldErrors: { referralCode: ["Enter a valid referral code"] } };
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    return { fieldErrors: { email: ["An account with this email already exists"] } };
  }
  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  try {
    await createReferredCustomer({
      email,
      name: parsed.data.name,
      passwordHash,
      referralCode: referral.data,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_REFERRAL")
      return {
        fieldErrors: { referralCode: ["This referral code is invalid or the program is paused"] },
      };
    if (error && typeof error === "object" && "code" in error && error.code === "P2002")
      return { fieldErrors: { email: ["An account with this email already exists"] } };
    throw error;
  }
  const proof = await prepareEmailLogin(email, parsed.data.password);
  if (proof) await finishVerifiedLogin(proof.ticket, Roles.Customer, "/account");
  return null;
}

export async function logoutAction() {
  await signOut({ redirectTo: "/" });
}

export async function requestPhoneOtp(
  previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = z.object({ phone: phoneNumber }).safeParse({ phone: formData.get("phone") });
  if (!parsed.success) return { ...validationFailure(parsed.error) };
  const phone = parsed.data.phone;
  if (phone.length < 6) return { error: "Enter a valid phone number" };

  const res = await createPhoneOtp(phone);
  if (!res.ok)
    return {
      ...(previous?.sent ? { sent: true, phone: previous.phone } : {}),
      errorCode: res.code,
      wait: res.wait,
    };
  return { sent: true, phone: res.phone };
}

const otpVerifySchema = z.object({
  phone: phoneNumber,
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6-digit OTP"),
  callbackUrl: shortText.optional(),
});

export async function verifyPhoneOtpAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = otpVerifySchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ...validationFailure(parsed.error) };

  const proof = await preparePhoneLogin(parsed.data.phone, parsed.data.code);
  if (!proof) return { errorCode: "INVALID_OTP" };
  return chooseOrSignIn(proof, parsed.data.callbackUrl);
}

export async function requestPasswordResetAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const identifier = String(formData.get("identifier") ?? "").trim();
  if (!identifier || identifier.length > 254)
    return { fieldErrors: { identifier: ["Enter your account email or phone number"] } };
  if (identifier.includes("@")) {
    await requestEmailPasswordReset(identifier);
    return {
      sent: true,
      error: "If an active account matches, a reset link will be sent to its email address.",
    };
  }
  const result = await createPhoneOtp(identifier);
  if (!result.ok) {
    if (result.code === "INVALID_PHONE")
      return { fieldErrors: { identifier: ["Enter a valid Bangladesh mobile number"] } };
    return {
      sent: true,
      error: "If an active account matches, a reset code will be sent to its phone number.",
      phone: identifier,
    };
  }
  return {
    sent: true,
    phone: result.phone,
    error: "If an active account matches, a reset code will be sent to its phone number.",
  };
}

export async function verifyPasswordResetOtpAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = z
    .object({
      phone: phoneNumber,
      code: z
        .string()
        .trim()
        .regex(/^\d{6}$/, "Enter the 6-digit code"),
    })
    .safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ...validationFailure(parsed.error) };
  const user = await verifyPhoneOtp(parsed.data.phone, parsed.data.code);
  if (!user) return { fieldErrors: { code: ["The code is invalid or expired"] } };
  return { ticket: await createPhoneResetTicket(user.id) };
}

export async function completePasswordResetAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = z
    .object({
      token: z.string().min(20).max(128),
      password: z
        .string()
        .min(8, "Use at least 8 characters")
        .max(72, "Use at most 72 characters")
        .refine(
          (value) => new TextEncoder().encode(value).length <= 72,
          "Password must be at most 72 UTF-8 bytes",
        ),
      confirmPassword: z.string().min(1, "Re-enter your password").max(72),
    })
    .refine((value) => value.password === value.confirmPassword, {
      path: ["confirmPassword"],
      message: "Passwords do not match",
    })
    .safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ...validationFailure(parsed.error) };
  if (!(await completePasswordReset(parsed.data.token, parsed.data.password)))
    return { error: "This reset link has expired or was already used. Request a new one." };
  return { sent: true };
}
