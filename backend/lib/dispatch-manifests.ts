import "server-only";
import { bdDayKey } from "./admin-dashboard-periods";
import { db } from "./db";
import { recordOrderEvent } from "./order-events";
import { OrderEventTypes, OrderStatuses } from "@backend/lib/enums.mjs";
import type { Prisma } from "@backend/generated/prisma/client";

/**
 * Per-courier daily dispatch manifests (§5.5).
 *
 * Every active courier gets one auto-opened manifest per Bangladesh day.
 * Creating a shipment for a courier attaches the order to that courier's
 * manifest for the day (deduplicated across shipments), and handover closes
 * the manifest while preserving any carrier-issued tracking numbers.
 */

type DbClient = Prisma.TransactionClient | typeof db;

/** Readable, day-scoped manifest number unique per courier (via the id tail). */
export function dailyCourierManifestNumber(
  company: { id: string; name: string },
  now = new Date(),
): string {
  const slug =
    company.name
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "")
      .slice(0, 8) || "COURIER";
  const idTail = company.id.slice(-5).toUpperCase();
  return `MAN-${slug}-${idTail}-${bdDayKey(now)}`;
}

/**
 * Finds today's open manifest for the courier, creating it on first use so
 * dispatch can attach parcels without a manual "create manifest" step.
 */
export async function ensureDailyCourierManifest(
  company: { id: string; name: string },
  options: { now?: Date; client?: DbClient } = {},
) {
  const client = options.client ?? db;
  const number = dailyCourierManifestNumber(company, options.now);
  const existing = await client.dispatchManifest.findUnique({ where: { number } });
  if (existing) return { manifest: existing, created: false };
  try {
    const manifest = await client.dispatchManifest.create({
      data: { number, kind: "Courier", deliveryCompanyId: company.id, status: "Open" },
    });
    return { manifest, created: true };
  } catch (error) {
    // Two dispatchers racing the same day: whoever loses re-reads the winner.
    const again = await client.dispatchManifest.findUnique({ where: { number } });
    if (again) return { manifest: again, created: false };
    throw error;
  }
}

export type AttachResult = {
  attached: boolean;
  manifestNumber: string;
  reason?: string;
};

/**
 * Attaches an order to its courier's daily manifest. Best-effort by design:
 * shipment creation must never fail because a manifest already handed over or
 * because the order was dispatched manually before.
 */
export async function attachOrderToDailyManifest(input: {
  orderId: string;
  deliveryCompanyId: string;
  now?: Date;
  client?: DbClient;
}): Promise<AttachResult> {
  const client = input.client ?? db;
  const company = await client.deliveryCompany.findUnique({
    where: { id: input.deliveryCompanyId },
    select: { id: true, name: true },
  });
  if (!company) return { attached: false, manifestNumber: "", reason: "Carrier not found" };

  const { manifest } = await ensureDailyCourierManifest(company, {
    now: input.now,
    client,
  });
  if (manifest.status !== "Open")
    return {
      attached: false,
      manifestNumber: manifest.number,
      reason: "Daily manifest already handed over",
    };

  // One parcel belongs to exactly one manifest for its whole lifetime.
  const existingLine = await client.dispatchManifestLine.findFirst({
    where: { orderId: input.orderId },
  });
  if (existingLine)
    return {
      attached: false,
      manifestNumber: manifest.number,
      reason: "Order is already on a manifest",
    };

  await client.dispatchManifestLine.create({
    data: { manifestId: manifest.id, orderId: input.orderId },
  });
  return { attached: true, manifestNumber: manifest.number };
}

/** Opens today's manifest for every active courier; returns how many were created. */
export async function openDailyCourierManifests(now = new Date()) {
  const companies = await db.deliveryCompany.findMany({
    where: { active: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  let created = 0;
  const numbers: string[] = [];
  for (const company of companies) {
    const result = await ensureDailyCourierManifest(company, { now });
    if (result.created) created += 1;
    numbers.push(result.manifest.number);
  }
  return { carriers: companies.length, created, numbers };
}

export type HandoverResult =
  | { ok: true; number: string; lines: number; shipmentsCreated: number }
  | { ok: false; error: string };

/**
 * Hands a manifest over to the rider/courier inside one transaction:
 * - marks the manifest `HandedOver`;
 * - creates manual shipments for lines that have none (synthetic `MAN-…`
 *   tracking) and never overwrites carrier-issued tracking numbers;
 * - marks the orders shipped (Packed → Shipped + audit event) and stamps
 *   `shippedAt` / backfills the carrier when the manifest names one.
 *
 * Extracted from the admin action so dispatch UI and tests share one path.
 */
export async function handoverDispatchManifest(
  id: string,
  now = new Date(),
): Promise<HandoverResult> {
  const manifest = await db.dispatchManifest.findUnique({
    where: { id },
    include: { lines: { include: { order: true } } },
  });
  if (!manifest) return { ok: false, error: "Manifest not found" };
  if (manifest.status !== "Open") return { ok: false, error: "Manifest is not Open" };

  let shipmentsCreated = 0;
  await db.$transaction(async (tx) => {
    await tx.dispatchManifest.update({
      where: { id: manifest.id },
      data: { status: "HandedOver" as const, handedOverAt: now },
    });

    for (const line of manifest.lines) {
      const order = line.order;
      if (!order) continue;

      const existing = await tx.shipment.findUnique({ where: { orderId: order.id } });
      if (existing) {
        // Preserve tracking and provider mode — only fill what is missing.
        await tx.shipment.update({
          where: { id: existing.id },
          data: {
            deliveryCompanyId: existing.deliveryCompanyId ?? manifest.deliveryCompanyId,
            handedOverAt: existing.handedOverAt ?? now,
            ...(existing.status === "Pending" ? { status: "Shipped" as const } : {}),
          },
        });
      } else {
        await tx.shipment.create({
          data: {
            orderId: order.id,
            deliveryCompanyId: manifest.deliveryCompanyId ?? order.deliveryCompanyId,
            trackingNumber: `MAN-${manifest.number}-${order.id}`,
            status: "Shipped" as const,
            providerMode: "Manual" as const,
            handedOverAt: now,
          },
        });
        shipmentsCreated += 1;
      }

      if (manifest.deliveryCompanyId && !order.deliveryCompanyId) {
        await tx.order.updateMany({
          where: { id: order.id, deliveryCompanyId: null },
          data: { deliveryCompanyId: manifest.deliveryCompanyId },
        });
      }
      await tx.order.updateMany({
        where: { id: order.id, shippedAt: null },
        data: { shippedAt: now },
      });
      const moved = await tx.order.updateMany({
        where: { id: order.id, status: OrderStatuses.Packed },
        data: { status: OrderStatuses.Shipped },
      });
      if (moved.count) {
        await recordOrderEvent(tx, {
          orderId: order.id,
          type: OrderEventTypes.Shipped,
          toStatus: OrderStatuses.Shipped,
          message: `Handed over with dispatch manifest ${manifest.number}`,
        });
      }
    }
  });

  return { ok: true, number: manifest.number, lines: manifest.lines.length, shipmentsCreated };
}
