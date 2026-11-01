import {
  CodSettlementMethods,
  OrderCurrencySources,
  OrderEventTypes,
  OrderStatuses,
  PaymentMethods,
  Roles,
} from "@backend/lib/enums.mjs";
import "server-only";
import { db } from "./db";
import { recordOrderEvent, type OrderActor } from "./order-events";

type Result = { ok: true; number: string } | { ok: false; error: string };

/** Record physical receipt of the full collected amount; this does not initiate a transfer. */
export async function remitCodCollection(
  orderId: string,
  reference: string,
  actor: OrderActor,
  method: (typeof CodSettlementMethods)[keyof typeof CodSettlementMethods] = CodSettlementMethods.Other,
): Promise<Result> {
  if (actor.role !== Roles.Admin)
    return { ok: false, error: "Only an admin can confirm store receipt" };
  if (
    !Object.values(CodSettlementMethods).includes(
      method as (typeof CodSettlementMethods)[keyof typeof CodSettlementMethods],
    )
  )
    return { ok: false, error: "Choose a valid receipt method" };
  const note = reference.trim();
  if (note.length < 3 || note.length > 120)
    return { ok: false, error: "Enter a receipt or deposit reference (3–120 characters)" };
  return db.$transaction(async (tx): Promise<Result> => {
    const admin = await tx.user.findUnique({ where: { id: actor.id } });
    if (!admin?.active || !admin.roles.includes(Roles.Admin))
      return { ok: false, error: "Unauthorized" };
    await tx.$queryRaw`SELECT id FROM "CodCollection" WHERE "orderId" = ${orderId} FOR UPDATE`;
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { codCollection: true },
    });
    if (
      !order ||
      order.status !== OrderStatuses.Delivered ||
      order.paymentMethod !== PaymentMethods.COD ||
      !order.codCollection
    )
      return {
        ok: false,
        error: "No confirmed COD collection is available for this delivered order",
      };
    const collection = order.codCollection;
    if (collection.remittedAt)
      return collection.remittanceReference === note
        ? { ok: true, number: order.number }
        : { ok: false, error: "Store receipt is already recorded with a different reference" };
    const duplicate = await tx.codSettlement.findUnique({
      where: { reference: note },
      include: { lines: true },
    });
    if (duplicate)
      return {
        ok: false,
        error: duplicate.lines.some((line) => line.codCollectionId === collection.id)
          ? "This receipt reference recorded a previous partial settlement; enter a new reference for this receipt"
          : "This receipt reference belongs to another settlement",
      };
    const prior = await tx.codSettlementLine.aggregate({
      where: { codCollectionId: collection.id },
      _sum: { appliedCents: true },
    });
    const outstandingCents = Math.max(0, collection.amountCents - (prior._sum.appliedCents ?? 0));
    if (!outstandingCents) return { ok: false, error: "This collection has no remaining balance" };
    const settlement = await tx.codSettlement.create({
      data: {
        currencyCode: collection.currencyCode,
        method: method as (typeof CodSettlementMethods)[keyof typeof CodSettlementMethods],
        reference: note,
        expectedCents: outstandingCents,
        receivedCents: outstandingCents,
        varianceCents: 0,
        receivedById: admin.id,
        receivedByName: admin.name,
        lines: {
          create: [
            {
              codCollectionId: collection.id,
              outstandingCents,
              expectedCents: outstandingCents,
              receivedCents: outstandingCents,
              appliedCents: outstandingCents,
              varianceCents: 0,
            },
          ],
        },
      },
    });
    const changed = await tx.codCollection.updateMany({
      where: { id: collection.id, remittedAt: null },
      data: {
        remittedAt: new Date(),
        remittedById: admin.id,
        remittedByName: admin.name,
        remittanceReference: note,
      },
    });
    if (!changed.count) {
      const fresh = await tx.codCollection.findUniqueOrThrow({ where: { id: collection.id } });
      return fresh.remittanceReference === note
        ? { ok: true, number: order.number }
        : { ok: false, error: "Store receipt was recorded by another request. Refresh this order" };
    }
    await recordOrderEvent(tx, {
      orderId,
      type: OrderEventTypes.CodRemitted,
      actor: { id: admin.id, name: admin.name, role: Roles.Admin },
      amountCents: collection.amountCents,
      message: `Store received full COD collection. Reference: ${note}`,
    });
    await recordOrderEvent(tx, {
      orderId,
      type: OrderEventTypes.CodSettlementRecorded,
      actor: { id: admin.id, name: admin.name, role: Roles.Admin },
      amountCents: outstandingCents,
      message: `Full COD receipt recorded as settlement ${settlement.id}, reference ${note}`,
    });
    return { ok: true, number: order.number };
  });
}

/** An admin must consult original records before confirming a historical currency. */
export async function confirmLegacyOrderCurrency(
  orderId: string,
  code: string,
  symbol: string,
  evidence: string,
  actor: OrderActor,
): Promise<Result> {
  if (actor.role !== Roles.Admin)
    return { ok: false, error: "Only an admin can confirm historical currency" };
  if (
    !/^[A-Z]{3}$/.test(code) ||
    !symbol.trim() ||
    symbol.trim().length > 12 ||
    evidence.trim().length < 5 ||
    evidence.trim().length > 500
  )
    return {
      ok: false,
      error: "Provide a three-letter currency code, symbol and evidence from original records",
    };
  return db.$transaction(async (tx): Promise<Result> => {
    const admin = await tx.user.findUnique({ where: { id: actor.id } });
    if (!admin?.active || !admin.roles.includes(Roles.Admin))
      return { ok: false, error: "Unauthorized" };
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order) return { ok: false, error: "Order not found" };
    if (order.currencySource !== OrderCurrencySources.Unrecorded || order.currencyCode)
      return { ok: false, error: "Order currency has already been recorded and cannot be changed" };
    const changed = await tx.order.updateMany({
      where: {
        id: orderId,
        currencyCode: null,
        currencySource: OrderCurrencySources.Unrecorded,
      },
      data: {
        currencyCode: code,
        currencySymbol: symbol.trim(),
        currencySource: OrderCurrencySources.AdminConfirmed,
      },
    });
    if (!changed.count)
      return {
        ok: false,
        error: "Order currency was recorded by another request. Refresh this order",
      };
    await recordOrderEvent(tx, {
      orderId,
      type: OrderEventTypes.CurrencyConfirmed,
      actor: { id: admin.id, name: admin.name, role: Roles.Admin },
      message: `Historical currency confirmed as ${code}. Evidence: ${evidence.trim()}`,
    });
    return { ok: true, number: order.number };
  });
}
