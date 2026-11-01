import { config } from "dotenv";
import { createPrismaClient } from "../lib/prisma-client";
import { PrismaClient } from "@backend/generated/prisma/client";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { test } from "node:test";

config({ quiet: true });
async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname), "Local database required");
  const name = `test_transfers_${randomUUID().replaceAll("-", "")}`;
  const adminDb = createPrismaClient();
  await adminDb.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
  url.pathname = `/${name}`;
  process.env.DATABASE_URL = url.toString();
  let store: PrismaClient | undefined;
  try {
    execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], {
      env: process.env,
      stdio: "pipe",
    });
    const { db } = await import("../lib/db");
    store = db;
    const { createTransferRequest, dispatchTransfer, receiveTransfer, cancelTransfer } =
      await import("../lib/stock-transfers");

    const actor = { id: "admin-1", name: "Ops Admin" };

    const category = await db.category.create({ data: { name: "Transfers", slug: "transfers" } });
    const product = await db.product.create({
      data: {
        name: "Transferable item",
        slug: "transferable-item",
        categoryId: category.id,
        priceCents: 1000,
        stock: 10,
      },
    });
    const warehouseA = await db.warehouse.create({
      data: { name: "Source WH", code: "SRC", isDefault: true },
    });
    const warehouseB = await db.warehouse.create({
      data: { name: "Destination WH", code: "DST" },
    });
    await db.stockLevel.create({
      data: { warehouseId: warehouseA.id, productId: product.id, qty: 10 },
    });
    // Independent product/stock for the cancel-restores-stock test.
    const product2 = await db.product.create({
      data: {
        name: "Cancelable item",
        slug: "cancelable-item",
        categoryId: category.id,
        priceCents: 500,
        stock: 5,
      },
    });
    await db.stockLevel.create({
      data: { warehouseId: warehouseA.id, productId: product2.id, qty: 5 },
    });

    const qtyAt = async (warehouseId: string, productId: string) =>
      (
        await db.stockLevel.findUnique({
          where: { warehouseId_productId: { warehouseId, productId } },
        })
      )?.qty ?? 0;

    async function parity() {
      const rows = await db.stockLevel.groupBy({
        by: ["productId"],
        _sum: { qty: true },
      });
      for (const row of rows) {
        const p = await db.product.findUnique({ where: { id: row.productId } });
        if (!p || p.stock !== (row._sum.qty ?? 0)) return false;
      }
      return true;
    }

    // Fixtures are shared; each test owns distinct products/quantities so the
    // suite runs sequentially in declaration order.
    await test("a request records the transfer without moving stock", async () => {
      const id = await createTransferRequest(db, {
        productId: product.id,
        fromWarehouseId: warehouseA.id,
        toWarehouseId: warehouseB.id,
        qty: 3,
        note: "Restock south",
        actor,
      });
      const transfer = await db.stockTransfer.findUniqueOrThrow({ where: { id } });
      assert.equal(transfer.status, "Pending");
      assert.equal(transfer.requestedById, actor.id);
      assert.equal(transfer.note, "Restock south");
      // Nothing moved yet: source untouched, destination still empty.
      assert.equal(await qtyAt(warehouseA.id, product.id), 10);
      assert.equal(await qtyAt(warehouseB.id, product.id), 0);
      assert.equal(await parity(), true);

      // Same-warehouse and over-stock requests are rejected.
      await assert.rejects(
        createTransferRequest(db, {
          productId: product.id,
          fromWarehouseId: warehouseA.id,
          toWarehouseId: warehouseA.id,
          qty: 1,
          actor,
        }),
        /SAME_WAREHOUSE/,
      );
      await assert.rejects(
        createTransferRequest(db, {
          productId: product.id,
          fromWarehouseId: warehouseA.id,
          toWarehouseId: warehouseB.id,
          qty: 999,
          actor,
        }),
        /INSUFFICIENT_STOCK/,
      );
    });

    await test("dispatch moves stock out and receive lands it at the destination", async () => {
      const id = await createTransferRequest(db, {
        productId: product.id,
        fromWarehouseId: warehouseA.id,
        toWarehouseId: warehouseB.id,
        qty: 3,
        actor,
      });

      await db.$transaction((tx) => dispatchTransfer(tx, id, actor));
      const dispatched = await db.stockTransfer.findUniqueOrThrow({ where: { id } });
      assert.equal(dispatched.status, "InTransit");
      assert.ok(dispatched.dispatchedAt);
      assert.equal(dispatched.dispatchedById, actor.id);
      // In transit: left the source, global stock decremented, nothing yet at destination.
      assert.equal(await qtyAt(warehouseA.id, product.id), 7);
      assert.equal(await qtyAt(warehouseB.id, product.id), 0);
      const productRow = await db.product.findUniqueOrThrow({ where: { id: product.id } });
      assert.equal(productRow.stock, 7);
      assert.equal(await parity(), true);
      const outbound = await db.stockMovement.findFirst({
        where: { referenceId: id, delta: -3 },
      });
      assert.ok(outbound);
      assert.equal(outbound.reasonCode, "Transfer");

      // Double dispatch is rejected while in transit.
      await assert.rejects(
        db.$transaction((tx) => dispatchTransfer(tx, id, actor)),
        /TRANSFER_NOT_PENDING/,
      );

      await db.$transaction((tx) => receiveTransfer(tx, id, actor));
      const received = await db.stockTransfer.findUniqueOrThrow({ where: { id } });
      assert.equal(received.status, "Received");
      assert.ok(received.receivedAt);
      assert.equal(await qtyAt(warehouseA.id, product.id), 7);
      assert.equal(await qtyAt(warehouseB.id, product.id), 3);
      assert.equal((await db.product.findUniqueOrThrow({ where: { id: product.id } })).stock, 10);
      assert.equal(await parity(), true);

      // Received transfers are closed.
      await assert.rejects(
        db.$transaction((tx) => receiveTransfer(tx, id, actor)),
        /TRANSFER_NOT_IN_TRANSIT/,
      );
    });

    await test("cancelling an in-transit transfer returns stock to the source", async () => {
      const id = await createTransferRequest(db, {
        productId: product2.id,
        fromWarehouseId: warehouseA.id,
        toWarehouseId: warehouseB.id,
        qty: 5,
        actor,
      });
      await db.$transaction((tx) => dispatchTransfer(tx, id, actor));
      assert.equal(await qtyAt(warehouseA.id, product2.id), 0);
      assert.equal((await db.product.findUniqueOrThrow({ where: { id: product2.id } })).stock, 0);

      await db.$transaction((tx) => cancelTransfer(tx, id, actor));
      const cancelled = await db.stockTransfer.findUniqueOrThrow({ where: { id } });
      assert.equal(cancelled.status, "Cancelled");
      assert.ok(cancelled.cancelledAt);
      // Stock returned to the source; nothing stranded in transit.
      assert.equal(await qtyAt(warehouseA.id, product2.id), 5);
      assert.equal((await db.product.findUniqueOrThrow({ where: { id: product2.id } })).stock, 5);
      assert.equal(await parity(), true);

      // Closed transfers cannot be cancelled again.
      await assert.rejects(
        db.$transaction((tx) => cancelTransfer(tx, id, actor)),
        /TRANSFER_CLOSED/,
      );
    });

    await test("dispatch re-checks stock so concurrent sales cannot oversell the transfer", async () => {
      const id = await createTransferRequest(db, {
        productId: product.id,
        fromWarehouseId: warehouseA.id,
        toWarehouseId: warehouseB.id,
        qty: 7,
        actor,
      });
      // A sale consumes part of the requested stock before dispatch.
      await db.stockLevel.update({
        where: { warehouseId_productId: { warehouseId: warehouseA.id, productId: product.id } },
        data: { qty: { decrement: 4 } },
      });
      await db.product.update({ where: { id: product.id }, data: { stock: { decrement: 4 } } });

      await assert.rejects(
        db.$transaction((tx) => dispatchTransfer(tx, id, actor)),
        /INSUFFICIENT_STOCK/,
      );
      const transfer = await db.stockTransfer.findUniqueOrThrow({ where: { id } });
      assert.equal(transfer.status, "Pending");
      assert.equal(await qtyAt(warehouseA.id, product.id), 3);
      assert.equal(await parity(), true);
    });
  } finally {
    if (store) await store.$disconnect();
    await adminDb.$executeRawUnsafe(`DROP DATABASE "${name}"`);
    await adminDb.$disconnect();
  }
}

main().then(
  () => void 0,
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
