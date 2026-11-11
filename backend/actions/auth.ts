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
import { logger } from "../lib/logger";

const log = logger.child({ scope: "action:auth" });

/** next/navigation's redirect() throws an error carrying this digest prefix. */
function isRedirectError(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("digest" in error)) return false;
  return String((error as { digest?: unknown }).digest).startsWith("NEXT_REDIRECT");
}

// Simple in-memory rate limiter for this session (reset on server restart)
// Key format: "rate-limit:AUTHENTICATION:phone-or-ip"
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const otpAttempts = new Map<string, { count: number; resetAt: number }>();

const RATE_LIMIT_WINDOW_MS = 15 * 60_000; // 15 minutes
const MAX_LOGIN_ATTEMPTS = 5;
const MAX_OTP_REQUESTS = 3;
const MAX_OTP_VERIFY_ATTEMPTS = 5;

function isRateLimited(
  key: string,
  map: Map<string, { count: number; resetAt: number }>,
  maxAttempts: number,
): { limited: boolean; waitMs: number } | null {
  const entry = map.get(key);
  if (!entry) return null;
  if (Date.now() > entry.resetAt) {
    map.delete(key);
    return null;
  }
  if (entry.count >= maxAttempts) {
    const waitMs = entry.resetAt - Date.now();
    return { limited: true, waitMs };
  }
  return null;
}

function incrementRateLimit(
  key: string,
  map: Map<string, { count: number; resetAt: number }>,
  windowMs: number,
  maxAttempts: number,
): { newCount: number; resetAt: number; limited: boolean; waitMs: number } {
  const now = Date.now();
  const entry = map.get(key);
  if (entry && now < entry.resetAt) {
    const newCount = entry.count + 1;
    const resetAt = entry.resetAt;
    if (newCount >= maxAttempts) {
      return { newCount, resetAt, limited: true, waitMs: resetAt - now };
    }
    map.set(key, { count: newCount, resetAt });
    return { newCount, resetAt, limited: false, waitMs: 0 };
  } else if (entry && now >= entry.resetAt) {
    const newCount = 1;
    const resetAt = now + windowMs;
    map.set(key, { count: newCount, resetAt });
    return { newCount, resetAt, limited: false, waitMs: 0 };
  } else {
    const newCount = 1;
    const resetAt = now + windowMs;
    map.set(key, { count: newCount, resetAt });
    return { newCount, resetAt, limited: false, waitMs: 0 };
  }
}
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
  ok?: boolean;
  message?: string;
  url?: string;
} | null;

const loginSchema = z.object({
  email: emailAddress,
  password: z.string().min(1, "Enter your password").max(1024, "Password is too long"),
  callbackUrl: shortText.optional(),
});

type LoginRole = Role;

function landingFor(role: LoginRole): string {
  if (role === Roles.Rider) return "/rider";
  if (role === Roles.Admin || role === Roles.SuperAdmin) return "/admin";
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
    (inArea("/admin") && role !== Roles.Admin && role !== Roles.SuperAdmin) ||
    (inArea("/hrm") &&
      role !== Roles.Admin &&
      role !== Roles.SuperAdmin &&
      role !== Roles.Manager)
  )
    return landingFor(role);
  return callbackUrl;
}

async function finishVerifiedLogin(
  ticket: string,
  role: LoginRole,
  callbackUrl?: string,
): Promise<AuthFormState> {
  const url = loginDestination(role, callbackUrl);
  try {
    // signIn without redirectTo returns normally so the action result (and
    // therefore ActionResultToast) reaches the client; navigation happens
    // client-side from auth-forms.tsx via router.push(state.url).
    await signIn("credentials", { loginTicket: ticket, role });
  } catch (error) {
    if (error instanceof AuthError) {
      log.warn("finishVerifiedLogin rejected", { role, code: error.name });
      return { error: "Your login expired or this role is no longer available. Sign in again" };
    }
    if (!isRedirectError(error)) {
      log.error("finishVerifiedLogin failed", { error, role });
      return null;
    }
  }
  return { ok: true, message: "Welcome back!", url };
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
  const email = parsed.data.email.toLowerCase().trim();
  // Rate limiting by email to prevent brute-force
  const loginKey = `rate-limit:AUTHENTICATION:${email}`;
  const loginLimit = isRateLimited(loginKey, loginAttempts, MAX_LOGIN_ATTEMPTS);
  if (loginLimit?.limited) {
    return {
      error: `Too many login attempts. Please try again in ${Math.ceil(loginLimit.waitMs / 1000)} seconds.`,
      wait: Math.ceil(loginLimit.waitMs / 1000),
    };
  }
  const proof = await prepareEmailLogin(parsed.data.email, parsed.data.password);
  if (!proof) {
    // Increment rate limit even on failed auth (but only after first check)
    const { newCount, resetAt } = incrementRateLimit(
      loginKey,
      loginAttempts,
      RATE_LIMIT_WINDOW_MS,
      MAX_LOGIN_ATTEMPTS,
    );
    if (newCount >= MAX_LOGIN_ATTEMPTS) {
      return {
        error: `Account locked due to too many failed attempts. Try again after ${Math.ceil(resetAt / 1000)} seconds.`,
        wait: Math.ceil(resetAt / 1000),
      };
    }
    return { error: "Invalid email or password" };
  }
  // Reset rate limit on successful login
  mapDelete(loginKey, loginAttempts);
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
      role !== Roles.SuperAdmin &&
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
    if (error instanceof Error && error.message === "INVALID_REFERRAL") {
      log.warn("registerAction rejected", { code: "INVALID_REFERRAL" });
      return {
        fieldErrors: { referralCode: ["This referral code is invalid or the program is paused"] },
      };
    }
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      log.warn("registerAction rejected", { code: "P2002" });
      return { fieldErrors: { email: ["An account with this email already exists"] } };
    }
    log.error("registerAction failed", { error });
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

  // Rate limiting by phone number for OTP requests
  const otpKey = `rate-limit:OTP:${phone}`;
  const otpLimit = isRateLimited(otpKey, otpAttempts, MAX_OTP_REQUESTS);
  if (otpLimit?.limited) {
    return {
      error: `Too many OTP requests. Please try again in ${Math.ceil(otpLimit.waitMs / 1000)} seconds.`,
      wait: Math.ceil(otpLimit.waitMs / 1000),
    };
  }
  const res = await createPhoneOtp(phone);
  if (!res.ok)
    return {
      ...(previous?.sent ? { sent: true, phone: previous.phone } : {}),
      errorCode: res.code,
      wait: res.wait,
    };
  // Increment OTP request rate limit
  const { newCount, resetAt } = incrementRateLimit(
    otpKey,
    otpAttempts,
    RATE_LIMIT_WINDOW_MS,
    MAX_OTP_REQUESTS,
  );
  if (newCount >= MAX_OTP_REQUESTS) {
    return {
      sent: true,
      phone: res.phone,
      error: `Maximum OTP requests reached for this number. Try again after ${Math.ceil(resetAt / 1000)} seconds.`,
      wait: Math.ceil(resetAt / 1000),
    };
  }
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

  const phone = parsed.data.phone;
  // Rate limiting by phone number for OTP verification
  const otpVerifyKey = `rate-limit:OTP_VERIFY:${phone}`;
  const otpVerifyLimit = isRateLimited(otpVerifyKey, otpAttempts, MAX_OTP_VERIFY_ATTEMPTS);
  if (otpVerifyLimit?.limited) {
    return {
      error: `Too many OTP verification attempts. Please try again in ${Math.ceil(otpVerifyLimit.waitMs / 1000)} seconds.`,
      wait: Math.ceil(otpVerifyLimit.waitMs / 1000),
    };
  }

  const proof = await preparePhoneLogin(parsed.data.phone, parsed.data.code);
  if (!proof) {
    // Increment rate limit on failed verification
    const { newCount, resetAt } = incrementRateLimit(
      otpVerifyKey,
      otpAttempts,
      RATE_LIMIT_WINDOW_MS,
      MAX_OTP_VERIFY_ATTEMPTS,
    );
    if (newCount >= MAX_OTP_VERIFY_ATTEMPTS) {
      return {
        error: `Account locked due to too many failed OTP attempts. Try again after ${Math.ceil(resetAt / 1000)} seconds.`,
        wait: Math.ceil(resetAt / 1000),
      };
    }
    return { errorCode: "INVALID_OTP" };
  }
  // Reset rate limit on successful OTP verification
  mapDelete(otpVerifyKey, otpAttempts);
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

function mapDelete(key: string, map: Map<string, { count: number; resetAt: number }>) {
  map.delete(key);
}
