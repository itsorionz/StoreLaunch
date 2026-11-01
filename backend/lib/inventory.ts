import "server-only";
import { z } from "zod";
import { db } from "./db";
import { InventoryAdjustmentReasons, Roles } from "./enums.mjs";
import { recordId, validationFailure } from "./form-validation";

export const inventoryAdjustmentSchema = z.object({
  productId: recordId,
  requestKey: z.string().uuid("Refresh the page and try again"),
  expectedStock: z.coerce.number().int().min(0).max(1000000),
  expectedUpdatedAt: z.string().datetime(),
  delta: z.coerce
    .number()
    .int("Enter a whole quantity")
    .min(-1000000)
    .max(1000000)
    .refine((value) => value !== 0, "Enter a non-zero quantity"),
  reason: z
    .string()
    .trim()
    .min(5, "Explain the adjustment in at least 5 characters")
    .max(500, "Use at most 500 characters"),
  // Controlled source label for the movement ledger; the free-text `reason`
  // above stays the human explanation (existing values untouched, A5).
  reasonCode: z
    .enum(InventoryAdjustmentReasons)
    .optional()
    .default(InventoryAdjustmentReasons.Manual),
});

export type InventoryResult = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  replayed?: boolean;
  previousStock?: number;
  newStock?: number;
};

export async function adjustInventory(actorId: string, input: unknown): Promise<InventoryResult> {
  const parsed = inventoryAdjustmentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, ...validationFailure(parsed.error) };
  const value = parsed.data;
  return db.$transaction(async (tx): Promise<InventoryResult> => {
    // Serialize a repeated key even when it targets different products.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${value.requestKey}, 0))`;
    const admin = await tx.user.findFirst({
      where: { id: actorId, active: true, roles: { has: Roles.Admin } },
    });
    if (!admin) return { ok: false, error: "An active administrator account is required" };
    const existing = await tx.inventoryAdjustment.findUnique({
      where: { requestKey: value.requestKey },
    });
    if (existing) {
      if (
        existing.productId !== value.productId ||
        existing.actorId !== actorId ||
        existing.delta !== value.delta ||
        existing.reason !== value.reason ||
        existing.reasonCode !== value.reasonCode ||
        existing.previousStock !== value.expectedStock ||
        existing.expectedUpdatedAt.toISOString() !== value.expectedUpdatedAt
      )
        return {
          ok: false,
          error: "This request reference has already been used for a different adjustment",
        };
      return {
        ok: true,
        replayed: true,
        previousStock: existing.previousStock,
        newStock: existing.newStock,
      };
    }
    await tx.$queryRaw`SELECT id FROM "Product" WHERE id = ${value.productId} FOR UPDATE`;
    const product = await tx.product.findUnique({ where: { id: value.productId } });
    if (!product) return { ok: false, error: "Product no longer exists" };
    if (
      product.stock !== value.expectedStock ||
      product.updatedAt.toISOString() !== value.expectedUpdatedAt
    )
      return {
        ok: false,
        error: "Product or stock changed. Refresh the page, review the current stock and try again",
      };
    const newStock = product.stock + value.delta;
    if (newStock < 0 || newStock > 1000000)
      return {
        ok: false,
        fieldErrors: { delta: ["Resulting stock must be between 0 and 1,000,000"] },
      };
    const changed = await tx.product.updateMany({
      where: { id: product.id, stock: product.stock, updatedAt: product.updatedAt },
      data: { stock: newStock },
    });
    if (!changed.count) return { ok: false, error: "Product changed. Refresh and try again" };
    await tx.inventoryAdjustment.create({
      data: {
        requestKey: value.requestKey,
        productId: product.id,
        actorId,
        actorName: admin.name || admin.email || "Admin",
        delta: value.delta,
        previousStock: product.stock,
        newStock,
        expectedUpdatedAt: new Date(value.expectedUpdatedAt),
        reason: value.reason,
        reasonCode: value.reasonCode,
      },
    });
    return { ok: true, previousStock: product.stock, newStock };
  });
}
