import { OrderStatuses } from "@backend/lib/enums.mjs";
import type { PrismaClient } from "@backend/generated/prisma/client";
import { bdDayKey } from "./admin-dashboard-periods";

const DAY_MS = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(Date.now() - days * DAY_MS);

/**
 * Development-only operations fixtures: warehouses, stock, delivery zones,
 * shipments, dispatch manifests, transfers and purchasing. Like
 * seedDemoOperations these never run in production — a real store gets its
 * warehouses and stock through the admin UI.
 *
 * Runs after seedCatalog + seedDemoOperations so it can reuse the demo
 * courier, orders and admin actor.
 */
export async function seedOperationsFixtures(db: PrismaClient) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Operations fixtures seeding is disabled in production.");
  }

  const admin = await db.user.findFirst({
    where: { email: "admin@store.storelaunch.com" },
    select: { id: true, name: true },
  });
  if (!admin) throw new Error("seedAdmin must run before seedOperationsFixtures.");

  // --- Warehouses -------------------------------------------------------------
  const main = await ensureWarehouse(db, {
    id: "demo-wh-dhk",
    name: "Main Warehouse — Dhaka",
    code: "DHK-01",
    address: "Plot 4, Tejgaon Industrial Area",
    city: "Dhaka",
    region: "Dhaka",
    isDefault: true,
  });
  const satellite = await ensureWarehouse(db, {
    id: "demo-wh-cgp",
    name: "Satellite Store — Chattogram",
    code: "CGP-01",
    address: "22 O. R. Nizam Road, Agrabad",
    city: "Chattogram",
    region: "Chattogram",
    isDefault: false,
  });

  // --- Delivery hubs ----------------------------------------------------------
  const hubDhk = await ensureHub(db, {
    id: "demo-hub-dhk",
    name: "Dhaka Delivery Hub",
    code: "HUB-DHK",
    city: "Dhaka",
    region: "Dhaka",
    warehouseId: main.id,
    isDefault: true,
    capacity: 500,
  });
  const hubCgp = await ensureHub(db, {
    id: "demo-hub-cgp",
    name: "Chattogram Delivery Hub",
    code: "HUB-CGP",
    city: "Chattogram",
    region: "Chattogram",
    warehouseId: satellite.id,
    isDefault: false,
    capacity: 200,
  });

  const courier = await db.deliveryCompany.findFirst({ where: { active: true } });

  // --- Delivery zones ---------------------------------------------------------
  // Checkout matches [city, region] against areas bidirectionally, so each
  // zone lists its region capital ("Dhaka") plus neighbourhoods. The metro
  // zone is created first because checkout picks the first matching zone.
  const metro = await ensureZone(db, {
    id: "demo-zone-dhaka-metro",
    name: "Dhaka Metro",
    areas: ["Dhaka", "Dhanmondi", "Gulshan", "Mirpur", "Uttara", "Banani", "Motijheel"],
    mode: "OwnRider",
    rateCents: 6000,
    codFeeCents: 0,
    freeOverCents: 50000,
    etaDaysFrom: 1,
    etaDaysTo: 2,
    warehouseId: main.id,
    deliveryHubId: hubDhk.id,
    deliveryCompanyId: null,
  });
  await ensureZone(db, {
    id: "demo-zone-chattogram",
    name: "Chattogram City",
    areas: ["Chattogram", "Chittagong", "Agrabad", "Khulshi"],
    mode: "Courier",
    rateCents: 9000,
    codFeeCents: 1500,
    freeOverCents: null,
    etaDaysFrom: 2,
    etaDaysTo: 4,
    warehouseId: satellite.id,
    deliveryHubId: hubCgp.id,
    deliveryCompanyId: courier?.id ?? null,
  });
  await ensureZone(db, {
    id: "demo-zone-nationwide",
    name: "Nationwide Courier",
    areas: ["Sylhet", "Khulna", "Rajshahi", "Barishal", "Rangpur", "Mymensingh"],
    mode: "Courier",
    rateCents: 14000,
    codFeeCents: 2500,
    freeOverCents: null,
    etaDaysFrom: 3,
    etaDaysTo: 5,
    warehouseId: main.id,
    deliveryHubId: hubDhk.id,
    deliveryCompanyId: courier?.id ?? null,
  });

  // Existing demo orders carry addresses in Dhaka; pin them to the metro zone
  // and the default warehouse so order detail, routing and pick lists agree.
  await db.order.updateMany({
    where: { zoneId: null },
    data: { zoneId: metro.id, warehouseId: main.id, deliveryHubId: hubDhk.id },
  });

  // --- Catalog cost + reorder basis ------------------------------------------
  // seedCatalog fills prices only; margins, stock value and shrinkage all
  // need a cost basis, and the reorder report falls back to reorderPoint.
  const products = await db.product.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      stock: true,
      priceCents: true,
      salePriceCents: true,
      costCents: true,
      reorderPoint: true,
    },
  });
  if (products.length < 5) throw new Error("seedCatalog must run before seedOperationsFixtures.");

  for (const product of products) {
    const data: { costCents?: number; reorderPoint?: number } = {};
    if (product.costCents === null) data.costCents = demoCostCents(product);
    if (product.reorderPoint === 0) data.reorderPoint = 10;
    if (Object.keys(data).length) await db.product.update({ where: { id: product.id }, data });
  }

  // Fixture picks: pa = active seller, pb = stocktake/write-off victim
  // (shrinkage), the rest drive the three transfer states.
  const [pa, pb, pPending, pTransit, pReceived] = products;

  // --- Stock levels -----------------------------------------------------------
  // Invariant: Product.stock == Σ StockLevel.qty. Main holds the full sellable
  // count; every third product also gets a satellite share so multi-warehouse
  // pages, transfers and rebalancing have real data.
  const levelSum = new Map<string, number>();
  for (let i = 0; i < products.length; i++) {
    const product = products[i];
    const satBase =
      i % 3 === 0 && product.stock >= 40 ? Math.min(20, Math.ceil(product.stock / 6)) : 0;
    let mainQty = product.stock - satBase;
    let satQty = satBase;
    if (product.id === pb?.id) mainQty -= 5; // stocktake −3 + write-off −2 below
    if (product.id === pTransit?.id) mainQty -= 10; // left main, still in transit
    if (product.id === pReceived?.id) {
      mainQty -= 3; // already arrived at the satellite store
      satQty += 3;
    }
    mainQty = Math.max(0, mainQty);
    satQty = Math.max(0, satQty);

    // One guaranteed below its reorder point so /admin/reorder and the
    // dashboard low-stock card have a real row.
    const minStock = product.id === pb?.id ? mainQty + 10 : 0;

    await db.stockLevel.upsert({
      where: { warehouseId_productId: { warehouseId: main.id, productId: product.id } },
      update: { qty: mainQty, minStock },
      create: { warehouseId: main.id, productId: product.id, qty: mainQty, minStock },
    });
    levelSum.set(product.id, (levelSum.get(product.id) ?? 0) + mainQty);
    if (satQty > 0) {
      await db.stockLevel.upsert({
        where: { warehouseId_productId: { warehouseId: satellite.id, productId: product.id } },
        update: { qty: satQty },
        create: { warehouseId: satellite.id, productId: product.id, qty: satQty },
      });
      levelSum.set(product.id, (levelSum.get(product.id) ?? 0) + satQty);
    }
  }
  // Reconcile the global counter after the transfer-driven adjustments.
  for (const product of products) {
    const sum = levelSum.get(product.id) ?? 0;
    if (sum !== product.stock) {
      await db.product.update({ where: { id: product.id }, data: { stock: sum } });
    }
  }

  // --- Stock movements --------------------------------------------------------
  // Half the catalog gets recent history; the rest stay movement-free so the
  // dashboard's 90-day dead-stock metric has rows to report. Only the
  // stocktake and the null-code write-off count as shrinkage.
  if (pa && pb && pTransit && pReceived) {
    const movements = [
      {
        id: "demo-move-receiving-1",
        warehouseId: main.id,
        productId: pa.id,
        delta: 40,
        reason: "Initial stock receipt",
        reasonCode: "Receiving",
        referenceId: null,
        createdAt: ago(30),
      },
      {
        id: "demo-move-sale-1",
        warehouseId: main.id,
        productId: pa.id,
        delta: -6,
        reason: "Sale",
        reasonCode: "Sale",
        referenceId: "DEMO-ORD-DELIVERED-COD",
        createdAt: ago(5),
      },
      {
        id: "demo-move-stocktake-1",
        warehouseId: main.id,
        productId: pb.id,
        delta: -3,
        reason: "Stocktake variance — short on shelf",
        reasonCode: "Stocktake",
        referenceId: null,
        createdAt: ago(7),
      },
      {
        id: "demo-move-writeoff-1",
        warehouseId: main.id,
        productId: pb.id,
        delta: -2,
        reason: "Damaged in transit — written off",
        reasonCode: null,
        referenceId: null,
        createdAt: ago(5),
      },
      {
        id: "demo-move-transfer-transit",
        warehouseId: main.id,
        productId: pTransit.id,
        delta: -10,
        reason: "Stock transfer out — in transit",
        reasonCode: "Transfer",
        referenceId: "demo-transfer-transit",
        createdAt: ago(1),
      },
      {
        id: "demo-move-transfer-out-received",
        warehouseId: main.id,
        productId: pReceived.id,
        delta: -3,
        reason: "Stock transfer out",
        reasonCode: "Transfer",
        referenceId: "demo-transfer-received",
        createdAt: ago(4),
      },
      {
        id: "demo-move-transfer-in-received",
        warehouseId: satellite.id,
        productId: pReceived.id,
        delta: 3,
        reason: "Stock transfer in",
        reasonCode: "Transfer",
        referenceId: "demo-transfer-received",
        createdAt: ago(2),
      },
    ];
    for (const movement of movements) {
      if (await db.stockMovement.findUnique({ where: { id: movement.id } })) continue;
      await db.stockMovement.create({
        data: { ...movement, actorId: admin.id, actorName: admin.name },
      });
    }

    // --- Stock transfers -------------------------------------------------------
    const transfers = [
      {
        id: "demo-transfer-pending",
        productId: pPending.id,
        qty: 5,
        status: "Pending" as const,
        note: "Satellite top-up request (demo)",
        requestedAt: ago(1),
        dispatchedAt: null,
        receivedAt: null,
        receivedById: null,
        receivedByName: null,
      },
      {
        id: "demo-transfer-transit",
        productId: pTransit.id,
        qty: 10,
        status: "InTransit" as const,
        note: "Dispatched, arriving from Dhaka (demo)",
        requestedAt: ago(2),
        dispatchedAt: ago(1),
        receivedAt: null,
        receivedById: null,
        receivedByName: null,
      },
      {
        id: "demo-transfer-received",
        productId: pReceived.id,
        qty: 3,
        status: "Received" as const,
        note: "Completed transfer (demo)",
        requestedAt: ago(6),
        dispatchedAt: ago(4),
        receivedAt: ago(2),
        receivedById: admin.id,
        receivedByName: admin.name,
      },
    ];
    for (const transfer of transfers) {
      const { id, status, ...rest } = transfer;
      await db.stockTransfer.upsert({
        where: { id },
        update: {},
        create: {
          id,
          status,
          ...rest,
          fromWarehouseId: main.id,
          toWarehouseId: satellite.id,
          requestedById: admin.id,
          requestedByName: admin.name,
          ...(status === "Pending"
            ? {}
            : { dispatchedById: admin.id, dispatchedByName: admin.name }),
        },
      });
    }
  }

  // --- Shipments --------------------------------------------------------------
  // Every finished/in-flight order gets a shipment with a persisted carrier
  // quote so /admin/shipments, the delivery scorecard (cost/parcel) and the
  // courier reconciliation all have data. The final one stays unquoted to
  // represent a manual dispatch excluded from cost averages.
  const dispatchStatuses = [
    OrderStatuses.Shipped,
    OrderStatuses.Delivered,
    OrderStatuses.ReturningToOrigin,
  ];
  const toShip = await db.order.findMany({
    where: { status: { in: dispatchStatuses }, shipment: { is: null } },
    orderBy: { createdAt: "asc" },
  });
  const quotedCosts = [4500, 6000, 7500];
  for (let i = 0; i < toShip.length; i++) {
    const order = toShip[i];
    const carrierId = order.deliveryCompanyId ?? courier?.id ?? null;
    const shippedAt = order.shippedAt ?? order.createdAt;
    const unquoted = i === toShip.length - 1;
    const status =
      order.status === OrderStatuses.Delivered
        ? "Delivered"
        : order.status === OrderStatuses.ReturningToOrigin
          ? "Returned"
          : "InTransit";

    if (order.shippedAt !== shippedAt || order.deliveryCompanyId !== carrierId) {
      await db.order.update({
        where: { id: order.id },
        data: { shippedAt, deliveryCompanyId: carrierId },
      });
    }
    await db.shipment.create({
      data: {
        orderId: order.id,
        deliveryCompanyId: carrierId,
        trackingNumber: `SL-DEMO-${order.number}`,
        status,
        providerMode: unquoted ? "Manual" : "Api",
        costCents: unquoted ? null : quotedCosts[i % quotedCosts.length],
        handedOverAt: shippedAt,
        createdAt: shippedAt,
      },
    });
  }

  // --- Dispatch manifests -----------------------------------------------------
  // Mirrors dailyCourierManifestNumber from lib/dispatch-manifests.ts (which
  // imports "server-only", unimportable from a plain seed process).
  if (courier) {
    const slug =
      courier.name
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, "")
        .slice(0, 8) || "COURIER";
    const tail = courier.id.slice(-5).toUpperCase();

    const open = await ensureManifest(db, {
      id: "demo-man-open",
      number: `MAN-${slug}-${tail}-${bdDayKey(new Date())}`,
      kind: "Courier",
      deliveryCompanyId: courier.id,
      status: "Open",
      handedOverAt: null,
    });
    const ready = await db.order.findMany({
      where: { status: { in: [OrderStatuses.Packing, OrderStatuses.Packed] } },
      orderBy: { createdAt: "asc" },
      take: 3,
      select: { id: true },
    });
    if (ready.length) {
      await db.dispatchManifestLine.createMany({
        data: ready.map((order) => ({
          id: `demo-manline-open-${order.id}`,
          manifestId: open.id,
          orderId: order.id,
        })),
        skipDuplicates: true,
      });
    }

    const handedOver = await ensureManifest(db, {
      id: "demo-man-handover",
      number: `MAN-${slug}-${tail}-${bdDayKey(ago(1))}`,
      kind: "Courier",
      deliveryCompanyId: courier.id,
      status: "HandedOver",
      handedOverAt: ago(1),
    });
    const delivered = await db.order.findMany({
      where: { status: OrderStatuses.Delivered },
      orderBy: { deliveredAt: "desc" },
      take: 2,
      select: { id: true },
    });
    if (delivered.length) {
      await db.dispatchManifestLine.createMany({
        data: delivered.map((order) => ({
          id: `demo-manline-hand-${order.id}`,
          manifestId: handedOver.id,
          orderId: order.id,
        })),
        skipDuplicates: true,
      });
    }
  }

  // --- Purchasing -------------------------------------------------------------
  // One supplier plus a Sent/Draft/Partial purchase order each so the
  // receiving page (Draft/Sent/Partial) and reorder CSV flow have content,
  // plus one completed receipt for history.
  const supplier = await db.supplier.upsert({
    where: { id: "demo-supplier-1" },
    update: {},
    create: {
      id: "demo-supplier-1",
      name: "Bengal Spice Traders",
      phone: "+8801811223344",
      email: "orders@bengalspice.example",
      address: "Kaliganj Bazar, Gazipur",
      note: "Primary masala supplier (demo fixture)",
    },
  });
  if (pa && pb && pPending) {
    const pos = [
      {
        number: "PO-DEMO-0001",
        status: "Sent" as const,
        orderedAt: ago(3),
        expectedAt: new Date(Date.now() + 7 * DAY_MS),
        lines: [
          { productId: pa.id, qtyOrdered: 50, qtyReceived: 0 },
          { productId: pb.id, qtyOrdered: 30, qtyReceived: 0 },
        ],
      },
      {
        number: "PO-DEMO-0002",
        status: "Draft" as const,
        orderedAt: null,
        expectedAt: null,
        lines: [{ productId: pPending.id, qtyOrdered: 20, qtyReceived: 0 }],
      },
      {
        number: "PO-DEMO-0003",
        status: "Partial" as const,
        orderedAt: ago(12),
        expectedAt: ago(2),
        lines: [{ productId: pa.id, qtyOrdered: 40, qtyReceived: 25 }],
      },
    ];
    const costById = new Map(products.map((p) => [p.id, demoCostCents(p)]));
    for (const po of pos) {
      if (await db.purchaseOrder.findUnique({ where: { number: po.number } })) continue;
      await db.purchaseOrder.create({
        data: {
          number: po.number,
          supplierId: supplier.id,
          warehouseId: main.id,
          status: po.status,
          orderedAt: po.orderedAt,
          expectedAt: po.expectedAt,
          lines: {
            create: po.lines.map((line) => ({
              productId: line.productId,
              qtyOrdered: line.qtyOrdered,
              qtyReceived: line.qtyReceived,
              unitCostCents: costById.get(line.productId) ?? null,
            })),
          },
        },
      });
    }
    if (!(await db.receipt.findUnique({ where: { id: "demo-receipt-1" } }))) {
      await db.receipt.create({
        data: {
          id: "demo-receipt-1",
          supplierId: supplier.id,
          warehouseId: main.id,
          receivedById: admin.id,
          receivedAt: ago(10),
          note: "Demo supplier delivery",
          lines: {
            create: [
              { productId: pa.id, qtyAccepted: 20, unitCostCents: costById.get(pa.id) ?? null },
              { productId: pb.id, qtyAccepted: 15, unitCostCents: costById.get(pb.id) ?? null },
            ],
          },
        },
      });
    }
  }
}

/** 55% of the selling price, rounded down — catalog seeds prices only. */
function demoCostCents(product: { priceCents: number; salePriceCents: number | null }): number {
  const basis = product.salePriceCents ?? product.priceCents;
  return Math.max(100, Math.floor((basis * 0.55) / 100) * 100);
}

type WarehouseSeed = {
  id: string;
  name: string;
  code: string;
  address: string;
  city: string;
  region: string;
  isDefault: boolean;
};

async function ensureWarehouse(db: PrismaClient, data: WarehouseSeed) {
  const byId = await db.warehouse.findUnique({ where: { id: data.id } });
  if (byId) return byId;
  try {
    return await db.warehouse.create({ data });
  } catch (error) {
    // The code is globally unique; a UI-created warehouse may own it already.
    const byCode = await db.warehouse.findUnique({ where: { code: data.code } });
    if (byCode) return byCode;
    throw error;
  }
}

type HubSeed = {
  id: string;
  name: string;
  code: string;
  city: string;
  region: string;
  warehouseId: string;
  isDefault: boolean;
  capacity: number;
};

async function ensureHub(db: PrismaClient, data: HubSeed) {
  const byId = await db.deliveryHub.findUnique({ where: { id: data.id } });
  if (byId) return byId;
  try {
    return await db.deliveryHub.create({ data });
  } catch (error) {
    const byCode = await db.deliveryHub.findUnique({ where: { code: data.code } });
    if (byCode) return byCode;
    throw error;
  }
}

type ZoneSeed = {
  id: string;
  name: string;
  areas: string[];
  mode: "OwnRider" | "Courier";
  rateCents: number;
  codFeeCents: number;
  freeOverCents: number | null;
  etaDaysFrom: number;
  etaDaysTo: number;
  warehouseId: string;
  deliveryHubId: string;
  deliveryCompanyId: string | null;
};

async function ensureZone(db: PrismaClient, data: ZoneSeed) {
  const byId = await db.deliveryZone.findUnique({ where: { id: data.id } });
  if (byId) return byId;
  return db.deliveryZone.create({ data });
}

async function ensureManifest(
  db: PrismaClient,
  seed: {
    id: string;
    number: string;
    kind: "Courier" | "Rider";
    deliveryCompanyId: string;
    status: "Open" | "HandedOver";
    handedOverAt: Date | null;
  },
) {
  // Prefer the number: the app may have already opened today's manifest.
  const byNumber = await db.dispatchManifest.findUnique({ where: { number: seed.number } });
  if (byNumber) return byNumber;
  const byId = await db.dispatchManifest.findUnique({ where: { id: seed.id } });
  if (byId) {
    // Day-scoped numbers move forward: rebind the fixture row to the new day.
    return db.dispatchManifest.update({ where: { id: seed.id }, data: seed });
  }
  try {
    return await db.dispatchManifest.create({ data: seed });
  } catch (error) {
    const again = await db.dispatchManifest.findUnique({ where: { number: seed.number } });
    if (again) return again;
    throw error;
  }
}
