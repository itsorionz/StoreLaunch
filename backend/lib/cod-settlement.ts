import "server-only";
import { Prisma } from "@backend/generated/prisma/client";
import { CodSettlementMethods, OrderEventTypes, OrderStatuses, Roles } from "./enums.mjs";
import { db } from "./db";
import { recordOrderEvent, type OrderActor } from "./order-events";
import { logger } from "./logger";

const log = logger.child({ scope: "cod-settlement" });

export type CodSettlementLineInput = {
  collectionId: string;
  expectedCents: number;
  receivedCents: number;
  varianceReason?: string;
};
export type CodSettlementResult = { ok: true; settlementId: string } | { ok: false; error: string };
const MAX_CENTS = 2_147_483_647;

export async function createCodSettlement(
  input: {
    method: string;
    reference: string;
    lines: CodSettlementLineInput[];
    note?: string;
    /** Per-courier batch (§9.1). When set, every line must belong to this courier. */
    courierName?: string;
  },
  actor: OrderActor,
): Promise<CodSettlementResult> {
  if (actor.role !== Roles.Admin && actor.role !== Roles.SuperAdmin)
    return { ok: false, error: "Only an admin can record a COD settlement" };
  const reference = input.reference.trim();
  if (reference.length < 3 || reference.length > 120 || (input.note?.trim().length ?? 0) > 500)
    return { ok: false, error: "Enter a valid receipt reference and note" };
  const requestedCourier = input.courierName?.trim() ?? "";
  if (requestedCourier.length > 120)
    return { ok: false, error: "Use at most 120 characters for the courier name" };
  if (
    !Object.values(CodSettlementMethods).includes(
      input.method as (typeof CodSettlementMethods)[keyof typeof CodSettlementMethods],
    )
  )
    return { ok: false, error: "Choose a valid settlement method" };
  if (
    !input.lines.length ||
    input.lines.length > 100 ||
    new Set(input.lines.map((line) => line.collectionId)).size !== input.lines.length
  )
    return { ok: false, error: "Select between one and 100 unique COD collections" };
  if (
    input.lines.some(
      (line) =>
        !Number.isSafeInteger(line.expectedCents) ||
        line.expectedCents <= 0 ||
        line.expectedCents > MAX_CENTS ||
        !Number.isSafeInteger(line.receivedCents) ||
        line.receivedCents < 0 ||
        line.receivedCents > MAX_CENTS ||
        (line.varianceReason?.trim().length ?? 0) > 500,
    )
  )
    return {
      ok: false,
      error: "Enter valid expected and received amounts for every selected collection",
    };

  try {
    return await db.$transaction(async (tx) => {
      const admin = await tx.user.findUnique({ where: { id: actor.id } });
      if (!admin?.active || !admin.roles.includes(Roles.Admin))
        return { ok: false, error: "Unauthorized" } as const;
      const ids = input.lines.map((line) => line.collectionId).sort();
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM "CodCollection" WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`,
      );
      const collections = await tx.codCollection.findMany({
        where: { id: { in: ids } },
        include: {
          order: {
            select: {
              number: true,
              status: true,
              deliveryCompany: { select: { name: true } },
            },
          },
        },
      });
      if (collections.length !== ids.length)
        return {
          ok: false,
          error: "A selected COD collection no longer exists. Refresh and try again",
        } as const;
      const byId = new Map(collections.map((collection) => [collection.id, collection]));
      const allocations = [];
      const couriers = new Set<string>();
      let expectedTotal = 0;
      let receivedTotal = 0;
      for (const line of input.lines) {
        const collection = byId.get(line.collectionId)!;
        // Courier attribution for per-courier batches: registered delivery company
        // wins; the free-text rider/courier snapshot on the collection is the fallback.
        const courier = collection.order.deliveryCompany?.name ?? collection.courierName;
        if (requestedCourier && courier !== requestedCourier)
          return {
            ok: false,
            error: `Order ${collection.order.number} was handled by ${courier}, not ${requestedCourier}`,
          } as const;
        couriers.add(courier);
        if (collection.order.status !== OrderStatuses.Delivered)
          return {
            ok: false,
            error: `Order ${collection.order.number} is no longer delivered`,
          } as const;
        if (collection.currencyCode === "")
          return {
            ok: false,
            error: `Collection ${collection.order.number} has no currency`,
          } as const;
        if (collections.some((other) => other.currencyCode !== collection.currencyCode))
          return { ok: false, error: "Settle one currency per batch" } as const;
        const prior = await tx.codSettlementLine.aggregate({
          where: { codCollectionId: collection.id },
          _sum: { appliedCents: true },
        });
        const outstandingCents = collection.remittedAt
          ? 0
          : Math.max(0, collection.amountCents - (prior._sum.appliedCents ?? 0));
        if (!outstandingCents)
          return {
            ok: false,
            error: `Collection for order ${collection.order.number} is already fully settled`,
          } as const;
        if (line.expectedCents > outstandingCents)
          return {
            ok: false,
            error: `Expected amount for order ${collection.order.number} exceeds its remaining ${outstandingCents} cents`,
          } as const;
        const varianceCents = line.receivedCents - line.expectedCents;
        if (varianceCents && !line.varianceReason?.trim())
          return {
            ok: false,
            error: `Add a reason for the amount variance on order ${collection.order.number}`,
          } as const;
        const appliedCents = Math.min(line.receivedCents, outstandingCents);
        allocations.push({
          collection,
          outstandingCents,
          expectedCents: line.expectedCents,
          receivedCents: line.receivedCents,
          appliedCents,
          varianceCents,
          varianceReason: line.varianceReason?.trim() || null,
        });
        expectedTotal += line.expectedCents;
        receivedTotal += line.receivedCents;
      }
      if (expectedTotal > MAX_CENTS || receivedTotal > MAX_CENTS)
        return {
          ok: false,
          error:
            "Batch totals exceed the supported amount. Split this settlement into smaller batches",
        } as const;
      const varianceCents = receivedTotal - expectedTotal;
      const settlement = await tx.codSettlement.create({
        data: {
          currencyCode: allocations[0]!.collection.currencyCode,
          method: input.method as (typeof CodSettlementMethods)[keyof typeof CodSettlementMethods],
          reference,
          // Per-courier batches are stamped with the courier; mixed batches stay
          // unattributed (null) rather than guessing an owner.
          courierName: couriers.size === 1 ? [...couriers][0]! : null,
          expectedCents: expectedTotal,
          receivedCents: receivedTotal,
          varianceCents,
          varianceReason: varianceCents
            ? input.note?.trim() ||
              allocations
                .map((line) => line.varianceReason)
                .filter(Boolean)
                .join("; ")
            : null,
          note: input.note?.trim() || null,
          receivedById: admin.id,
          receivedByName: admin.name,
          lines: {
            create: allocations.map((line) => ({
              codCollectionId: line.collection.id,
              outstandingCents: line.outstandingCents,
              expectedCents: line.expectedCents,
              receivedCents: line.receivedCents,
              appliedCents: line.appliedCents,
              varianceCents: line.varianceCents,
              varianceReason: line.varianceReason,
            })),
          },
        },
      });
      for (const line of allocations) {
        const alreadyApplied = line.collection.remittedAt
          ? line.collection.amountCents
          : line.collection.amountCents - line.outstandingCents;
        if (alreadyApplied + line.appliedCents >= line.collection.amountCents) {
          await tx.codCollection.updateMany({
            where: { id: line.collection.id, remittedAt: null },
            data: {
              remittedAt: new Date(),
              remittedById: admin.id,
              remittedByName: admin.name,
              remittanceReference: reference,
            },
          });
          await recordOrderEvent(tx, {
            orderId: line.collection.orderId,
            type: OrderEventTypes.CodRemitted,
            actor: { id: admin.id, name: admin.name, role: Roles.Admin },
            amountCents: line.appliedCents,
            message: `COD collection fully settled. Batch ${reference}; received ${line.receivedCents} cents`,
          });
        }
        await recordOrderEvent(tx, {
          orderId: line.collection.orderId,
          type: OrderEventTypes.CodSettlementRecorded,
          actor: { id: admin.id, name: admin.name, role: Roles.Admin },
          amountCents: line.receivedCents,
          message: `COD settlement ${reference}: expected ${line.expectedCents}, received ${line.receivedCents}, applied ${line.appliedCents}, variance ${line.varianceCents}${line.varianceReason ? ` (${line.varianceReason})` : ""}`,
        });
      }
      return { ok: true, settlementId: settlement.id } as const;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      log.warn("createCodSettlement rejected", { code: "P2002", reference: input.reference });
      return { ok: false, error: "This receipt reference has already been recorded" };
    }
    log.error("createCodSettlement failed", { error, reference: input.reference });
    throw error;
  }
}
