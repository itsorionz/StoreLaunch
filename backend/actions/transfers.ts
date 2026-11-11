"use server";

import { revalidatePath } from "next/cache";
import { db } from "../lib/db";
import { requireAdmin, requireOpsEditor } from "../lib/session";
import {
  cancelTransfer,
  createTransferRequest,
  dispatchTransfer,
  receiveTransfer,
  TRANSFER_ERROR_MESSAGES,
} from "../lib/stock-transfers";
import { logger, type LogContext } from "../lib/logger";

const log = logger.child({ scope: "action:transfers" });

/** Known transfer codes map to friendly messages; anything else is a real failure. */
function logTransferFailure(action: string, error: unknown, context: LogContext): void {
  const code = error instanceof Error ? error.message : "";
  if (code && Object.hasOwn(TRANSFER_ERROR_MESSAGES, code))
    log.warn(`${action} rejected`, { code, ...context });
  else log.error(`${action} failed`, { error, ...context });
}

export type TransferActionResult = { ok: boolean; error?: string };

function messageFor(error: unknown): string {
  const code = error instanceof Error ? error.message : "";
  return TRANSFER_ERROR_MESSAGES[code] ?? "Could not update the transfer";
}

function refresh() {
  revalidatePath("/admin/warehouse/transfer");
  revalidatePath("/admin/warehouse");
  revalidatePath("/warehouse/stock");
}

/** Ops editors request a transfer; it stays Pending until an admin dispatches it. */
export async function requestStockTransfer(
  _prev: TransferActionResult | null,
  formData: FormData,
): Promise<TransferActionResult> {
  const actor = await requireOpsEditor();
  const productId = String(formData.get("productId") || "").trim();
  const fromWarehouseId = String(formData.get("fromWarehouseId") || "").trim();
  const toWarehouseId = String(formData.get("toWarehouseId") || "").trim();
  const qty = Number(formData.get("qty") || "0");
  const note = String(formData.get("notes") || "").trim() || null;
  if (!productId || !fromWarehouseId || !toWarehouseId)
    return { ok: false, error: "Product and both warehouses are required" };

  try {
    await createTransferRequest(db, {
      productId,
      fromWarehouseId,
      toWarehouseId,
      qty,
      note,
      actor: { id: actor.id, name: actor.name },
    });
  } catch (error) {
    logTransferFailure("requestStockTransfer", error, {
      productId,
      fromWarehouseId,
      toWarehouseId,
      qty,
    });
    return { ok: false, error: messageFor(error) };
  }
  refresh();
  return { ok: true };
}

/** Admin approval: Pending → InTransit, stock leaves the source warehouse. */
export async function dispatchStockTransfer(
  _prev: TransferActionResult | null,
  formData: FormData,
): Promise<TransferActionResult> {
  const actor = await requireAdmin();
  const id = String(formData.get("id") || "").trim();
  if (!id) return { ok: false, error: "Transfer ID required" };

  try {
    await db.$transaction((tx) => dispatchTransfer(tx, id, { id: actor.id, name: actor.name }));
  } catch (error) {
    logTransferFailure("dispatchStockTransfer", error, { transferId: id, actorId: actor.id });
    return { ok: false, error: messageFor(error) };
  }
  refresh();
  return { ok: true };
}

/** The destination warehouse confirms arrival: InTransit → Received. */
export async function receiveStockTransfer(
  _prev: TransferActionResult | null,
  formData: FormData,
): Promise<TransferActionResult> {
  const actor = await requireOpsEditor();
  const id = String(formData.get("id") || "").trim();
  if (!id) return { ok: false, error: "Transfer ID required" };

  try {
    await db.$transaction((tx) => receiveTransfer(tx, id, { id: actor.id, name: actor.name }));
  } catch (error) {
    logTransferFailure("receiveStockTransfer", error, { transferId: id, actorId: actor.id });
    return { ok: false, error: messageFor(error) };
  }
  refresh();
  return { ok: true };
}

/** Admin cancellation: Pending closes directly; InTransit returns stock to source. */
export async function cancelStockTransfer(
  _prev: TransferActionResult | null,
  formData: FormData,
): Promise<TransferActionResult> {
  const actor = await requireAdmin();
  const id = String(formData.get("id") || "").trim();
  if (!id) return { ok: false, error: "Transfer ID required" };

  try {
    await db.$transaction((tx) => cancelTransfer(tx, id, { id: actor.id, name: actor.name }));
  } catch (error) {
    logTransferFailure("cancelStockTransfer", error, { transferId: id, actorId: actor.id });
    return { ok: false, error: messageFor(error) };
  }
  refresh();
  return { ok: true };
}
