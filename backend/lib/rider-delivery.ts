import {
  DeliveryRelationships,
  DeliveryAttemptReasons,
  Roles,
  OrderStatuses,
  OrderEventTypes,
} from "@backend/lib/enums.mjs";
import "server-only";
import { z } from "zod";
import { db } from "./db";
import { recordId, personName, checkboxValue } from "./form-validation";
import { recordOrderEvent } from "./order-events";
import { transitionOrder, type HandoverProof } from "./order-lifecycle";
import type { DeliveryAttempt, DeliveryProof } from "@backend/generated/prisma/client";

// View types for presentation code: the delivery evidence UI must not import
// the generated ORM client, so the row shapes are re-exported from here.
export type DeliveryAttemptView = DeliveryAttempt;
export type DeliveryProofView = Omit<DeliveryProof, "photoData">;

export const attemptReasons = {
  [DeliveryAttemptReasons.noAnswer]: "Customer did not answer",
  [DeliveryAttemptReasons.unavailable]: "Customer unavailable",
  [DeliveryAttemptReasons.addressIssue]: "Address could not be found",
  [DeliveryAttemptReasons.refused]: "Customer refused delivery",
  [DeliveryAttemptReasons.rescheduled]: "Customer requested another time",
  [DeliveryAttemptReasons.other]: "Other issue",
};
export const attemptSchema = z.object({
  orderId: recordId,
  reason: z.enum([
    DeliveryAttemptReasons.noAnswer,
    DeliveryAttemptReasons.unavailable,
    DeliveryAttemptReasons.addressIssue,
    DeliveryAttemptReasons.refused,
    DeliveryAttemptReasons.rescheduled,
    DeliveryAttemptReasons.other,
  ]),
  note: z.string().trim().min(5, "Describe what happened in at least 5 characters").max(1000),
  nextAttempt: z
    .string()
    .optional()
    .default("")
    .refine(
      (value) =>
        !value ||
        (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) &&
          Number.isFinite(new Date(`${value}+06:00`).getTime()) &&
          new Date(new Date(`${value}+06:00`).getTime() + 6 * 3600000)
            .toISOString()
            .slice(0, 16) === value &&
          new Date(`${value}+06:00`).getTime() > Date.now() &&
          new Date(`${value}+06:00`).getTime() < Date.now() + 30 * 86400000),
      "Choose a future time within 30 days (Bangladesh time)",
    ),
});
export const proofSchema = z.object({
  orderId: recordId,
  receivedBy: personName,
  relationship: z.enum([
    DeliveryRelationships.customer,
    DeliveryRelationships.family,
    DeliveryRelationships.reception,
    DeliveryRelationships.other,
  ]),
  note: z.string().trim().max(1000).default(""),
  handoverConfirmed: checkboxValue.refine(
    Boolean,
    "Confirm that the parcel was handed to the receiver",
  ),
  cashCollected: checkboxValue,
});

type DeliveryResult = { ok: true; number: string } | { ok: false; error: string };
export async function recordDeliveryAttempt(
  userId: string,
  input: z.infer<typeof attemptSchema>,
): Promise<DeliveryResult> {
  return db.$transaction(async (tx): Promise<DeliveryResult> => {
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${input.orderId} FOR UPDATE`;
    const rider = await tx.rider.findFirst({
      where: { userId, active: true, user: { active: true, roles: { has: Roles.Rider } } },
    });
    const order = await tx.order.findUnique({ where: { id: input.orderId } });
    if (!rider || !order || order.riderId !== rider.id)
      return { ok: false, error: "This delivery is not assigned to you" };
    if (order.status !== OrderStatuses.Shipped)
      return { ok: false, error: "Record attempts only after collecting and shipping the parcel" };
    // Prevent double-taps from creating duplicate evidence.
    const duplicate = await tx.deliveryAttempt.findFirst({
      where: {
        orderId: order.id,
        riderId: rider.id,
        reason: input.reason,
        note: input.note,
        nextAttemptAt: input.nextAttempt ? new Date(`${input.nextAttempt}+06:00`) : null,
        createdAt: { gte: new Date(Date.now() - 30000) },
      },
    });
    if (!duplicate) {
      await tx.deliveryAttempt.create({
        data: {
          orderId: order.id,
          riderId: rider.id,
          reason: input.reason,
          note: input.note,
          nextAttemptAt: input.nextAttempt ? new Date(`${input.nextAttempt}+06:00`) : null,
        },
      });
      await recordOrderEvent(tx, {
        orderId: order.id,
        type: OrderEventTypes.DeliveryAttempted,
        actor: { id: userId, name: rider.name, role: Roles.Rider },
        message: `${attemptReasons[input.reason]}: ${input.note}`,
      });
    }
    return { ok: true, number: order.number };
  });
}

export async function completeRiderDelivery(
  userId: string,
  input: z.infer<typeof proofSchema>,
  photo: Pick<HandoverProof, "photoKey" | "photoMime"> = {},
): Promise<DeliveryResult> {
  if (
    !input.handoverConfirmed ||
    !personName.safeParse(input.receivedBy).success ||
    !(
      [
        DeliveryRelationships.customer,
        DeliveryRelationships.family,
        DeliveryRelationships.reception,
        DeliveryRelationships.other,
      ] as readonly string[]
    ).includes(input.relationship) ||
    input.note.length > 1000
  )
    return { ok: false, error: "Confirm a valid receiver and handover before completing delivery" };
  const rider = await db.rider.findFirst({
    where: { userId, active: true, user: { active: true, roles: { has: Roles.Rider } } },
  });
  if (!rider) return { ok: false, error: "Sign in as an active rider" };
  return transitionOrder(input.orderId, OrderStatuses.Delivered, {
    riderId: rider.id,
    cashCollected: input.cashCollected,
    actor: { id: userId, name: rider.name, role: Roles.Rider },
    proof: {
      receivedBy: input.receivedBy,
      relationship: input.relationship,
      note: input.note,
      ...photo,
    },
  });
}
