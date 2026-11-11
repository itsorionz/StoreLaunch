import { Roles } from "@backend/lib/enums.mjs";
import {
  personName,
  emailAddress,
  passwordValue,
  optionalContactPhone,
  shortText,
} from "./form-validation";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "./db";
import { verifyLicenseKey, hashLicenseKey } from "./license";
import { seedCatalog } from "./seed-data";
import { Prisma, type Role } from "@backend/generated/prisma/client";
import { logger } from "./logger";

const log = logger.child({ scope: "setup" });

export const setupInputSchema = z.object({
  licenseKey: z
    .string()
    .trim()
    .min(10, "Enter your license key")
    .max(4096, "License key is too long"),
  adminName: personName,
  email: emailAddress,
  password: passwordValue,
  storeName: personName,
  currencySymbol: z.string().trim().min(1, "Enter a currency symbol").max(4).default("৳"),
  currencyCode: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{3}$/, "Enter a 3-letter currency code")
    .default("BDT"),
  contactEmail: emailAddress.optional().or(z.literal("")),
  contactPhone: optionalContactPhone,
  deliveryEstimate: shortText.optional(),
  roles: z.array(z.string()).optional(),
});

export type SetupInput = z.infer<typeof setupInputSchema>;

export type SetupOutcome = { ok: true } | { ok: false; error: string };

// Minimal read used by the edge proxy to decide whether to gate on /setup.
export async function isSetupCompleted(): Promise<boolean> {
  const settings = await db.storeSettings.findFirst({ select: { setupCompletedAt: true } });
  return Boolean(settings?.setupCompletedAt);
}

export async function performSetup(input: SetupInput): Promise<SetupOutcome> {
  const license = await verifyLicenseKey(input.licenseKey);
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

  const email = input.email.toLowerCase().trim();
  const passwordHash = await bcrypt.hash(input.password, 10);
  const keyHash = await hashLicenseKey(input.licenseKey);

  try {
    return await db.$transaction(
      async (tx): Promise<SetupOutcome> => {
        // Setup is an instance-wide, single-use operation, including distinct license keys.
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended('storelaunch-setup', 0))::text`;
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('store-currency'))::text`;
        const settings = await tx.storeSettings.findUnique({ where: { singletonKey: 1 } });
        if (settings?.setupCompletedAt)
          return { ok: false, error: "This store has already been set up." };
        if (
          settings?.currencyLockedAt &&
          settings.currencyCode !== input.currencyCode.toUpperCase()
        ) {
          return {
            ok: false,
            error:
              "Existing products or monetary activity have locked this store's currency. Use the configured currency to finish setup.",
          };
        }
        if (await tx.user.findUnique({ where: { email } }))
          return { ok: false, error: "An account with this email already exists." };
        if (await tx.license.findUnique({ where: { keyHash } }))
          return { ok: false, error: "This license key has already been used." };
        const now = new Date();
        await tx.license.create({
          data: {
            keyHash,
            storeSlug: license.payload.slug ?? null,
            expiresAt: license.payload.exp ? new Date(license.payload.exp * 1000) : null,
            activatedAt: now,
          },
        });
        await tx.user.create({
          data: {
            email,
            name: input.adminName,
            passwordHash,
            roles: input.roles ? (input.roles as Role[]) : [Roles.Customer, Roles.Admin, Roles.SuperAdmin],
          },
        });
        const storeData = {
          storeName: input.storeName,
          currencySymbol: input.currencySymbol,
          currencyCode: input.currencyCode.toUpperCase(),
          contactEmail: input.contactEmail || null,
          contactPhone: input.contactPhone || null,
          deliveryEstimate: input.deliveryEstimate || "12-24 HOURS",
          setupCompletedAt: now,
        };
        if (settings)
          await tx.storeSettings.update({ where: { id: settings.id }, data: storeData });
        else await tx.storeSettings.create({ data: storeData });
        await seedCatalog(tx);
        return { ok: true };
      },
      { maxWait: 15_000, timeout: 30_000 },
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      log.warn("store setup rejected", { code: "P2002" });
      return {
        ok: false,
        error: "Setup details were already used or this store was set up. Refresh and try again.",
      };
    }
    log.error("store setup failed", { error });
    throw error;
  }
}
