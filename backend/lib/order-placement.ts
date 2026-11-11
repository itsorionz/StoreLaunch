import { campaignPriceSelect, withCampaignPrice, lockCampaignPricing } from "./campaign-pricing";
import {
  OrderEventTypes,
  OrderStatuses,
  PaymentMethods,
  Roles,
  WalletTransactionTypes,
} from "@backend/lib/enums.mjs";
import { PaymentRecoveryPolicy } from "./payment-policy";
import { routeOrderToWarehouse } from "./order-routing";
import { assignDeliveryHub } from "./hub-routing";
import "server-only";
import type { PaymentMethod, Prisma } from "@backend/generated/prisma/client";
import type { CartData } from "./cart";
import { db } from "./db";
import { effectivePriceCents } from "./money";
import { checkedMoneySum, isStoredMoney } from "./money-limits";
import { recordOrderEvent, type OrderActor } from "./order-events";

type Placement = {
  userId: string;
  number?: string;
  cart: CartData;
  shippingCents: number;
  walletCents: number;
  paymentMethod: PaymentMethod;
  currencyCode: string;
  currencySymbol: string;
  actor?: OrderActor;
  recipientName: string;
  additionalInfo?: string;
  phone: string;
  line1: string;
  line2?: string;
  city: string;
  region?: string;
  postal?: string;
  zoneId?: string;
  zoneRateCents?: number;
  zoneCodFeeCents?: number;
  idempotencyKey?: string;
};

export async function nextOrderNumber(tx: Prisma.TransactionClient): Promise<string> {
  const [{ value }] = await tx.$queryRaw<{ value: bigint }[]>`
    SELECT nextval('"StoreOrderNumberSeq"') AS value
  `;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const date = `${parts.find((part) => part.type === "year")!.value}${parts.find((part) => part.type === "month")!.value}${parts.find((part) => part.type === "day")!.value}`;
  return `SL-${date}-${value.toString().padStart(8, "0")}`;
}

export async function createReservedOrder(input: Placement) {
  const { cart } = input;
  if (!cart.items.length) throw new Error("CART_CHANGED");
  if (!isStoredMoney(input.walletCents)) throw new Error("INVALID_WALLET_AMOUNT");
  if (!/^[A-Z]{3}$/.test(input.currencyCode) || !input.currencySymbol.trim())
    throw new Error("INVALID_CURRENCY");
  const subtotalCents = cart.items.reduce((sum, item) => {
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99)
      throw new Error("CART_CHANGED");
    const unitPrice = effectivePriceCents(item.product.priceCents, item.product.salePriceCents);
    if (!isStoredMoney(unitPrice) || unitPrice === 0) throw new Error("INVALID_ORDER_AMOUNT");
    const lineTotal = unitPrice * item.quantity;
    if (!isStoredMoney(lineTotal)) throw new Error("ORDER_AMOUNT_LIMIT");
    return checkedMoneySum(sum, lineTotal);
  }, 0);
  const totalCents = checkedMoneySum(subtotalCents, input.shippingCents);
  const walletPaidCents = Math.min(input.walletCents, totalCents);

  return db.$transaction(async (tx) => {
    // **IDEMPOTENCY**: Check if an order with this idempotency key already exists
    const existingOrder = input.idempotencyKey
      ? await tx.order.findFirst({ where: { idempotencyKey: input.idempotencyKey } })
      : null;
    if (existingOrder) {
      // Return the existing order (status may have changed, but data is consistent)
      return existingOrder;
    }
    const orderNumber = input.number ?? (await nextOrderNumber(tx));
    await tx.$queryRaw`SELECT pg_advisory_xact_lock_shared(hashtext('store-currency'))::text`;
    const store = await tx.storeSettings.findUnique({
      where: { singletonKey: 1 },
      select: { currencyCode: true },
    });
    if (store && store.currencyCode !== input.currencyCode) throw new Error("CURRENCY_CHANGED");
    await lockCampaignPricing(tx, true);
    // The delivery zone drives warehouse preference, carrier and hub routing;
    // a missing zone keeps legacy behavior everywhere downstream.
    const zone = input.zoneId
      ? await tx.deliveryZone.findUnique({
          where: { id: input.zoneId },
          select: { mode: true, deliveryCompanyId: true, warehouseId: true, deliveryHubId: true },
        })
      : null;
    // Route to the nearest warehouse that can fulfil every line. Orders are
    // reserved per warehouse; pre-backfill datasets keep global-stock behavior.
    const routing = await routeOrderToWarehouse(
      tx,
      cart.items.map((item) => ({ productId: item.product.id, quantity: item.quantity })),
      input.city,
      input.region,
      zone?.warehouseId ?? null,
    );
    // Claim the submitted cart lines. A second checkout of this snapshot must fail.
    const ownedCart = await tx.cart.findFirst({
      where: { id: cart.id, userId: input.userId },
      select: { id: true },
    });
    if (!ownedCart) throw new Error("CART_CHANGED");
    await tx.$queryRaw`SELECT id FROM "Cart" WHERE id = ${cart.id} FOR UPDATE`;
    for (const item of [...cart.items].sort((a, b) => a.product.id.localeCompare(b.product.id))) {
      if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99)
        throw new Error("CART_CHANGED");
      const claimed = await tx.cartItem.deleteMany({
        where: {
          id: item.id,
          cartId: cart.id,
          productId: item.product.id,
          quantity: item.quantity,
          selected: true,
        },
      });
      if (!claimed.count) throw new Error("CART_CHANGED");
      await tx.$queryRaw`SELECT id FROM "Product" WHERE id = ${item.product.id} FOR UPDATE`;
      const current = await tx.product.findUnique({
        where: { id: item.product.id },
        include: { campaignOffers: campaignPriceSelect },
      });
      if (
        !current ||
        current.priceCents !== item.product.priceCents ||
        withCampaignPrice(current).salePriceCents !== item.product.salePriceCents
      )
        throw new Error("CART_CHANGED");
      const reserved = await tx.product.updateMany({
        where: {
          id: item.product.id,
          active: true,
          stock: { gte: item.quantity },
          priceCents: current.priceCents,
          salePriceCents: current.salePriceCents,
        },
        data: { stock: { decrement: item.quantity } },
      });
      if (!reserved.count) throw new Error("OUT_OF_STOCK");
      if (!routing.legacyGlobalStock && routing.warehouseId) {
        // Mirror the reservation at the routed warehouse and record the
        // movement so the per-location ledger stays auditable.
        const adjusted = await tx.stockLevel.updateMany({
          where: {
            warehouseId: routing.warehouseId,
            productId: item.product.id,
            qty: { gte: item.quantity },
          },
          data: { qty: { decrement: item.quantity } },
        });
        if (!adjusted.count) throw new Error("OUT_OF_STOCK");
        await tx.stockMovement.create({
          data: {
            warehouseId: routing.warehouseId,
            productId: item.product.id,
            delta: -item.quantity,
            reason: "Sale",
            reasonCode: "Sale",
            referenceId: orderNumber,
            actorId: input.actor?.id ?? input.userId,
            actorName: input.actor?.name ?? null,
          },
        });
      }
    }
    const fullyPaid = walletPaidCents === totalCents;
    // Zone → carrier routing: courier zones pre-assign the delivery company at
    // placement; own-rider zones are left for dispatch to assign a rider.
    const routedCarrierId =
      zone?.mode === "Courier" && zone.deliveryCompanyId ? zone.deliveryCompanyId : null;
    // Zone → hub routing with daily capacity validation.
    const hub = await assignDeliveryHub(tx, {
      zoneId: input.zoneId ?? null,
      city: input.city,
      region: input.region,
      warehouseId: routing.warehouseId,
    });
    if (hub.atCapacity) throw new Error("HUB_AT_CAPACITY");
    const order = await tx.order.create({
      data: {
        number: orderNumber,
        idempotencyKey: input.idempotencyKey ?? orderNumber, // Use order number as fallback key
        userId: input.userId,
        status: fullyPaid ? OrderStatuses.Paid : OrderStatuses.Pending,
        subtotalCents,
        shippingCents: input.shippingCents,
        zoneId: input.zoneId ?? null,
        zoneRateCents: input.zoneRateCents ?? null,
        zoneCodFeeCents: input.zoneCodFeeCents ?? null,
        totalCents,
        walletPaidCents,
        paymentMethod: input.paymentMethod,
        paidAt: fullyPaid ? new Date() : null,
        currencyCode: input.currencyCode,
        currencySymbol: input.currencySymbol,
        warehouseId: routing.warehouseId,
        deliveryCompanyId: routedCarrierId,
        deliveryHubId: hub.deliveryHubId,
        recipientName: input.recipientName,
        phone: input.phone,
        line1: input.line1,
        additionalInfo: input.additionalInfo?.trim() || null,
        line2: input.line2 || null,
        city: input.city,
        region: input.region || null,
        postal: input.postal || null,
        items: {
          create: cart.items.map((item) => ({
            productId: item.product.id,
            name: item.product.name,
            nameBn: item.product.nameBn,
            slug: item.product.slug,
            priceCents: effectivePriceCents(item.product.priceCents, item.product.salePriceCents),
            quantity: item.quantity,
            imageUrl: item.product.images[0] ?? null,
          })),
        },
      },
    });
    if (!fullyPaid && input.paymentMethod === PaymentMethods.GATEWAY) {
      const expiresAt = new Date(Date.now() + PaymentRecoveryPolicy.reservationMs);
      await tx.paymentAttempt.create({
        data: { orderId: order.id, expiresAt, nextCheckAt: expiresAt },
      });
    }
    if (walletPaidCents > 0) {
      const debited = await tx.wallet.updateMany({
        where: { userId: input.userId, balanceCents: { gte: walletPaidCents } },
        data: { balanceCents: { decrement: walletPaidCents } },
      });
      if (!debited.count) throw new Error("INSUFFICIENT_WALLET");
      const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId: input.userId } });
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          orderId: order.id,
          amountCents: -walletPaidCents,
          balanceAfterCents: wallet.balanceCents,
          type: WalletTransactionTypes.ORDER_PAYMENT,
          note: "Payment for order",
        },
      });
    }
    const buyer = input.actor ?? {
      id: input.userId,
      name: (await tx.user.findUniqueOrThrow({ where: { id: input.userId } })).name,
      role: Roles.Customer,
    };
    await recordOrderEvent(tx, {
      orderId: order.id,
      type: OrderEventTypes.Placed,
      actor: buyer,
      toStatus: order.status,
      message: "Order placed and inventory reserved",
      amountCents: totalCents,
    });
    if (fullyPaid)
      await recordOrderEvent(tx, {
        orderId: order.id,
        type: OrderEventTypes.PaymentConfirmed,
        actor: buyer,
        toStatus: OrderStatuses.Paid,
        message: "Order paid in full from wallet",
        amountCents: walletPaidCents,
      });
    return order;
  });
}
