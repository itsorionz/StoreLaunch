import "server-only";
import {
  OrderEventTypes,
  OrderSources,
  OrderStatuses,
  PaymentMethods,
  Roles,
} from "@backend/lib/enums.mjs";
import { campaignPriceSelect, withCampaignPrice } from "./campaign-pricing";
import { db } from "./db";
import { effectivePriceCents } from "./money";
import { isStoredMoney } from "./money-limits";
import { nextOrderNumber } from "./order-placement";
import { routeOrderToWarehouse } from "./order-routing";
import { assignDeliveryHub } from "./hub-routing";
import { commissionCentsFor } from "./sales-commission";
import { recordOrderEvent, type OrderActor } from "./order-events";
import type { CurrentUser } from "./session";
import { logger } from "./logger";

const log = logger.child({ scope: "sales-orders" });

export type SalesOrderLine = { productId: string; quantity: number };

export type SalesOrderInput = {
  customerName: string;
  customerPhone: string;
  lines: SalesOrderLine[];
  /** "COD" = pay on delivery; "CASH" = cash collected at the counter (order paid). */
  payment: "COD" | "CASH";
  shippingCents?: number;
  zoneId?: string;
  note?: string;
  actor: CurrentUser;
};

export type SalesOrderResult =
  { ok: true; orderNumber: string; customerId: string } | { ok: false; error: string };

const PHONE_PATTERN = /^01\d{9}$/;

/**
 * Thrown inside the placement transaction so a rejected sale rolls back every
 * partial write (walk-in customer, stock decrements, movements) instead of
 * committing them via an early `return`.
 */
class SaleRejected extends Error {}

function normalizePhone(phone: string): string | null {
  const digits = phone.replace(/[\s-]/g, "");
  const candidate = digits.startsWith("+880") ? `0${digits.slice(4)}` : digits;
  return PHONE_PATTERN.test(candidate) ? candidate : null;
}

type ItemSnapshot = {
  productId: string;
  name: string;
  nameBn: string | null;
  slug: string;
  priceCents: number;
  quantity: number;
  imageUrl: string | null;
};

/**
 * Creates a POS order from the sales portal inside one transaction:
 * walk-in customer creation, warehouse routing, atomic stock decrement
 * (global + per-warehouse + movement ledger), and the same
 * `SL-YYYYMMDD-######` order numbers as web checkout.
 */
export async function createSalesOrder(input: SalesOrderInput): Promise<SalesOrderResult> {
  const customerName = input.customerName.trim();
  const phone = normalizePhone(input.customerPhone);
  if (!customerName) return { ok: false, error: "Customer name is required" };
  if (!phone) return { ok: false, error: "Enter a valid Bangladeshi mobile number (01XXXXXXXXX)" };
  if (!input.lines.length) return { ok: false, error: "Add at least one product to the sale" };

  const quantityByProduct = new Map<string, number>();
  for (const line of input.lines) {
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 99)
      return { ok: false, error: "Each line needs a quantity between 1 and 99" };
    quantityByProduct.set(
      line.productId,
      (quantityByProduct.get(line.productId) ?? 0) + line.quantity,
    );
  }
  const shippingCents = input.shippingCents ?? 0;
  if (!isStoredMoney(shippingCents) || shippingCents < 0)
    return { ok: false, error: "Invalid shipping amount" };

  // Read the currency snapshot directly: this runs inside the POS action and
  // must stay usable outside the Next.js cache runtime (tests, scripts).
  const store = await db.storeSettings.findUnique({
    where: { singletonKey: 1 },
    select: { currencyCode: true, currencySymbol: true },
  });
  const currencyCode = store?.currencyCode ?? "BDT";
  const currencySymbol = store?.currencySymbol ?? "৳";

  try {
    return await db.$transaction(async (tx): Promise<SalesOrderResult> => {
      // Walk-in customers join the same customer table as web shoppers so
      // order history stays unified across channels.
      let customer = await tx.user.findFirst({
        where: { phone },
        select: { id: true },
      });
      if (!customer) {
        customer = await tx.user.create({
          data: {
            name: customerName,
            phone,
            email: `${phone}@placeholder.invalid`,
            passwordHash: "unused",
            roles: [Roles.Customer],
          },
          select: { id: true },
        });
      }

      const orderNumber = await nextOrderNumber(tx);
      // The zone drives warehouse preference, carrier and hub routing for
      // counter sales too, so the flow mirrors web checkout.
      const zone = input.zoneId
        ? await tx.deliveryZone.findUnique({
            where: { id: input.zoneId },
            select: { mode: true, deliveryCompanyId: true, warehouseId: true, deliveryHubId: true },
          })
        : null;
      const routing = await routeOrderToWarehouse(
        tx,
        [...quantityByProduct].map(([productId, quantity]) => ({ productId, quantity })),
        null,
        null,
        zone?.warehouseId ?? null,
      );

      let subtotalCents = 0;
      const snapshots: ItemSnapshot[] = [];
      for (const [productId, quantity] of [...quantityByProduct].sort(([a], [b]) =>
        a.localeCompare(b),
      )) {
        await tx.$queryRaw`SELECT id FROM "Product" WHERE id = ${productId} FOR UPDATE`;
        const current = await tx.product.findUnique({
          where: { id: productId },
          include: { campaignOffers: campaignPriceSelect },
        });
        if (!current || !current.active)
          throw new SaleRejected("A product in this sale is no longer available");
        const priced = withCampaignPrice(current);
        const unitPrice = effectivePriceCents(priced.priceCents, priced.salePriceCents);
        if (!isStoredMoney(unitPrice) || unitPrice === 0)
          throw new SaleRejected(`${current.name} has an invalid price`);
        const lineTotal = unitPrice * quantity;
        if (!isStoredMoney(lineTotal))
          throw new SaleRejected("This sale exceeds the supported order amount");
        subtotalCents += lineTotal;
        snapshots.push({
          productId,
          name: current.name,
          nameBn: current.nameBn,
          slug: current.slug,
          priceCents: unitPrice,
          quantity,
          imageUrl: current.images[0] ?? null,
        });

        const reserved = await tx.product.updateMany({
          where: { id: productId, active: true, stock: { gte: quantity } },
          data: { stock: { decrement: quantity } },
        });
        if (!reserved.count) throw new SaleRejected(`Insufficient stock for ${current.name}`);
        if (!routing.legacyGlobalStock && routing.warehouseId) {
          // Mirror the reservation at the routed warehouse and record the
          // movement in the same step so per-location stock stays in parity
          // with the global sellable total.
          const adjusted = await tx.stockLevel.updateMany({
            where: { warehouseId: routing.warehouseId, productId, qty: { gte: quantity } },
            data: { qty: { decrement: quantity } },
          });
          if (!adjusted.count)
            throw new SaleRejected(
              `Insufficient stock at the fulfilling warehouse for ${current.name}`,
            );
          await tx.stockMovement.create({
            data: {
              warehouseId: routing.warehouseId,
              productId,
              delta: -quantity,
              reason: "Sale",
              reasonCode: "Sale",
              referenceId: orderNumber,
              actorId: input.actor.id,
              actorName: input.actor.name ?? null,
            },
          });
        }
      }

      if (!isStoredMoney(subtotalCents))
        throw new SaleRejected("This sale exceeds the supported order amount");
      const totalCents = subtotalCents + shippingCents;
      if (!isStoredMoney(totalCents))
        throw new SaleRejected("This sale exceeds the supported order amount");

      const routedCarrierId =
        zone?.mode === "Courier" && zone.deliveryCompanyId ? zone.deliveryCompanyId : null;
      // Zone → hub routing with the same daily capacity validation as web orders.
      const hub = await assignDeliveryHub(tx, {
        zoneId: input.zoneId ?? null,
        warehouseId: routing.warehouseId,
      });
      if (hub.atCapacity)
        throw new SaleRejected("The delivery point for this zone is at capacity today");
      // Cash collected at the counter completes payment; COD collects on delivery.
      const paidInFull = input.payment === "CASH";
      const note = input.note?.trim().slice(0, 200) || null;

      // Commission (§6.1): attribute the order to the rep and snapshot the
      // commission from their current rate so later rate changes never rewrite
      // what this sale already earned.
      const rep = await tx.user.findUnique({
        where: { id: input.actor.id },
        select: { commissionBps: true },
      });
      const commissionCents = commissionCentsFor(totalCents, rep?.commissionBps ?? 0);

      const order = await tx.order.create({
        data: {
          number: orderNumber,
          userId: customer.id,
          status: paidInFull ? OrderStatuses.Paid : OrderStatuses.Confirmed,
          source: OrderSources.SalesRep,
          subtotalCents,
          shippingCents,
          totalCents,
          walletPaidCents: 0,
          paymentMethod: PaymentMethods.COD,
          paidAt: paidInFull ? new Date() : null,
          currencyCode,
          currencySymbol,
          zoneId: input.zoneId ?? null,
          warehouseId: routing.warehouseId,
          deliveryCompanyId: routedCarrierId,
          deliveryHubId: hub.deliveryHubId,
          salesRepId: input.actor.id,
          commissionCents,
          recipientName: customerName,
          phone,
          additionalInfo: note,
          line1: "Counter sale",
          city: "Counter sale",
          items: { create: snapshots },
        },
      });

      const actor: OrderActor = {
        id: input.actor.id,
        name: input.actor.name ?? "Sales",
        role: Roles.Sales,
      };
      await recordOrderEvent(tx, {
        orderId: order.id,
        type: paidInFull ? OrderEventTypes.PaymentConfirmed : OrderEventTypes.Confirmed,
        actor,
        toStatus: order.status,
        message: paidInFull
          ? "Counter sale created; cash collected"
          : "Counter sale created; payment due on delivery",
        amountCents: totalCents,
      });

      return { ok: true, orderNumber, customerId: customer.id };
    });
  } catch (error) {
    if (error instanceof SaleRejected) {
      log.warn("createSalesOrder rejected", { code: "SALE_REJECTED", reason: error.message });
      return { ok: false, error: error.message };
    }
    const message = error instanceof Error ? error.message : "";
    if (message === "OUT_OF_STOCK") {
      log.warn("createSalesOrder rejected", { code: "OUT_OF_STOCK" });
      return { ok: false, error: "Some items went out of stock. Refresh and try again" };
    }
    log.error("createSalesOrder failed", { error, actorId: input.actor.id });
    return { ok: false, error: "Could not complete the sale. Please try again" };
  }
}
