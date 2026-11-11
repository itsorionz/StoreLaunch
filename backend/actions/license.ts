"use server";

import { cookies } from "next/headers";
import { db } from "../lib/db";
import { Roles } from "../lib/enums.mjs";
import {
  verifyLicenseKey,
  hashLicenseKey,
  signActivationToken,
  generateLicenseKey,
} from "../lib/license";
import { requireAdmin, requireSuperAdmin } from "../lib/session";
import { logger } from "../lib/logger";

const log = logger.child({ scope: "license-action" });

const ACTIVATION_COOKIE = "sl_act";
const ACTIVATION_DAYS = 365;

export type ActivateLicenseOutcome = {
  ok: boolean;
  message?: string;
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

export type IssuedLicenseRow = {
  id: string;
  key: string;
  label: string;
  storeSlug: string | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
};

export async function activateLicenseAction(
  _prev: ActivateLicenseOutcome | null,
  formData: FormData,
): Promise<ActivateLicenseOutcome> {
  const user = await requireAdmin();
  const licenseKey = (formData.get("licenseKey") as string)?.trim();

  if (!licenseKey) {
    return { ok: false, error: "Enter a license key" };
  }

  const license = await verifyLicenseKey(licenseKey);
  if (!license.ok) {
    return {
      ok: false,
      error:
        license.reason === "expired"
          ? "This license key has expired."
          : license.reason === "bad-signature"
            ? "Invalid license key."
            : "Malformed license key.",
    };
  }

  const keyHash = await hashLicenseKey(licenseKey);

  try {
    const existing = await db.license.findUnique({ where: { keyHash } });
    if (existing) {
      // Reactivate if revoked
      if (existing.revokedAt) {
        await db.license.update({
          where: { id: existing.id },
          data: { revokedAt: null },
        });
      }
    } else {
      await db.license.create({
        data: {
          keyHash,
          storeSlug: license.payload.slug ?? null,
          expiresAt: license.payload.exp ? new Date(license.payload.exp * 1000) : null,
          activatedAt: new Date(),
        },
      });
    }

    // Mark setup completed if not already
    const settings = await db.storeSettings.findUnique({ where: { singletonKey: 1 } });
    if (!settings?.setupCompletedAt) {
      await db.storeSettings.upsert({
        where: { singletonKey: 1 },
        create: {
          singletonKey: 1,
          storeName: user.name ?? "Store",
          currencySymbol: "৳",
          currencyCode: "BDT",
          setupCompletedAt: new Date(),
        },
        update: { setupCompletedAt: new Date() },
      });
    }

    // Issue activation cookie
    const cookieStore = await cookies();
    const token = await signActivationToken(Date.now() + ACTIVATION_DAYS * 86400_000);
    cookieStore.set(ACTIVATION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: ACTIVATION_DAYS * 86400,
    });

    log.info("license activated", { adminId: user.id, slug: license.payload.slug ?? null });
    return { ok: true, message: "License activated successfully." };
  } catch (error) {
    log.error("license activation failed", { error });
    return { ok: false, error: "Could not activate the license. Please try again." };
  }
}

export async function issueLicenseAction(formData: FormData): Promise<{
  ok: boolean;
  key?: string;
  error?: string;
}> {
  const user = await requireSuperAdmin();
  const label = (formData.get("label") as string)?.trim() || "Issued license";
  const storeSlug = (formData.get("storeSlug") as string)?.trim() || null;
  const expiresInDaysRaw = (formData.get("expiresInDays") as string)?.trim();
  const isTrial = (formData.get("isTrial") as string) === "on";
  const expiresInDays = isTrial ? 7 : (expiresInDaysRaw ? Number(expiresInDaysRaw) : undefined);

  if (expiresInDaysRaw && !isTrial && (!Number.isFinite(expiresInDays!) || expiresInDays! < 1)) {
    return { ok: false, error: "Enter a valid expiry in days" };
  }

  try {
    const { key, payload } = await generateLicenseKey({
      expiresInDays: expiresInDays ?? undefined,
      slug: storeSlug ?? undefined,
    });
    await db.issuedLicense.create({
      data: {
        key,
        label,
        storeSlug,
        expiresAt: payload.exp ? new Date(payload.exp * 1000) : null,
      },
    });
    log.info("license issued", { adminId: user.id, isTrial });
    return { ok: true, key };
  } catch (error) {
    log.error("license issuance failed", { error });
    return { ok: false, error: "Could not issue the license key. Please try again." };
  }
}

export async function revokeIssuedLicenseAction(formData: FormData): Promise<{
  ok: boolean;
  error?: string;
}> {
  const user = await requireSuperAdmin();
  const licenseId = (formData.get("licenseId") as string)?.trim();

  if (!licenseId) {
    return { ok: false, error: "Invalid license" };
  }

  try {
    await db.issuedLicense.update({ where: { id: licenseId }, data: { revokedAt: new Date() } });
    log.info("issued license revoked", { adminId: user.id, licenseId });
    return { ok: true };
  } catch (error) {
    log.error("issued license revocation failed", { error });
    return { ok: false, error: "Could not revoke the issued license." };
  }
}

export async function getLicenseStats(): Promise<{
  totalStores: number;
  activeLicenses: number;
  expiredLicenses: number;
  revokedLicenses: number;
  trialLicenses: number;
  storesWithoutLicense: number;
}> {
  const [stores, allLicenses] = await Promise.all([
    db.user.count({ where: { roles: { has: Roles.Admin } } }),
    db.license.findMany({
      select: { id: true, expiresAt: true, revokedAt: true },
    }),
  ]);

  const now = new Date();
  const activeLicenses = allLicenses.filter(
    (l) => !l.revokedAt && (!l.expiresAt || l.expiresAt > now),
  ).length;
  const expiredLicenses = allLicenses.filter(
    (l) => !l.revokedAt && l.expiresAt && l.expiresAt <= now,
  ).length;
  const revokedLicenses = allLicenses.filter((l) => !!l.revokedAt).length;

  const trialLicenses = await db.issuedLicense.count({
    where: { revokedAt: null, expiresAt: { lt: now }, label: { contains: "Trial" } },
  });

  return {
    totalStores: stores,
    activeLicenses,
    expiredLicenses,
    revokedLicenses,
    trialLicenses,
    storesWithoutLicense: Math.max(0, stores - activeLicenses),
  };
}

export async function listIssuedLicenses(): Promise<IssuedLicenseRow[]> {
  const rows = await db.issuedLicense.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      key: true,
      label: true,
      storeSlug: true,
      expiresAt: true,
      revokedAt: true,
      createdAt: true,
    },
  });
  return rows;
}

export async function revokeLicenseAction(
  _prev: ActivateLicenseOutcome | null,
  formData: FormData,
): Promise<ActivateLicenseOutcome> {
  const user = await requireAdmin();
  const licenseId = (formData.get("licenseId") as string)?.trim();

  if (!licenseId) {
    return { ok: false, error: "Invalid license" };
  }

  try {
    await db.license.update({ where: { id: licenseId }, data: { revokedAt: new Date() } });
    log.info("license revoked", { adminId: user.id, licenseId });
    return { ok: true, message: "License revoked." };
  } catch (error) {
    log.error("license revocation failed", { error });
    return { ok: false, error: "Could not revoke the license. Please try again." };
  }
}
