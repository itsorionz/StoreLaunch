import { config } from "dotenv";
import { createPrismaClient } from "../lib/prisma-client";
import { PrismaClient } from "@backend/generated/prisma/client";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { test } from "node:test";
import { Roles } from "../lib/enums.mjs";

config({ quiet: true });
async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname), "Local database required");
  const name = `test_carrier_selection_${randomUUID().replaceAll("-", "")}`;
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
    const { registerCourierAdapter } = await import("../lib/courier-adapter-registry");
    const { CourierApiError } = await import("../lib/courier-adapter");
    const { rankCarriers, selectionReason, selectCarrierForOrder, effectiveRateCents } =
      await import("../lib/carrier-selection");
    type CarrierCandidate = Awaited<ReturnType<typeof rankCarriers>>[number];

    /** Deterministic quote adapter: fixed price/ETA, or manual (unquoted) mode. */
    function fakeAdapter(name: string, quote: { rateCents: number; etaDaysTo: number } | null) {
      return {
        name,
        isApi: quote !== null,
        async createShipment(request: { parcel: unknown; trackingNumber?: string }) {
          return {
            trackingNumber: (request.trackingNumber ?? `${name}-000`) as string,
            status: "Created" as const,
            labelUrl: null,
          };
        },
        async getTracking(trackingNumber: string) {
          return { trackingNumber, status: "InTransit" as const, statusHistory: [] };
        },
        async calculateRate() {
          if (!quote) throw new CourierApiError(name, "NO_QUOTE", "no quote");
          return { carrier: name, currencyCode: "BDT", ...quote };
        },
        async generateLabel() {
          return { labelUrl: null, format: "URL" as const };
        },
        mapStatus() {
          return "Pending" as const;
        },
      };
    }

    registerCourierAdapter(
      "alphaco",
      fakeAdapter("Alpha Express", { rateCents: 500, etaDaysTo: 2 }),
    );
    registerCourierAdapter(
      "bravoco",
      fakeAdapter("Bravo Courier", { rateCents: 300, etaDaysTo: 5 }),
    );
    registerCourierAdapter("charlieco", fakeAdapter("Charlie Post", null));
    registerCourierAdapter(
      "pinnedco",
      fakeAdapter("Pinned Express", { rateCents: 9000, etaDaysTo: 4 }),
    );
    registerCourierAdapter("deltaco", fakeAdapter("Delta Ship", { rateCents: 700, etaDaysTo: 2 }));
    registerCourierAdapter("echoco", fakeAdapter("Echo Ship", { rateCents: 700, etaDaysTo: 2 }));

    const alpha = await db.deliveryCompany.create({
      data: { name: "Alpha Express", providerKey: "alphaco" },
    });
    const bravo = await db.deliveryCompany.create({
      data: { name: "Bravo Courier", providerKey: "bravoco" },
    });
    const charlie = await db.deliveryCompany.create({
      data: { name: "Charlie Post", providerKey: "charlieco" },
    });
    const pinned = await db.deliveryCompany.create({
      data: { name: "Pinned Express", providerKey: "pinnedco" },
    });
    const delta = await db.deliveryCompany.create({
      data: { name: "Delta Ship", providerKey: "deltaco" },
    });
    const echo = await db.deliveryCompany.create({
      data: { name: "Echo Ship", providerKey: "echoco" },
    });

    const customer = await db.user.create({
      data: {
        name: "Carrier Buyer",
        email: "carrier-buyer@carrier.invalid",
        phone: "01712340001",
        passwordHash: "unused",
        roles: [Roles.Customer],
      },
    });

    async function makeOrder(options: { zoneId?: string | null } = {}) {
      return db.order.create({
        data: {
          number: `SL-CAR-${randomUUID().slice(0, 10).toUpperCase()}`,
          subtotalCents: 1500,
          totalCents: 1500,
          currencyCode: "BDT",
          currencySymbol: "৳",
          recipientName: "Carrier Buyer",
          phone: "01712340001",
          line1: "Street 1",
          city: "Dhaka",
          userId: customer.id,
          zoneId: options.zoneId ?? null,
        },
      });
    }

    const courierZone = await db.deliveryZone.create({
      data: { name: "Nationwide", mode: "Courier", etaDaysTo: 3 },
    });
    const ownRiderZone = await db.deliveryZone.create({
      data: { name: "Inside Dhaka", mode: "OwnRider" },
    });
    const pinnedZone = await db.deliveryZone.create({
      data: {
        name: "Contracted lane",
        mode: "Courier",
        etaDaysTo: 6,
        deliveryCompanyId: pinned.id,
      },
    });

    await test("rankCarriers orders by ETA, then price, then RTO, then name", () => {
      const base = {
        rateCents: 100,
        etaDaysTo: 2,
        quoted: true,
        pinned: false,
        rtoRate: 0,
      };
      const candidates: CarrierCandidate[] = [
        { ...base, companyId: "c1", name: "Zeta", rateCents: 50 },
        { ...base, companyId: "c2", name: "Eta", rateCents: 10, etaDaysTo: 9 },
        { ...base, companyId: "c3", name: "Alpha", rateCents: 200 },
        { ...base, companyId: "c5", name: "Manual", rateCents: null, quoted: false },
        { ...base, companyId: "c6", name: "Risky", rateCents: 50, rtoRate: 0.5 },
      ];
      // Zone ETA is 3 days: Eta (9 days) fails ETA despite the cheapest quote,
      // and the unquoted carrier sorts last among the ETA-compliant ones.
      const ranked = rankCarriers(candidates, 3);
      assert.deepEqual(
        ranked.map((c) => c.companyId),
        ["c1", "c6", "c3", "c5", "c2"],
      );
      // A pinned carrier wins outright, ignoring every other rule.
      const pinnedOnly = rankCarriers(
        [
          ...candidates,
          { ...base, companyId: "c4", name: "Pinned Co", rateCents: 5000, pinned: true },
        ],
        3,
      );
      assert.deepEqual(
        pinnedOnly.map((c) => c.companyId),
        ["c4"],
      );
    });

    await test("selectionReason explains the winning rule", () => {
      const candidate: CarrierCandidate = {
        companyId: "x",
        name: "X",
        rateCents: 100,
        etaDaysTo: 2,
        quoted: true,
        pinned: false,
        rtoRate: 0,
      };
      assert.equal(
        selectionReason({ ...candidate, pinned: true }, 3),
        "pinned on the delivery zone",
      );
      assert.equal(
        selectionReason({ ...candidate, quoted: false, rateCents: null }, 3),
        "no live quotes available; first active carrier",
      );
      assert.equal(selectionReason(candidate, 3), "cheapest live quote meeting the zone ETA");
      assert.equal(selectionReason({ ...candidate, etaDaysTo: 8 }, 3), "cheapest live quote");
    });

    await test("effectiveRateCents applies basis points only above the threshold", () => {
      const base: CarrierCandidate = {
        companyId: "c1",
        name: "Co",
        rateCents: 1000,
        etaDaysTo: 2,
        quoted: true,
        pinned: false,
        rtoRate: 0,
        discountBps: 1250,
        volumeMinParcels: 5,
      };
      assert.equal(effectiveRateCents({ ...base, parcels30d: 5 }), 875); // 1000 − 12.5%
      assert.equal(effectiveRateCents({ ...base, parcels30d: 4 }), 1000); // below threshold
      assert.equal(effectiveRateCents({ ...base, parcels30d: 9, discountBps: 0 }), 1000);
      assert.equal(effectiveRateCents({ ...base, parcels30d: 9, rateCents: null }), null);
    });

    await test("volume discounts lower the effective quote in the ranking", () => {
      const base = {
        rateCents: 300,
        etaDaysTo: 2,
        quoted: true,
        pinned: false,
        rtoRate: 0,
      };
      const cheap = { ...base, companyId: "c1", name: "Alpha", rateCents: 260 };
      const discounted = {
        ...base,
        companyId: "c2",
        name: "Bravo",
        discountBps: 2000, // 20% → effective 240 once volume qualifies
        volumeMinParcels: 10,
        parcels30d: 10,
      };
      assert.equal(rankCarriers([cheap, discounted], 3)[0].companyId, "c2");
      assert.equal(
        rankCarriers([cheap, { ...discounted, parcels30d: 9 }], 3)[0].companyId,
        "c1",
        "below the threshold the discount must not apply",
      );
    });

    await test("first-attempt success breaks equal-price, equal-RTO ties", () => {
      const base = {
        rateCents: 100,
        etaDaysTo: 2,
        quoted: true,
        pinned: false,
        rtoRate: 0,
      };
      const ranked = rankCarriers(
        [
          { ...base, companyId: "c1", name: "Hotel", firstAttemptRate: 0.25 },
          { ...base, companyId: "c2", name: "India", firstAttemptRate: 0.9 },
        ],
        3,
      );
      assert.deepEqual(
        ranked.map((c) => c.companyId),
        ["c2", "c1"],
      );
      // A carrier with no recorded history ranks as if perfect (no known misses).
      assert.equal(
        rankCarriers(
          [
            { ...base, companyId: "c1", name: "Hotel", firstAttemptRate: 0.25 },
            { ...base, companyId: "c3", name: "New" },
          ],
          3,
        )[0].companyId,
        "c3",
      );
    });

    await test("selection prefers the cheapest quote that meets the zone ETA", async () => {
      const order = await makeOrder({ zoneId: courierZone.id });
      const selection = await selectCarrierForOrder(order.id);
      assert.ok(selection.ok);
      if (!selection.ok) return;
      // Bravo (300) is cheaper but needs 5 days against the zone's 3-day ETA.
      assert.equal(selection.companyId, alpha.id);
      assert.equal(selection.reason, "cheapest live quote meeting the zone ETA");
      assert.equal(selection.rateCents, 500);
    });

    await test("own-rider zones refuse courier selection", async () => {
      const order = await makeOrder({ zoneId: ownRiderZone.id });
      const selection = await selectCarrierForOrder(order.id);
      assert.equal(selection.ok, false);
      if (selection.ok) return;
      assert.match(selection.error, /own riders/i);
    });

    await test("a carrier pinned on the zone wins outright", async () => {
      const order = await makeOrder({ zoneId: pinnedZone.id });
      const selection = await selectCarrierForOrder(order.id);
      assert.ok(selection.ok);
      if (!selection.ok) return;
      assert.equal(selection.companyId, pinned.id);
      assert.equal(selection.reason, "pinned on the delivery zone");
    });

    await test("equal quotes break ties on RTO history", async () => {
      // Clear the field so only Delta and Echo (same price/ETA) compete.
      await db.deliveryCompany.updateMany({
        where: { id: { in: [alpha.id, bravo.id, charlie.id, pinned.id] } },
        data: { active: false },
      });
      const tieZone = await db.deliveryZone.create({
        data: { name: "Tie lane", mode: "Courier", etaDaysTo: 7 },
      });
      const order = await makeOrder({ zoneId: tieZone.id });

      // Delta delivered its only parcel; Echo's came back as RTO.
      const deliverable = await makeOrder();
      await db.order.update({
        where: { id: deliverable.id },
        data: { status: "Delivered", deliveryCompanyId: delta.id },
      });
      const rto = await makeOrder();
      await db.order.update({
        where: { id: rto.id },
        data: { status: "ReturningToOrigin", deliveryCompanyId: echo.id },
      });

      const selection = await selectCarrierForOrder(order.id);
      assert.ok(selection.ok);
      if (!selection.ok) return;
      assert.equal(selection.companyId, delta.id);
    });

    await test("a volume discount flips the cheapest live quote", async () => {
      registerCourierAdapter(
        "foxtrotco",
        fakeAdapter("Foxtrot Freight", { rateCents: 540, etaDaysTo: 2 }),
      );
      registerCourierAdapter("golfco", fakeAdapter("Golf Cargo", { rateCents: 520, etaDaysTo: 2 }));
      const foxtrot = await db.deliveryCompany.create({
        data: {
          name: "Foxtrot Freight",
          providerKey: "foxtrotco",
          volumeDiscountBps: 1000,
          volumeMinParcels: 5,
        },
      });
      const golf = await db.deliveryCompany.create({
        data: { name: "Golf Cargo", providerKey: "golfco" },
      });

      const order = await makeOrder({ zoneId: courierZone.id });
      let selection = await selectCarrierForOrder(order.id);
      assert.ok(selection.ok);
      if (!selection.ok) return;
      // Without volume history Golf's 520 beats Foxtrot's 540.
      assert.equal(selection.companyId, golf.id);
      assert.equal(selection.rateCents, 520);

      // Five parcels shipped in the trailing 30 days unlock the 10% discount.
      for (let i = 0; i < 5; i++) {
        const shipped = await makeOrder();
        await db.order.update({
          where: { id: shipped.id },
          data: { status: "Shipped", deliveryCompanyId: foxtrot.id, shippedAt: new Date() },
        });
      }
      selection = await selectCarrierForOrder(order.id);
      assert.ok(selection.ok);
      if (!selection.ok) return;
      assert.equal(selection.companyId, foxtrot.id);
      assert.equal(selection.rateCents, 486); // 540 − 10%
      assert.match(selection.reason, /volume discount/);
    });

    await test("first-attempt delivery history breaks equal-quote ties", async () => {
      await db.deliveryCompany.updateMany({
        where: { name: { in: ["Foxtrot Freight", "Golf Cargo"] } },
        data: { active: false },
      });
      registerCourierAdapter(
        "hotelco",
        fakeAdapter("Hotel Logistics", { rateCents: 650, etaDaysTo: 2 }),
      );
      registerCourierAdapter(
        "indiasco",
        fakeAdapter("India Cargo", { rateCents: 650, etaDaysTo: 2 }),
      );
      const hotel = await db.deliveryCompany.create({
        data: { name: "Hotel Logistics", providerKey: "hotelco" },
      });
      const india = await db.deliveryCompany.create({
        data: { name: "India Cargo", providerKey: "indiasco" },
      });
      const rider = await db.rider.create({
        data: { name: "Attempt Rider", phone: "01712340099" },
      });

      // Hotel's delivered parcels each needed a second attempt; India's went
      // through first time. Same price, no RTOs — first attempt decides.
      for (const company of [hotel, india]) {
        for (let i = 0; i < 2; i++) {
          const delivered = await makeOrder();
          await db.order.update({
            where: { id: delivered.id },
            data: { status: "Delivered", deliveryCompanyId: company.id },
          });
          if (company.id !== hotel.id) continue;
          for (const note of ["first attempt missed", "second attempt delivered"]) {
            await db.deliveryAttempt.create({
              data: { orderId: delivered.id, riderId: rider.id, reason: "NO_ANSWER", note },
            });
          }
        }
      }

      const order = await makeOrder({ zoneId: courierZone.id });
      const selection = await selectCarrierForOrder(order.id);
      assert.ok(selection.ok);
      if (!selection.ok) return;
      assert.equal(selection.companyId, india.id);
    });

    await test("no active carriers is an explicit error", async () => {
      await db.deliveryCompany.updateMany({ data: { active: false } });
      const order = await makeOrder({ zoneId: courierZone.id });
      const selection = await selectCarrierForOrder(order.id);
      assert.equal(selection.ok, false);
      if (selection.ok) return;
      assert.match(selection.error, /no active delivery companies/i);
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
