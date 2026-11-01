import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "./db";
import {
  AfterSalesKinds,
  AfterSalesStatuses,
  OrderEventTypes,
  OrderStatuses,
  PaymentAttemptStatuses,
  PaymentMethods,
  RefundStatuses,
  RefundTenders,
  ReturnDispositions,
  Roles,
  WalletTransactionTypes,
} from "./enums.mjs";
import { recordId, validationFailure } from "./form-validation";
import { PRE_DISPATCH_STATUSES } from "./order-status";
import { creditWalletBalance } from "./wallet-balance";
import { applyWarehouseStockDelta } from "./stock-ledger";
import { recordOrderEvent, type OrderActor } from "./order-events";

export type AfterSalesResult = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  requestId?: string;
};
const requestSchema = z.object({
  orderId: recordId,
  kind: z.enum([AfterSalesKinds.Cancellation, AfterSalesKinds.Return, AfterSalesKinds.Replacement]),
  reason: z
    .string()
    .trim()
    .min(5, "Explain the request in at least 5 characters")
    .max(300, "Use at most 300 characters"),
  note: z.string().trim().max(1000, "Use at most 1,000 characters").optional().default(""),
});

export async function createAfterSalesRequest(
  userId: string,
  input: unknown,
): Promise<AfterSalesResult> {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, ...validationFailure(parsed.error) };
  const data = parsed.data;
  const itemInputs = new Map<string, number>();
  const rawItems = Array.isArray((input as { items?: unknown })?.items)
    ? (input as { items: unknown[] }).items
    : [];
  if (data.kind !== AfterSalesKinds.Cancellation) {
    if (!rawItems.length)
      return { ok: false, fieldErrors: { items: ["Select at least one item"] } };
    for (const entry of rawItems) {
      if (typeof entry !== "string")
        return { ok: false, fieldErrors: { items: ["Choose valid order items"] } };
      const [id, quantity, ...rest] = entry.split(":");
      const parsedId = recordId.safeParse(id);
      const parsedQuantity = z.coerce.number().int().min(1).max(99).safeParse(quantity);
      if (rest.length || !parsedId.success || !parsedQuantity.success || itemInputs.has(id!))
        return { ok: false, fieldErrors: { items: ["Choose valid item quantities"] } };
      itemInputs.set(id!, parsedQuantity.data);
    }
  }
  const order = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${data.orderId} FOR UPDATE`;
    const current = await tx.order.findFirst({
      where: { id: data.orderId, userId },
      include: { items: true },
    });
    if (!current) return { error: "Order not found" } as const;
    if (current.replacementForOrderId)
      return {
        error: "Replacement orders cannot be cancelled or returned through this request form",
      } as const;
    if (
      [AfterSalesKinds.Cancellation, AfterSalesKinds.Return, AfterSalesKinds.Replacement].includes(
        data.kind,
      ) &&
      (await tx.afterSalesRequest.count({
        where: {
          orderId: current.id,
          status: {
            in: [
              AfterSalesStatuses.Requested,
              AfterSalesStatuses.Approved,
              AfterSalesStatuses.Received,
              AfterSalesStatuses.Inspected,
            ],
          },
        },
      }))
    )
      return { error: "An after-sales request for this order is already being reviewed" } as const;
    const now = new Date();
    if (data.kind === AfterSalesKinds.Cancellation) {
      if (!(PRE_DISPATCH_STATUSES as readonly string[]).includes(current.status))
        return { error: "Cancellation requests are available before dispatch" } as const;
      if (
        current.status === OrderStatuses.Pending &&
        current.paymentMethod === PaymentMethods.GATEWAY
      ) {
        const attempt = await tx.paymentAttempt.findUnique({ where: { orderId: current.id } });
        if (
          !attempt ||
          attempt.requiresManualReview ||
          !(
            [
              PaymentAttemptStatuses.Created,
              PaymentAttemptStatuses.Failed,
              PaymentAttemptStatuses.Expired,
            ] as readonly string[]
          ).includes(attempt.status)
        )
          return { error: "Payment must be verified before requesting cancellation" } as const;
      }
    } else {
      if (current.status !== OrderStatuses.Delivered || !current.deliveredAt)
        return { error: "Returns and replacements can be requested after delivery" } as const;
      const settings = await tx.storeSettings.findUnique({ where: { singletonKey: 1 } });
      const days = settings?.returnWindowDays ?? 7;
      if (days === 0 || now.getTime() - current.deliveredAt.getTime() > days * 86400000)
        return { error: "The return request window for this order has closed" } as const;
      if (
        !itemInputs.size ||
        [...itemInputs.keys()].some((id) => !current.items.some((item) => item.id === id))
      )
        return { error: "Select items from this order" } as const;
      const previous = await tx.afterSalesRequest.findMany({
        where: {
          orderId: current.id,
          kind: { in: [AfterSalesKinds.Return, AfterSalesKinds.Replacement] },
          status: { not: AfterSalesStatuses.Rejected },
        },
        include: { items: true },
      });
      for (const [itemId, quantity] of itemInputs) {
        const item = current.items.find((line) => line.id === itemId)!;
        const used = previous.reduce((sum, request) => {
          const prior = request.items.find((line) => line.orderItemId === itemId);
          return sum + (prior?.approvedQuantity ?? prior?.requestedQuantity ?? 0);
        }, 0);
        if (quantity + used > item.quantity)
          return {
            error: `Requested quantity for ${item.name} exceeds the quantity available for return`,
          } as const;
      }
    }
    const created = await tx.afterSalesRequest.create({
      data: {
        orderId: current.id,
        userId,
        kind: data.kind,
        reason: data.reason,
        customerNote: data.note || null,
        items: {
          create: [...itemInputs].map(([orderItemId, requestedQuantity]) => ({
            orderItemId,
            requestedQuantity,
          })),
        },
      },
    });
    const customer = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { name: true },
    });
    await recordOrderEvent(tx, {
      orderId: current.id,
      type: OrderEventTypes.ReturnRequested,
      actor: { id: userId, name: customer.name, role: Roles.Customer },
      message: `${data.kind} request submitted (${created.id})`,
      dedupeKey: `after-sales-request:${created.id}`,
    });
    return { requestId: created.id } as const;
  });
  return "error" in order
    ? { ok: false, error: order.error }
    : { ok: true, requestId: order.requestId };
}

const reviewSchema = z.object({
  requestId: recordId,
  decision: z.enum(["Approve", "Reject"]),
  adminNote: z.string().trim().min(5, "Add a review note").max(500),
  approvedItems: z.array(z.string()).default([]),
});
export async function reviewAfterSales(
  actor: OrderActor,
  input: unknown,
): Promise<AfterSalesResult> {
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) return { ok: false, ...validationFailure(parsed.error) };
  const value = parsed.data;
  return db.$transaction(async (tx) => {
    const request = await tx.afterSalesRequest.findUnique({
      where: { id: value.requestId },
      include: { items: true, order: { include: { items: true } } },
    });
    if (!request) return { ok: false, error: "Request not found" };
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${request.orderId} FOR UPDATE`;
    if (request.status !== AfterSalesStatuses.Requested)
      return { ok: false, error: "Request has already been reviewed" };
    if (value.decision === "Reject") {
      await tx.afterSalesRequest.update({
        where: { id: request.id },
        data: {
          status: AfterSalesStatuses.Rejected,
          adminNote: value.adminNote,
          reviewedAt: new Date(),
        },
      });
      await recordOrderEvent(tx, {
        orderId: request.orderId,
        type: OrderEventTypes.ReturnRejected,
        actor,
        message: `Request ${request.id} declined: ${value.adminNote}`,
      });
      return { ok: true, requestId: request.id };
    }
    const quantities = new Map<string, number>();
    for (const row of value.approvedItems) {
      const [id, quantity, ...rest] = row.split(":");
      const parsedId = recordId.safeParse(id),
        parsedQuantity = z.coerce.number().int().min(0).max(99).safeParse(quantity);
      if (rest.length || !parsedId.success || !parsedQuantity.success || quantities.has(id!))
        return { ok: false, fieldErrors: { approvedItems: ["Enter valid approved quantities"] } };
      quantities.set(id!, parsedQuantity.data);
    }
    if (
      request.kind !== AfterSalesKinds.Cancellation &&
      (quantities.size !== request.items.length ||
        request.items.some(
          (item) => !quantities.has(item.id) || quantities.get(item.id)! > item.requestedQuantity,
        ))
    )
      return {
        ok: false,
        fieldErrors: {
          approvedItems: ["Review each item and keep approved quantities within the request"],
        },
      };
    if (
      request.kind !== AfterSalesKinds.Cancellation &&
      !request.items.some((item) => quantities.get(item.id)! > 0)
    )
      return {
        ok: false,
        fieldErrors: { approvedItems: ["Approve at least one unit or reject the request"] },
      };
    await tx.afterSalesRequest.update({
      where: { id: request.id },
      data: {
        status: AfterSalesStatuses.Approved,
        adminNote: value.adminNote,
        reviewedAt: new Date(),
        items: {
          update: request.items.map((item) => ({
            where: { id: item.id },
            data: { approvedQuantity: quantities.get(item.id)! },
          })),
        },
      },
    });
    await recordOrderEvent(tx, {
      orderId: request.orderId,
      type: OrderEventTypes.ReturnApproved,
      actor,
      message: `${request.kind} request approved (${request.id})`,
    });
    return { ok: true, requestId: request.id };
  });
}

const receivedSchema = z.object({
  requestId: recordId,
  receivedItems: z.array(z.string()).min(1),
  conditionNote: z.string().trim().max(500).default(""),
});
export async function receiveAfterSales(
  actor: OrderActor,
  input: unknown,
): Promise<AfterSalesResult> {
  const parsed = receivedSchema.safeParse(input);
  if (!parsed.success) return { ok: false, ...validationFailure(parsed.error) };
  const value = parsed.data;
  const quantities = new Map<string, number>();
  for (const row of value.receivedItems) {
    const [id, quantity, ...rest] = row.split(":");
    const a = recordId.safeParse(id),
      b = z.coerce.number().int().min(0).max(99).safeParse(quantity);
    if (rest.length || !a.success || !b.success || quantities.has(id!))
      return { ok: false, fieldErrors: { receivedItems: ["Enter valid received quantities"] } };
    quantities.set(id!, b.data);
  }
  if (![...quantities.values()].some((quantity) => quantity > 0))
    return { ok: false, fieldErrors: { receivedItems: ["Record at least one received unit"] } };
  return db.$transaction(async (tx) => {
    const request = await tx.afterSalesRequest.findUnique({
      where: { id: value.requestId },
      include: { items: true },
    });
    if (!request) return { ok: false, error: "Request not found" };
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${request.orderId} FOR UPDATE`;
    if (
      request.kind === AfterSalesKinds.Cancellation ||
      request.status !== AfterSalesStatuses.Approved ||
      quantities.size !== request.items.length ||
      request.items.some(
        (item) =>
          !quantities.has(item.id) || quantities.get(item.id)! > (item.approvedQuantity ?? 0),
      )
    )
      return {
        ok: false,
        error: "Approved request or quantities changed. Refresh and review again",
      };
    await tx.afterSalesRequest.update({
      where: { id: request.id },
      data: {
        status: AfterSalesStatuses.Received,
        receivedAt: new Date(),
        items: {
          update: request.items.map((item) => ({
            where: { id: item.id },
            data: {
              receivedQuantity: quantities.get(item.id),
              conditionNote: value.conditionNote || null,
            },
          })),
        },
      },
    });
    await recordOrderEvent(tx, {
      orderId: request.orderId,
      type: OrderEventTypes.ReturnReceived,
      actor,
      message: `Items received for request ${request.id}. Inspection is still required before restock or refund`,
    });
    return { ok: true, requestId: request.id };
  });
}

const inspectSchema = z.object({
  requestId: recordId,
  inspectedItems: z.array(z.string()).min(1),
  externalReference: z
    .string()
    .trim()
    .min(5, "Enter the external refund reference")
    .max(100)
    .optional()
    .or(z.literal("")),
});
export async function inspectAndResolveAfterSales(
  actor: OrderActor,
  input: unknown,
): Promise<AfterSalesResult> {
  const parsed = inspectSchema.safeParse(input);
  if (!parsed.success) return { ok: false, ...validationFailure(parsed.error) };
  const value = parsed.data;
  const inspections = new Map<string, typeof ReturnDispositions.Resellable>();
  for (const row of value.inspectedItems) {
    const [id, disposition, ...rest] = row.split(":");
    const a = recordId.safeParse(id);
    if (
      rest.length ||
      !a.success ||
      !Object.values(ReturnDispositions).includes(
        disposition as (typeof ReturnDispositions)[keyof typeof ReturnDispositions],
      ) ||
      inspections.has(id!)
    )
      return {
        ok: false,
        fieldErrors: { inspectedItems: ["Choose a disposition for each received item"] },
      };
    inspections.set(id!, disposition as typeof ReturnDispositions.Resellable);
  }
  const request = await db.afterSalesRequest.findUnique({
    where: { id: value.requestId },
    include: {
      items: { include: { orderItem: true } },
      order: { include: { items: true, codCollection: true, user: true } },
    },
  });
  if (!request) return { ok: false, error: "Request not found" };
  if (
    request.kind === AfterSalesKinds.Cancellation ||
    request.status !== AfterSalesStatuses.Received ||
    inspections.size !== request.items.length ||
    request.items.some((item) => !inspections.has(item.id))
  )
    return { ok: false, error: "Receive and review every item before inspection" };
  return db
    .$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${request.orderId} FOR UPDATE`;
      const fresh = await tx.afterSalesRequest.findUnique({
        where: { id: request.id },
        include: {
          items: { include: { orderItem: true } },
          order: { include: { codCollection: true } },
        },
      });
      if (
        !fresh ||
        fresh.status !== AfterSalesStatuses.Received ||
        fresh.order.status !== OrderStatuses.Delivered
      )
        return { ok: false, error: "Return status changed. Refresh and review again" };
      let refundAmount = 0;
      for (const item of fresh.items) {
        const quantity = item.receivedQuantity ?? 0;
        if (fresh.kind === AfterSalesKinds.Return)
          refundAmount += item.orderItem.priceCents * quantity;
      }
      if (fresh.kind === AfterSalesKinds.Replacement) {
        const replacementItems = [];
        for (const item of fresh.items) {
          const quantity = item.receivedQuantity ?? 0;
          if (!quantity) continue;
          const allocated = await tx.product.updateMany({
            where: { id: item.orderItem.productId, active: true, stock: { gte: quantity } },
            data: { stock: { decrement: quantity } },
          });
          if (!allocated.count)
            throw new Error(`REPLACEMENT_STOCK_UNAVAILABLE:${item.orderItem.name}`);
          if (fresh.order.warehouseId)
            await applyWarehouseStockDelta(tx, {
              warehouseId: fresh.order.warehouseId,
              productId: item.orderItem.productId,
              delta: -quantity,
              reason: "Replacement dispatch",
              reasonCode: "Dispatch",
              referenceId: fresh.id,
              actorId: actor.id,
              actorName: actor.name,
            });
          replacementItems.push({
            productId: item.orderItem.productId,
            name: item.orderItem.name,
            slug: item.orderItem.slug,
            priceCents: 0,
            quantity,
            imageUrl: item.orderItem.imageUrl,
          });
        }
        if (!replacementItems.length)
          return { ok: false, error: "No received units are available to replace" };
        const replacementNumber = `SR${randomUUID().replaceAll("-", "").slice(0, 30)}`;
        const replacement = await tx.order.create({
          data: {
            number: replacementNumber,
            status: OrderStatuses.Paid,
            subtotalCents: 0,
            shippingCents: 0,
            totalCents: 0,
            walletPaidCents: 0,
            currencyCode: fresh.order.currencyCode,
            currencySymbol: fresh.order.currencySymbol,
            currencySource: fresh.order.currencySource,
            paymentMethod: fresh.order.paymentMethod,
            recipientName: fresh.order.recipientName,
            phone: fresh.order.phone,
            line1: fresh.order.line1,
            line2: fresh.order.line2,
            city: fresh.order.city,
            region: fresh.order.region,
            postal: fresh.order.postal,
            addressId: fresh.order.addressId,
            userId: fresh.order.userId,
            paidAt: new Date(),
            replacementForOrderId: fresh.orderId,
            replacementRequestId: fresh.id,
            items: { create: replacementItems },
          },
        });
        await tx.afterSalesRequest.update({
          where: { id: fresh.id },
          data: {
            status: AfterSalesStatuses.Resolved,
            inspectedAt: new Date(),
            resolvedAt: new Date(),
            items: {
              update: fresh.items.map((item) => ({
                where: { id: item.id },
                data: { disposition: inspections.get(item.id) },
              })),
            },
          },
        });
        await recordOrderEvent(tx, {
          orderId: replacement.id,
          type: OrderEventTypes.Placed,
          actor,
          toStatus: OrderStatuses.Paid,
          message: `No-charge replacement for order ${fresh.order.number}`,
        });
        await recordOrderEvent(tx, {
          orderId: fresh.orderId,
          type: OrderEventTypes.ReturnInspected,
          actor,
          message: `Returned units inspected for ${fresh.id}; resellable stock restored, damaged/write-off units excluded`,
        });
        await recordOrderEvent(tx, {
          orderId: fresh.orderId,
          type: OrderEventTypes.ReturnResolved,
          actor,
          message: `Replacement ${replacement.number} created and inventory reserved`,
        });
        return { ok: true, requestId: fresh.id };
      }
      if (refundAmount <= 0)
        return {
          ok: false,
          error: "Receive at least one approved unit before resolving the refund",
        };
      const priorWallet = await tx.walletTransaction.aggregate({
        where: {
          orderId: fresh.orderId,
          type: WalletTransactionTypes.REFUND,
          amountCents: { gt: 0 },
        },
        _sum: { amountCents: true },
      });
      const walletRemaining = Math.max(
        0,
        fresh.order.walletPaidCents - (priorWallet._sum.amountCents ?? 0),
      );
      const walletRefund = Math.min(refundAmount, walletRemaining);
      const gatewayRefund = refundAmount - walletRefund;
      const priorGateway = await tx.refundRecord.aggregate({
        where: {
          request: { orderId: fresh.orderId },
          tender: RefundTenders.Gateway,
          status: RefundStatuses.Completed,
        },
        _sum: { amountCents: true },
      });
      const gatewayRemaining = Math.max(
        0,
        fresh.order.totalCents - fresh.order.walletPaidCents - (priorGateway._sum.amountCents ?? 0),
      );
      if (fresh.order.paymentMethod === PaymentMethods.GATEWAY && gatewayRefund > gatewayRemaining)
        return {
          ok: false,
          error:
            "Calculated refund exceeds the verified gateway payment. Contact finance before resolving this request",
        };
      const priorCash = await tx.refundRecord.aggregate({
        where: {
          request: { orderId: fresh.orderId },
          tender: RefundTenders.Cash,
          status: RefundStatuses.Completed,
        },
        _sum: { amountCents: true },
      });
      const cashRemaining = Math.max(
        0,
        (fresh.order.codCollection?.amountCents ?? 0) - (priorCash._sum.amountCents ?? 0),
      );
      if (fresh.order.paymentMethod === PaymentMethods.COD && gatewayRefund > cashRemaining)
        return {
          ok: false,
          error:
            "Calculated refund exceeds recorded COD collection. Reconcile delivery cash before resolving",
        };
      if (gatewayRefund > 0 && !value.externalReference)
        return {
          ok: false,
          fieldErrors: {
            externalReference: [
              "Record the gateway or cash refund reference before resolving this return",
            ],
          },
        };
      const orderCurrency = fresh.order.currencyCode;
      if (!orderCurrency)
        return {
          ok: false,
          error:
            "Order currency is not recorded; an administrator must reconcile its currency before refunding",
        };
      for (const item of fresh.items) {
        const quantity = item.receivedQuantity ?? 0;
        if (inspections.get(item.id) === ReturnDispositions.Resellable && quantity) {
          await tx.product.update({
            where: { id: item.orderItem.productId },
            data: { stock: { increment: quantity } },
          });
          if (fresh.order.warehouseId)
            await applyWarehouseStockDelta(tx, {
              warehouseId: fresh.order.warehouseId,
              productId: item.orderItem.productId,
              delta: quantity,
              reason: "Return restock",
              reasonCode: "Return",
              referenceId: fresh.id,
              actorId: actor.id,
              actorName: actor.name,
            });
        }
      }
      if (walletRefund > 0) {
        const wallet = await creditWalletBalance(tx, fresh.order.userId, walletRefund);
        await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            orderId: fresh.orderId,
            amountCents: walletRefund,
            balanceAfterCents: wallet.balanceCents,
            type: WalletTransactionTypes.REFUND,
            note: `Return refund ${fresh.id}`,
          },
        });
        await tx.refundRecord.create({
          data: {
            requestId: fresh.id,
            tender: RefundTenders.Wallet,
            status: RefundStatuses.Completed,
            amountCents: walletRefund,
            currencyCode: orderCurrency,
            completedById: actor.id,
            completedByName: actor.name,
          },
        });
      }
      if (gatewayRefund > 0)
        await tx.refundRecord.create({
          data: {
            requestId: fresh.id,
            tender:
              fresh.order.paymentMethod === PaymentMethods.COD
                ? RefundTenders.Cash
                : RefundTenders.Gateway,
            status: RefundStatuses.Completed,
            amountCents: gatewayRefund,
            currencyCode: orderCurrency,
            externalReference: value.externalReference || null,
            completedById: actor.id,
            completedByName: actor.name,
          },
        });
      await tx.afterSalesRequest.update({
        where: { id: fresh.id },
        data: {
          status: AfterSalesStatuses.Resolved,
          inspectedAt: new Date(),
          resolvedAt: new Date(),
          externalRefundReference: value.externalReference || null,
          items: {
            update: fresh.items.map((item) => ({
              where: { id: item.id },
              data: { disposition: inspections.get(item.id) },
            })),
          },
        },
      });
      await recordOrderEvent(tx, {
        orderId: fresh.orderId,
        type: OrderEventTypes.ReturnInspected,
        actor,
        message: `Return inspection completed for ${fresh.id}; resellable units restocked, damaged/write-off stock excluded`,
      });
      await recordOrderEvent(tx, {
        orderId: fresh.orderId,
        type: OrderEventTypes.ReturnResolved,
        actor,
        amountCents: refundAmount,
        message: `Return ${fresh.id} resolved; wallet refund ${walletRefund} cents, externally reconciled refund ${gatewayRefund} cents`,
      });
      return { ok: true, requestId: fresh.id };
    })
    .catch((error: unknown) => {
      if (error instanceof Error && error.message === "WALLET_BALANCE_LIMIT")
        return {
          ok: false,
          error:
            "Return was not resolved because the wallet balance reached its limit. Contact finance to issue the original tender refund",
        };
      if (error instanceof Error && error.message.startsWith("REPLACEMENT_STOCK_UNAVAILABLE:"))
        return {
          ok: false,
          error: `Replacement stock is unavailable for ${error.message.slice("REPLACEMENT_STOCK_UNAVAILABLE:".length)}. The request is unchanged`,
        };
      return Promise.reject(error);
    });
}

export async function resolveCancellation(
  actor: OrderActor,
  requestId: string,
  externalReference: string,
): Promise<AfterSalesResult> {
  const parsedId = recordId.safeParse(requestId);
  const reference = z.string().trim().max(100).safeParse(externalReference);
  if (!parsedId.success || !reference.success)
    return {
      ok: false,
      fieldErrors: { externalReference: ["Enter a valid external refund or payment reference"] },
    };
  const request = await db.afterSalesRequest.findUnique({
    where: { id: requestId },
    include: { order: true },
  });
  if (
    !request ||
    request.kind !== AfterSalesKinds.Cancellation ||
    request.status !== AfterSalesStatuses.Approved
  )
    return { ok: false, error: "Approve the cancellation request first" };
  const gatewayDue =
    request.order.paymentMethod === PaymentMethods.GATEWAY &&
    request.order.status !== OrderStatuses.Pending
      ? Math.max(0, request.order.totalCents - request.order.walletPaidCents)
      : 0;
  if (gatewayDue > 0 && !reference.data)
    return {
      ok: false,
      fieldErrors: {
        externalReference: [
          "Record the gateway refund reference before cancelling this paid order",
        ],
      },
    };
  return db
    .$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${request.orderId} FOR UPDATE`;
      const fresh = await tx.afterSalesRequest.findUniqueOrThrow({
        where: { id: request.id },
        include: { order: { include: { items: true } } },
      });
      if (
        fresh.status !== AfterSalesStatuses.Approved ||
        !(PRE_DISPATCH_STATUSES as readonly string[]).includes(fresh.order.status)
      )
        return { ok: false, error: "Order or request changed. Refresh before resolving" };
      if (
        !fresh.order.currencyCode &&
        (fresh.order.walletPaidCents > 0 ||
          (fresh.order.paymentMethod === PaymentMethods.GATEWAY &&
            fresh.order.status !== OrderStatuses.Pending))
      )
        return { ok: false, error: "Order currency must be reconciled before recording a refund" };
      if (
        fresh.order.status === OrderStatuses.Pending &&
        fresh.order.paymentMethod === PaymentMethods.GATEWAY
      ) {
        const attempt = await tx.paymentAttempt.findUnique({ where: { orderId: fresh.orderId } });
        if (
          !attempt ||
          attempt.requiresManualReview ||
          !(
            [
              PaymentAttemptStatuses.Created,
              PaymentAttemptStatuses.Failed,
              PaymentAttemptStatuses.Expired,
            ] as readonly string[]
          ).includes(attempt.status)
        )
          return {
            ok: false,
            error:
              "Provider payment is in progress or requires review. Check payment status before cancelling",
          };
      }
      const currentGatewayDue =
        fresh.order.paymentMethod === PaymentMethods.GATEWAY &&
        fresh.order.status !== OrderStatuses.Pending
          ? Math.max(0, fresh.order.totalCents - fresh.order.walletPaidCents)
          : 0;
      if (currentGatewayDue > 0 && !reference.data)
        return {
          ok: false,
          fieldErrors: {
            externalReference: [
              "Record the gateway refund reference before cancelling this paid order",
            ],
          },
        };
      if (currentGatewayDue > 0 && fresh.order.currencyCode)
        await tx.refundRecord.create({
          data: {
            requestId: fresh.id,
            tender: RefundTenders.Gateway,
            status: RefundStatuses.Completed,
            amountCents: currentGatewayDue,
            currencyCode: fresh.order.currencyCode,
            externalReference: reference.data!,
            completedById: actor.id,
            completedByName: actor.name,
          },
        });
      const now = new Date();
      await tx.order.update({
        where: { id: fresh.orderId },
        data: { status: OrderStatuses.Cancelled },
      });
      await tx.paymentAttempt.updateMany({
        where: { orderId: fresh.orderId, status: { not: PaymentAttemptStatuses.Succeeded } },
        data: { status: PaymentAttemptStatuses.Expired, gatewayUrl: null },
      });
      for (const item of [...fresh.order.items].sort((a, b) =>
        a.productId.localeCompare(b.productId),
      )) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { increment: item.quantity } },
        });
        if (fresh.order.warehouseId)
          await applyWarehouseStockDelta(tx, {
            warehouseId: fresh.order.warehouseId,
            productId: item.productId,
            delta: item.quantity,
            reason: "Order cancelled",
            reasonCode: "Return",
            referenceId: fresh.order.number,
            actorId: actor.id,
            actorName: actor.name,
          });
      }
      if (fresh.order.walletPaidCents > 0) {
        const wallet = await creditWalletBalance(
          tx,
          fresh.order.userId,
          fresh.order.walletPaidCents,
        );
        await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            orderId: fresh.orderId,
            amountCents: fresh.order.walletPaidCents,
            balanceAfterCents: wallet.balanceCents,
            type: WalletTransactionTypes.REFUND,
            note: `Cancellation refund ${fresh.id}`,
          },
        });
        await tx.refundRecord.create({
          data: {
            requestId: fresh.id,
            tender: RefundTenders.Wallet,
            status: RefundStatuses.Completed,
            amountCents: fresh.order.walletPaidCents,
            currencyCode: fresh.order.currencyCode!,
            completedById: actor.id,
            completedByName: actor.name,
          },
        });
        await recordOrderEvent(tx, {
          orderId: fresh.orderId,
          type: OrderEventTypes.WalletRefunded,
          actor,
          amountCents: fresh.order.walletPaidCents,
          message: "Original wallet payment refunded for cancelled order",
        });
      }
      await tx.afterSalesRequest.update({
        where: { id: fresh.id },
        data: {
          status: AfterSalesStatuses.Resolved,
          resolvedAt: now,
          externalRefundReference: reference.data || null,
        },
      });
      await recordOrderEvent(tx, {
        orderId: fresh.orderId,
        type: OrderEventTypes.Cancelled,
        actor,
        fromStatus: fresh.order.status,
        toStatus: OrderStatuses.Cancelled,
        message: `Order cancelled after approved customer request ${fresh.id}`,
      });
      await recordOrderEvent(tx, {
        orderId: fresh.orderId,
        type: OrderEventTypes.ReturnResolved,
        actor,
        amountCents: fresh.order.totalCents,
        message: `Cancellation ${fresh.id} resolved; original gateway refund recorded ${reference.data || "not applicable"}`,
      });
      return { ok: true, requestId: fresh.id };
    })
    .catch((error: unknown) =>
      error instanceof Error && error.message === "WALLET_BALANCE_LIMIT"
        ? {
            ok: false,
            error:
              "Cancellation was not applied because the refund would exceed the supported wallet balance",
          }
        : Promise.reject(error),
    );
}

export function afterSalesActor(id: string, name: string): OrderActor {
  return { id, name, role: Roles.Admin };
}
