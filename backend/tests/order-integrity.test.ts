import {
  DeliveryRelationships,
  AddressTypes,
  OrderCurrencySources,
  OrderEventTypes,
  OrderStatuses,
  PaymentMethods,
  Roles,
  WalletTransactionTypes,
} from "@backend/lib/enums.mjs";
/** Integration tests apply all migrations to a disposable LOCAL PostgreSQL database. */
import { config } from "dotenv";
import { createPrismaClient } from "../lib/prisma-client";
import { PrismaClient } from "@backend/generated/prisma/client";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { test } from "node:test";
import type { CartData } from "../lib/cart";

config({ quiet: true });

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    throw new Error("Order integration tests require a local PostgreSQL database");
  const databaseName = `test_orders_${randomUUID().replaceAll("-", "")}`;
  const admin = createPrismaClient();
  await admin.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`);
  url.pathname = `/${databaseName}`;
  url.searchParams.set("schema", "public");
  process.env.DATABASE_URL = url.toString();
  let testDb: PrismaClient | undefined;
  try {
    execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], {
      env: process.env,
      stdio: "pipe",
      timeout: 60_000,
    });
    const { db } = await import("../lib/db");
    testDb = db;
    const { createReservedOrder } = await import("../lib/order-placement");
    const { transitionOrder, assignOrderDelivery } = await import("../lib/order-lifecycle");
    const { fulfillPaidOrder } = await import("../lib/fulfillment");
    const { validateSslcommerzPayment } = await import("../lib/sslcommerz");
    const { remitCodCollection, confirmLegacyOrderCurrency } =
      await import("../lib/order-reconciliation");

    async function fixture(stock = 10, balance = 5000) {
      const key = randomUUID();
      const user = await db.user.create({
        data: { name: "Test buyer", email: `${key}@example.test`, passwordHash: "unused" },
      });
      const category = await db.category.create({ data: { name: key, slug: key } });
      const product = await db.product.create({
        data: { name: "Product", slug: key, categoryId: category.id, priceCents: 1000, stock },
      });
      const wallet = await db.wallet.create({ data: { userId: user.id, balanceCents: balance } });
      const cart = await db.cart.create({
        data: { userId: user.id, items: { create: { productId: product.id, quantity: 2 } } },
        include: { items: true },
      });
      const snapshot: CartData = {
        id: cart.id,
        items: [{ id: cart.items[0].id, quantity: 2, selected: true, product }],
        subtotalCents: 2000,
        itemCount: 2,
      };
      const input = {
        userId: user.id,
        number: key,
        cart: snapshot,
        shippingCents: 100,
        walletCents: 500,
        currencyCode: "BDT",
        currencySymbol: "BDT ",
        paymentMethod: PaymentMethods.COD,
        recipientName: "Buyer",
        phone: "01700000000",
        line1: "123 Main Street",
        city: "Dhaka",
      };
      return { user, product, wallet, cart, input };
    }

    await test("campaign bulk percentage prices validate atomically and do not change product prices", async () => {
      const { saveCampaignProducts } = await import("../lib/campaign-management");
      const { CampaignDiscountModes } = await import("../lib/campaign-constants");
      const f = await fixture();
      const campaign = await db.campaign.create({
        data: { title: "Product campaign", imageUrl: "/banner.svg", linkUrl: "", flashSale: true },
      });
      const input = {
        campaignId: campaign.id,
        productIds: [f.product.id],
        mode: CampaignDiscountModes.Percentage,
        amount: "15",
      };
      assert.equal((await saveCampaignProducts({ ...input, amount: "100" })).ok, false);
      assert.equal(
        (await saveCampaignProducts({ ...input, productIds: [f.product.id, "missing"] })).ok,
        false,
      );
      assert.equal(await db.campaignProduct.count({ where: { campaignId: campaign.id } }), 0);
      assert.equal((await saveCampaignProducts(input)).ok, true);
      assert.equal(
        (
          await db.campaignProduct.findUniqueOrThrow({
            where: { campaignId_productId: { campaignId: campaign.id, productId: f.product.id } },
          })
        ).offerPriceCents,
        850,
      );
      assert.equal(
        (await db.product.findUniqueOrThrow({ where: { id: f.product.id } })).salePriceCents,
        null,
      );
      assert.equal(
        (await saveCampaignProducts({ ...input, mode: CampaignDiscountModes.Price, amount: "10" }))
          .ok,
        false,
      );
      assert.equal(
        (
          await saveCampaignProducts({
            ...input,
            mode: CampaignDiscountModes.Price,
            amount: "7.50",
          })
        ).ok,
        true,
      );
    });
    await test("campaign prices reach catalog and reserved orders; inactive offers and overlaps are handled", async () => {
      const { searchProducts } = await import("../lib/catalog");
      const f = await fixture();
      const campaign = await db.campaign.create({
        data: {
          title: "Flash campaign",
          imageUrl: "/banner.svg",
          linkUrl: "",
          flashSale: true,
          products: { create: { productId: f.product.id, offerPriceCents: 700 } },
        },
      });
      const other = await db.campaign.create({
        data: {
          title: "Other campaign",
          imageUrl: "/banner.svg",
          linkUrl: "",
          products: { create: { productId: f.product.id, offerPriceCents: 800 } },
        },
      });
      let result = await searchProducts({ campaign: campaign.id, flashSale: true });
      assert.equal(result.products[0].salePriceCents, 700);
      assert.equal(result.products[0].flashSale, true);
      await db.campaign.update({ where: { id: campaign.id }, data: { active: false } });
      assert.equal((await searchProducts({ campaign: campaign.id })).total, 0);
      result = await searchProducts({ q: f.product.slug });
      assert.equal(result.products[0].salePriceCents, 800);
      assert.equal(result.products[0].flashSale, false);
      await db.campaign.delete({ where: { id: other.id } });
      assert.equal((await searchProducts({ q: f.product.slug })).products[0].salePriceCents, null);
      await db.campaign.update({ where: { id: campaign.id }, data: { active: true } });
      f.input.cart.items[0].product.salePriceCents = 700;
      const order = await createReservedOrder(f.input);
      assert.equal(order.subtotalCents, 1400);
      assert.equal(
        (await db.orderItem.findFirstOrThrow({ where: { orderId: order.id } })).priceCents,
        700,
      );
    });
    await test("checkout rejects a withdrawn campaign price without reserving stock or clearing the cart", async () => {
      const f = await fixture();
      const campaign = await db.campaign.create({
        data: {
          title: "Withdrawn offer",
          imageUrl: "/banner.svg",
          linkUrl: "",
          active: false,
          products: { create: { productId: f.product.id, offerPriceCents: 600 } },
        },
      });
      f.input.cart.items[0].product.salePriceCents = 600;
      await assert.rejects(createReservedOrder(f.input), /CART_CHANGED/);
      assert.equal((await db.product.findUniqueOrThrow({ where: { id: f.product.id } })).stock, 10);
      assert.equal(await db.cartItem.count({ where: { cartId: f.cart.id } }), 1);
      await db.campaign.delete({ where: { id: campaign.id } });
    });

    async function adminActor() {
      const user = await db.user.create({
        data: {
          email: `${randomUUID()}@example.test`,
          name: "Cash office admin",
          passwordHash: "unused",
          roles: [Roles.Admin],
        },
      });
      return { id: user.id, name: user.name, role: Roles.Admin };
    }

    async function shippedCod() {
      const f = await fixture();
      await db.user.update({
        where: { id: f.user.id },
        data: { roles: [Roles.Customer, Roles.Rider] },
      });
      const rider = await db.rider.create({
        data: { name: "Accountable courier", phone: "01700000001", userId: f.user.id },
      });
      const actor = { id: f.user.id, name: "Courier user", role: Roles.Rider };
      const order = await createReservedOrder(f.input);
      await assignOrderDelivery(order.id, `rider:${rider.id}`);
      assert.equal(
        (await transitionOrder(order.id, OrderStatuses.Shipped, { riderId: rider.id, actor })).ok,
        true,
      );
      return { ...f, order, rider, actor };
    }

    const { recordDeliveryAttempt, completeRiderDelivery, proofSchema, attemptSchema } =
      await import("../lib/rider-delivery");
    await test("cart selection is owner-scoped; checkout buys only selected lines and retains the rest", async () => {
      const f = await fixture(),
        other = await fixture();
      const { changeCartSelection } = await import("../lib/cart-selection");
      const extra = await db.cartItem.create({
        data: { cartId: f.cart.id, productId: other.product.id, quantity: 1 },
      });
      assert.equal(
        (await changeCartSelection(f.cart.id, [other.cart.items[0].id], false)).ok,
        false,
      );
      assert.equal(
        (await db.cartItem.findUniqueOrThrow({ where: { id: other.cart.items[0].id } })).selected,
        true,
      );
      assert.equal((await changeCartSelection(f.cart.id, [extra.id], false)).ok, true);
      await createReservedOrder(f.input);
      const remaining = await db.cartItem.findMany({ where: { cartId: f.cart.id } });
      assert.equal(remaining.length, 1);
      assert.equal(remaining[0].id, extra.id);
      assert.equal(remaining[0].selected, false);
      await changeCartSelection(f.cart.id, null, false, true);
      assert.equal(await db.cartItem.count({ where: { cartId: f.cart.id } }), 1);
      assert.equal(
        (await db.product.findUniqueOrThrow({ where: { id: other.product.id } })).stock,
        10,
      );
    });
    await test("changing selection invalidates a stale checkout snapshot without reserving stock", async () => {
      const f = await fixture();
      const { changeCartSelection } = await import("../lib/cart-selection");
      assert.equal((await changeCartSelection(f.cart.id, null, false)).ok, true);
      await assert.rejects(createReservedOrder(f.input), /CART_CHANGED/);
      assert.equal((await db.product.findUniqueOrThrow({ where: { id: f.product.id } })).stock, 10);
      assert.equal(
        (await db.wallet.findUniqueOrThrow({ where: { id: f.wallet.id } })).balanceCents,
        5000,
      );
      assert.equal((await changeCartSelection(f.cart.id, null, true)).ok, true);
      assert.equal((await changeCartSelection(f.cart.id, null, false, true)).ok, true);
      assert.equal(await db.cartItem.count({ where: { cartId: f.cart.id } }), 0);
    });

    await test("additional info is an order snapshot; ordering again preserves the cart, current pricing and stock limits", async () => {
      const f = await fixture();
      const order = await createReservedOrder({
        ...f.input,
        additionalInfo: "  Call before delivery.\nOffice reception.  ",
      });
      assert.equal(order.additionalInfo, "Call before delivery.\nOffice reception.");
      const existing = await fixture();
      await db.cartItem.create({
        data: { cartId: f.cart.id, productId: existing.product.id, quantity: 1 },
      });
      await db.product.update({
        where: { id: f.product.id },
        data: { priceCents: 2050, stock: 1 },
      });
      const { restoreOrderItems } = await import("../lib/order-again");
      const result = await restoreOrderItems(f.user.id, order.id);
      assert.equal(result.ok, true);
      assert.equal(result.warnings?.length, 1);
      await db.cartItem.updateMany({
        where: { cartId: f.cart.id, productId: f.product.id },
        data: { selected: false },
      });
      await restoreOrderItems(f.user.id, order.id);
      assert.equal(
        (
          await db.cartItem.findUniqueOrThrow({
            where: { cartId_productId: { cartId: f.cart.id, productId: f.product.id } },
          })
        ).selected,
        true,
      );
      const items = await db.cartItem.findMany({
        where: { cartId: f.cart.id },
        include: { product: true },
      });
      assert.equal(items.length, 2);
      assert.equal(items.find((item) => item.productId === f.product.id)?.quantity, 1);
      assert.equal(items.find((item) => item.productId === f.product.id)?.product.priceCents, 2050);
      assert.equal(items.find((item) => item.productId === existing.product.id)?.quantity, 1);
      assert.equal(
        (await db.orderItem.findFirstOrThrow({ where: { orderId: order.id } })).priceCents,
        1000,
      );
      assert.equal((await db.product.findUniqueOrThrow({ where: { id: f.product.id } })).stock, 1);
      assert.equal(
        (await db.wallet.findUniqueOrThrow({ where: { userId: f.user.id } })).balanceCents,
        4500,
      );
    });
    await test("ordering again rejects foreign orders and unavailable products without touching cart contents", async () => {
      const f = await fixture(),
        stranger = await fixture();
      const order = await createReservedOrder(f.input);
      const { restoreOrderItems } = await import("../lib/order-again");
      assert.equal((await restoreOrderItems(stranger.user.id, order.id)).ok, false);
      assert.equal(await db.cartItem.count({ where: { cartId: stranger.cart.id } }), 1);
      await db.product.update({ where: { id: f.product.id }, data: { active: false } });
      assert.equal((await restoreOrderItems(f.user.id, order.id)).ok, false);
      assert.equal(await db.cartItem.count({ where: { cartId: f.cart.id } }), 0);
      await db.product.update({ where: { id: f.product.id }, data: { active: true, stock: 0 } });
      assert.equal((await restoreOrderItems(f.user.id, order.id)).ok, false);
    });
    await test("ordering again and checkout serialize safely on the same cart", async () => {
      const f = await fixture();
      const previous = await createReservedOrder(f.input);
      const { restoreOrderItems } = await import("../lib/order-again");
      await restoreOrderItems(f.user.id, previous.id);
      const item = await db.cartItem.findFirstOrThrow({ where: { cartId: f.cart.id } });
      const snapshot = { ...f.input.cart, items: [{ ...f.input.cart.items[0], id: item.id }] };
      await Promise.all([
        createReservedOrder({ ...f.input, number: randomUUID(), cart: snapshot }),
        restoreOrderItems(f.user.id, previous.id),
      ]);
      assert.equal(await db.order.count({ where: { userId: f.user.id } }), 2);
      assert.equal((await db.product.findUniqueOrThrow({ where: { id: f.product.id } })).stock, 6);
      assert.equal(
        (await db.wallet.findUniqueOrThrow({ where: { userId: f.user.id } })).balanceCents,
        4000,
      );
    });
    await test("preparation stages require an admin, advance in sequence and preserve stock with timestamped history", async () => {
      const f = await fixture();
      const order = await createReservedOrder(f.input);
      const actor = await adminActor();
      assert.equal(
        (
          await transitionOrder(order.id, OrderStatuses.Processing, {
            actor: { id: f.user.id, name: f.user.name, role: Roles.Customer },
          })
        ).ok,
        false,
      );
      assert.equal((await transitionOrder(order.id, OrderStatuses.Confirmed, { actor })).ok, false);
      assert.equal((await transitionOrder(order.id, OrderStatuses.Processing, { actor })).ok, true);
      assert.equal((await transitionOrder(order.id, OrderStatuses.Processing, { actor })).ok, true);
      assert.equal((await transitionOrder(order.id, OrderStatuses.Packed, { actor })).ok, false);
      const rider = await db.rider.create({
        data: { name: "Preparation rider", phone: "01700000001" },
      });
      assert.equal((await assignOrderDelivery(order.id, `rider:${rider.id}`, actor)).ok, true);
      assert.equal((await transitionOrder(order.id, OrderStatuses.Shipped, { actor })).ok, false);
      for (const stage of [
        OrderStatuses.Confirmed,
        OrderStatuses.Packing,
        OrderStatuses.Packed,
      ] as const)
        assert.equal((await transitionOrder(order.id, stage, { actor })).ok, true);
      assert.equal((await db.product.findUniqueOrThrow({ where: { id: f.product.id } })).stock, 8);
      const events = await db.orderEvent.findMany({
        where: {
          orderId: order.id,
          type: {
            in: [
              OrderStatuses.Processing,
              OrderStatuses.Confirmed,
              OrderStatuses.Packing,
              OrderStatuses.Packed,
            ],
          },
        },
        orderBy: { createdAt: "asc" },
      });
      assert.equal(events.length, 4);
      assert.ok(
        events.every((event) => event.actorId === actor.id && event.createdAt instanceof Date),
      );
      assert.equal(
        await db.inboxMessage.count({
          where: { userId: f.user.id, sourceKey: { startsWith: `order:${order.id}:` } },
        }),
        5,
      );
      assert.equal((await transitionOrder(order.id, OrderStatuses.Shipped, { actor })).ok, true);
      assert.equal((await transitionOrder(order.id, OrderStatuses.Delivered, { actor })).ok, false);
      assert.equal(
        (await transitionOrder(order.id, OrderStatuses.Delivered, { actor, cashCollected: true }))
          .ok,
        true,
      );
    });
    await test("preparation blocks unpaid online orders and preserves cancellation/refund safeguards", async () => {
      const f = await fixture();
      const actor = await adminActor();
      const order = await createReservedOrder({
        ...f.input,
        paymentMethod: PaymentMethods.GATEWAY,
      });
      assert.equal(
        (await transitionOrder(order.id, OrderStatuses.Processing, { actor })).ok,
        false,
      );
      await db.order.update({
        where: { id: order.id },
        data: { status: OrderStatuses.Paid, paidAt: new Date() },
      });
      assert.equal((await transitionOrder(order.id, OrderStatuses.Processing, { actor })).ok, true);
      assert.equal((await transitionOrder(order.id, OrderStatuses.Cancelled, { actor })).ok, false);
      const cod = await fixture();
      const codOrder = await createReservedOrder(cod.input);
      for (const stage of [
        OrderStatuses.Processing,
        OrderStatuses.Confirmed,
        OrderStatuses.Packing,
      ] as const)
        assert.equal((await transitionOrder(codOrder.id, stage, { actor })).ok, true);
      assert.equal(
        (await transitionOrder(codOrder.id, OrderStatuses.Cancelled, { actor })).ok,
        true,
      );
      assert.equal(
        (await db.product.findUniqueOrThrow({ where: { id: cod.product.id } })).stock,
        10,
      );
      assert.equal(
        (await db.wallet.findUniqueOrThrow({ where: { userId: cod.user.id } })).balanceCents,
        5000,
      );
    });
    await test("rider attempt is assigned-only, deduplicated, audited and keeps delivery open", async () => {
      const f = await shippedCod();
      const input = {
        orderId: f.order.id,
        reason: "NO_ANSWER" as const,
        note: "Called twice, no answer",
        nextAttempt: "",
      };
      const stranger = await adminActor();
      assert.equal((await recordDeliveryAttempt(stranger.id, input)).ok, false);
      assert.equal((await recordDeliveryAttempt(f.user.id, input)).ok, true);
      assert.equal((await recordDeliveryAttempt(f.user.id, input)).ok, true);
      assert.equal(await db.deliveryAttempt.count({ where: { orderId: f.order.id } }), 1);
      assert.equal(
        await db.orderEvent.count({
          where: { orderId: f.order.id, type: OrderEventTypes.DeliveryAttempted },
        }),
        1,
      );
      assert.equal(
        (await db.order.findUniqueOrThrow({ where: { id: f.order.id } })).status,
        OrderStatuses.Shipped,
      );
    });
    await test("rider proof, delivered status and COD evidence commit once together", async () => {
      const f = await shippedCod();
      const input = {
        orderId: f.order.id,
        receivedBy: "Parcel Receiver",
        relationship: DeliveryRelationships.customer,
        note: "Handed over at entrance",
        handoverConfirmed: true,
        cashCollected: true,
      };
      assert.equal(
        (await completeRiderDelivery(f.user.id, { ...input, handoverConfirmed: false })).ok,
        false,
      );
      assert.equal(
        (await completeRiderDelivery(f.user.id, { ...input, cashCollected: false })).ok,
        false,
      );
      assert.equal(await db.deliveryProof.count({ where: { orderId: f.order.id } }), 0);
      const results = await Promise.all([
        completeRiderDelivery(f.user.id, input),
        completeRiderDelivery(f.user.id, input),
      ]);
      assert.equal(results.filter((result) => result.ok).length, 1);
      assert.equal(
        (await db.order.findUniqueOrThrow({ where: { id: f.order.id } })).status,
        OrderStatuses.Delivered,
      );
      assert.equal(await db.deliveryProof.count({ where: { orderId: f.order.id } }), 1);
      assert.equal(await db.codCollection.count({ where: { orderId: f.order.id } }), 1);
      assert.equal(
        await db.orderEvent.count({
          where: { orderId: f.order.id, type: OrderEventTypes.DeliveryProofRecorded },
        }),
        1,
      );
      await assert.rejects(
        db.deliveryProof.update({
          where: { orderId: f.order.id },
          data: { receivedBy: "Changed" },
        }),
      );
      assert.equal(
        (
          await recordDeliveryAttempt(f.user.id, {
            orderId: f.order.id,
            reason: AddressTypes.OTHER,
            note: "Late invalid attempt",
            nextAttempt: "",
          })
        ).ok,
        false,
      );
    });
    await test("other riders and deactivated riders cannot complete handover", async () => {
      const f = await shippedCod();
      const input = {
        orderId: f.order.id,
        receivedBy: "Receiver",
        relationship: DeliveryRelationships.customer,
        note: "",
        handoverConfirmed: true,
        cashCollected: true,
      };
      const stranger = await adminActor();
      assert.equal((await completeRiderDelivery(stranger.id, input)).ok, false);
      await db.rider.update({ where: { id: f.rider.id }, data: { active: false } });
      assert.equal((await completeRiderDelivery(f.user.id, input)).ok, false);
      assert.equal(await db.deliveryProof.count({ where: { orderId: f.order.id } }), 0);
    });
    await test("maps use correctly encoded search and direction URLs without a key", async () => {
      const { deliveryMapLinks } = await import("../lib/delivery-maps");
      const address = "House 10 & Block B, Dhaka";
      const links = deliveryMapLinks(address);
      assert.equal(new URL(links.map).searchParams.get("query"), `${address}, Bangladesh`);
      assert.equal(
        new URL(links.directions).searchParams.get("destination"),
        `${address}, Bangladesh`,
      );
      assert.equal(new URL(links.directions).searchParams.get("api"), "1");
      assert.equal(new URL(links.directions).searchParams.has("key"), false);
    });
    await test("proof photo storage validates bytes and size and uses generated private keys", async () => {
      const { saveProofPhoto, discardProofPhoto } = await import("../lib/delivery-photo");
      await assert.rejects(saveProofPhoto("not-a-file"));
      await assert.rejects(saveProofPhoto(new File(["html"], "fake.jpg", { type: "image/jpeg" })));
      await assert.rejects(
        saveProofPhoto(
          new File([new Uint8Array(5 * 1024 * 1024 + 1)], "large.png", { type: "image/png" }),
        ),
      );
      const photo = await saveProofPhoto(
        new File(
          [
            Buffer.from(
              "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jv5kAAAAASUVORK5CYII=",
              "base64",
            ),
          ],
          "../../outside.png",
          { type: "image/png" },
        ),
      );
      try {
        assert.match(photo.photoKey ?? "", /^[0-9a-f-]{36}$/);
        assert.equal(photo.photoMime, "image/png");
      } finally {
        await discardProofPhoto(photo.photoKey);
      }
    });

    await test("rider form schemas reject missing handover and invalid retry dates", () => {
      assert.equal(
        proofSchema.safeParse({
          orderId: "order",
          receivedBy: "Receiver",
          relationship: DeliveryRelationships.customer,
          note: "",
        }).success,
        false,
      );
      assert.equal(
        attemptSchema.safeParse({
          orderId: "order",
          reason: AddressTypes.OTHER,
          note: "Valid notes",
          nextAttempt: "2000-01-01T12:00",
        }).success,
        false,
      );
      assert.equal(
        attemptSchema.safeParse({ orderId: "order", reason: "INVALID", note: "Valid notes" })
          .success,
        false,
      );
    });

    await test("checkout consumes cart, reserves all stock and records wallet tender together", async () => {
      const f = await fixture();
      const order = await createReservedOrder(f.input);
      assert.equal(order.totalCents, 2100);
      assert.equal(order.walletPaidCents, 500);
      assert.equal((await db.product.findUniqueOrThrow({ where: { id: f.product.id } })).stock, 8);
      assert.equal(
        (await db.wallet.findUniqueOrThrow({ where: { id: f.wallet.id } })).balanceCents,
        4500,
      );
      assert.equal(await db.cartItem.count({ where: { cartId: f.cart.id } }), 0);
      assert.equal(
        await db.walletTransaction.count({
          where: { orderId: order.id, type: WalletTransactionTypes.ORDER_PAYMENT },
        }),
        1,
      );
    });

    await test("insufficient wallet rolls back order, stock and cart claims", async () => {
      const f = await fixture(10, 100);
      await assert.rejects(createReservedOrder(f.input), /INSUFFICIENT_WALLET/);
      assert.equal(await db.order.count({ where: { userId: f.user.id } }), 0);
      assert.equal((await db.product.findUniqueOrThrow({ where: { id: f.product.id } })).stock, 10);
      assert.equal(await db.cartItem.count({ where: { cartId: f.cart.id } }), 1);
      assert.equal(
        (await db.wallet.findUniqueOrThrow({ where: { id: f.wallet.id } })).balanceCents,
        100,
      );
    });

    await test("one unavailable line rejects the whole checkout", async () => {
      const f = await fixture();
      const unavailable = await db.product.create({
        data: {
          name: "Unavailable",
          slug: randomUUID(),
          priceCents: 1000,
          stock: 0,
          categoryId: f.product.categoryId,
        },
      });
      const line = await db.cartItem.create({
        data: { cartId: f.cart.id, productId: unavailable.id, quantity: 1 },
      });
      f.input.cart.items.push({ id: line.id, quantity: 1, selected: true, product: unavailable });
      await assert.rejects(createReservedOrder(f.input), /OUT_OF_STOCK/);
      assert.equal(await db.order.count({ where: { userId: f.user.id } }), 0);
      assert.equal(await db.cartItem.count({ where: { cartId: f.cart.id } }), 2);
      assert.equal((await db.product.findUniqueOrThrow({ where: { id: f.product.id } })).stock, 10);
    });

    await test("deactivated products and changed prices block checkout", async () => {
      for (const data of [{ active: false }, { priceCents: 1200 }]) {
        const f = await fixture();
        await db.product.update({ where: { id: f.product.id }, data });
        await assert.rejects(
          createReservedOrder(f.input),
          "priceCents" in data ? /CART_CHANGED/ : /OUT_OF_STOCK/,
        );
        assert.equal(await db.cartItem.count({ where: { cartId: f.cart.id } }), 1);
      }
    });

    await test("concurrent submission of one cart creates exactly one order", async () => {
      const f = await fixture();
      const results = await Promise.allSettled([
        createReservedOrder(f.input),
        createReservedOrder({ ...f.input, number: randomUUID() }),
      ]);
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
      assert.equal(await db.order.count({ where: { userId: f.user.id } }), 1);
      assert.equal((await db.product.findUniqueOrThrow({ where: { id: f.product.id } })).stock, 8);
      assert.equal(
        (await db.wallet.findUniqueOrThrow({ where: { id: f.wallet.id } })).balanceCents,
        4500,
      );
    });

    await test("two buyers competing for the last stock cannot oversell", async () => {
      const a = await fixture(2);
      const b = await fixture();
      await db.cartItem.update({
        where: { id: b.cart.items[0].id },
        data: { productId: a.product.id },
      });
      b.input.cart.items[0].product = a.product;
      const results = await Promise.allSettled([
        createReservedOrder(a.input),
        createReservedOrder(b.input),
      ]);
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
      assert.equal((await db.product.findUniqueOrThrow({ where: { id: a.product.id } })).stock, 0);
      assert.equal(await db.order.count({ where: { userId: { in: [a.user.id, b.user.id] } } }), 1);
    });

    await test("fully wallet-paid order can be cancelled and refunds its full tender", async () => {
      const f = await fixture();
      const order = await createReservedOrder({
        ...f.input,
        walletCents: 2100,
        paymentMethod: PaymentMethods.GATEWAY,
      });
      assert.equal(order.status, OrderStatuses.Paid);
      assert.ok(order.paidAt);
      assert.equal((await transitionOrder(order.id, OrderStatuses.Cancelled)).ok, true);
      assert.equal(
        (await db.wallet.findUniqueOrThrow({ where: { id: f.wallet.id } })).balanceCents,
        5000,
      );
    });

    await test("repeated and concurrent cancellations restore stock and refund wallet once", async () => {
      const f = await fixture();
      const order = await createReservedOrder(f.input);
      await Promise.all([
        transitionOrder(order.id, OrderStatuses.Cancelled),
        transitionOrder(order.id, OrderStatuses.Cancelled),
      ]);
      assert.equal((await transitionOrder(order.id, OrderStatuses.Cancelled)).ok, true);
      assert.equal((await db.product.findUniqueOrThrow({ where: { id: f.product.id } })).stock, 10);
      assert.equal(
        (await db.wallet.findUniqueOrThrow({ where: { id: f.wallet.id } })).balanceCents,
        5000,
      );
      assert.equal(
        await db.walletTransaction.count({
          where: { orderId: order.id, type: WalletTransactionTypes.REFUND },
        }),
        1,
      );
      assert.equal(
        (await db.order.findUniqueOrThrow({ where: { id: order.id } })).walletPaidCents,
        500,
      );
    });

    await test("a refund failure rolls back cancellation and stock restoration", async () => {
      const f = await fixture();
      const order = await createReservedOrder(f.input);
      await db.wallet.update({ where: { id: f.wallet.id }, data: { balanceCents: 2147483647 } });
      const result = await transitionOrder(order.id, OrderStatuses.Cancelled);
      assert.equal(result.ok, false);
      if (!result.ok) assert.match(result.error, /wallet balance/);
      assert.equal(
        (await db.order.findUniqueOrThrow({ where: { id: order.id } })).status,
        OrderStatuses.Pending,
      );
      assert.equal((await db.product.findUniqueOrThrow({ where: { id: f.product.id } })).stock, 8);
      assert.equal(
        await db.walletTransaction.count({
          where: { orderId: order.id, type: WalletTransactionTypes.REFUND },
        }),
        0,
      );
      assert.equal(
        await db.orderEvent.count({
          where: {
            orderId: order.id,
            type: { in: [OrderStatuses.Cancelled, OrderEventTypes.WalletRefunded] },
          },
        }),
        0,
      );
    });

    await test("dispatch requires active assignment; delivery requires assigned rider and COD acknowledgment", async () => {
      const f = await fixture();
      const order = await createReservedOrder(f.input);
      assert.equal((await transitionOrder(order.id, OrderStatuses.Shipped)).ok, false);
      const rider = await db.rider.create({
        data: { name: "Rider", phone: "01700000001", active: false },
      });
      assert.equal((await assignOrderDelivery(order.id, `rider:${rider.id}`)).ok, false);
      await db.rider.update({ where: { id: rider.id }, data: { active: true } });
      assert.equal((await assignOrderDelivery(order.id, `rider:${rider.id}`)).ok, true);
      assert.equal(
        (await transitionOrder(order.id, OrderStatuses.Paid, { riderId: rider.id })).ok,
        false,
      );
      assert.equal(
        (await transitionOrder(order.id, OrderStatuses.Shipped, { riderId: "wrong-rider" })).ok,
        false,
      );
      assert.equal(
        (await transitionOrder(order.id, OrderStatuses.Shipped, { riderId: rider.id })).ok,
        true,
      );
      assert.equal((await assignOrderDelivery(order.id, "")).ok, false);
      assert.equal(
        (await transitionOrder(order.id, OrderStatuses.Delivered, { riderId: rider.id })).ok,
        false,
      );
      assert.equal(
        (
          await transitionOrder(order.id, OrderStatuses.Delivered, {
            riderId: rider.id,
            cashCollected: true,
            actor: { id: f.user.id, name: "Test rider", role: Roles.Rider },
          })
        ).ok,
        true,
      );
      assert.ok((await db.order.findUniqueOrThrow({ where: { id: order.id } })).paidAt);
      assert.equal((await transitionOrder(order.id, OrderStatuses.Cancelled)).ok, false);
    });

    await test("gateway validation rejects wrong order, amount, currency, risk and COD", async () => {
      const f = await fixture();
      const order = await createReservedOrder({
        ...f.input,
        paymentMethod: PaymentMethods.GATEWAY,
      });
      const valid = {
        isValid: true,
        status: "VALID",
        tranId: order.number,
        amount: 16,
        currencyType: "BDT",
      };
      for (const patch of [
        { tranId: "other" },
        { amount: 1 },
        { currencyType: "USD" },
        { highRisk: true },
        { isValid: false },
      ]) {
        assert.equal(
          (await fulfillPaidOrder(order.id, { ...valid, ...patch }, "validation")).ok,
          false,
        );
      }
      assert.equal(
        (await db.order.findUniqueOrThrow({ where: { id: order.id } })).status,
        OrderStatuses.Pending,
      );
      assert.equal((await fulfillPaidOrder(order.id, valid, "validation")).ok, true);
      assert.equal((await fulfillPaidOrder(order.id, valid, "validation")).ok, true);
      assert.equal((await transitionOrder(order.id, OrderStatuses.Cancelled)).ok, false);
      const cod = await fixture();
      const codOrder = await createReservedOrder(cod.input);
      assert.equal(
        (
          await fulfillPaidOrder(
            codOrder.id,
            { ...valid, tranId: codOrder.number },
            "cod-validation",
          )
        ).ok,
        false,
      );
    });

    await test("payment and cancellation race preserves one outcome without double refund or stock restoration", async () => {
      const f = await fixture();
      const order = await createReservedOrder({
        ...f.input,
        paymentMethod: PaymentMethods.GATEWAY,
      });
      await Promise.all([
        fulfillPaidOrder(
          order.id,
          { isValid: true, status: "VALID", tranId: order.number, amount: 16, currencyType: "BDT" },
          randomUUID(),
        ),
        transitionOrder(order.id, OrderStatuses.Cancelled),
      ]);
      const fresh = await db.order.findUniqueOrThrow({ where: { id: order.id } });
      const cancelled = fresh.status === OrderStatuses.Cancelled;
      assert.ok(cancelled || fresh.status === OrderStatuses.Paid);
      assert.equal(
        (await db.product.findUniqueOrThrow({ where: { id: f.product.id } })).stock,
        cancelled ? 10 : 8,
      );
      assert.equal(
        (await db.wallet.findUniqueOrThrow({ where: { id: f.wallet.id } })).balanceCents,
        cancelled ? 5000 : 4500,
      );
    });

    await test("order audit records preserve actor identity and reject updates or deletions", async () => {
      const f = await fixture();
      const admin = await adminActor();
      const order = await createReservedOrder(f.input);
      assert.equal(
        (await transitionOrder(order.id, OrderStatuses.Cancelled, { actor: admin })).ok,
        true,
      );
      const event = await db.orderEvent.findFirstOrThrow({
        where: { orderId: order.id, type: OrderStatuses.Cancelled },
      });
      assert.equal(event.actorId, admin.id);
      assert.equal(event.actorName, admin.name);
      assert.equal(event.fromStatus, OrderStatuses.Pending);
      assert.equal(event.toStatus, OrderStatuses.Cancelled);
      await assert.rejects(
        db.orderEvent.update({ where: { id: event.id }, data: { message: "rewritten" } }),
      );
      await assert.rejects(db.orderEvent.delete({ where: { id: event.id } }));
      assert.equal(
        (await db.orderEvent.findUniqueOrThrow({ where: { id: event.id } })).message,
        event.message,
      );
    });

    await test("payment preserves recorded currency, rejects store currency changes and records success once", async () => {
      const f = await fixture();
      const order = await createReservedOrder({
        ...f.input,
        paymentMethod: PaymentMethods.GATEWAY,
      });
      assert.equal(order.currencyCode, "BDT");
      const settings = await db.storeSettings.create({
        data: { storeName: "Currency protected", currencyCode: "BDT", currencySymbol: "Tk" },
      });
      await assert.rejects(
        db.storeSettings.update({ where: { id: settings.id }, data: { currencyCode: "USD" } }),
      );
      await assert.rejects(
        db.order.update({ where: { id: order.id }, data: { currencyCode: "USD" } }),
      );
      const valid = {
        isValid: true,
        status: "VALID",
        tranId: order.number,
        amount: 16,
        currencyType: "BDT",
      };
      const results = await Promise.all([
        fulfillPaidOrder(order.id, valid, "same-payment"),
        fulfillPaidOrder(order.id, valid, "same-payment"),
      ]);
      assert.ok(results.every((result) => result.ok));
      assert.equal(
        await db.orderEvent.count({
          where: { orderId: order.id, type: OrderEventTypes.PaymentConfirmed },
        }),
        1,
      );
    });

    await test("legacy currency remains unknown until an authorized admin confirms evidence once", async () => {
      const f = await fixture();
      const order = await db.order.create({
        data: {
          number: randomUUID(),
          userId: f.user.id,
          subtotalCents: 2000,
          totalCents: 2100,
          shippingCents: 100,
          paymentMethod: PaymentMethods.GATEWAY,
          currencySource: OrderCurrencySources.Unrecorded,
          recipientName: "Legacy buyer",
          phone: "01700000000",
          line1: "Legacy street",
          city: "Dhaka",
        },
      });
      assert.equal(order.currencyCode, null);
      const valid = {
        isValid: true,
        status: "VALID",
        tranId: order.number,
        amount: 21,
        currencyType: "BDT",
      };
      assert.equal((await fulfillPaidOrder(order.id, valid, "legacy-validation")).ok, false);
      assert.equal((await fulfillPaidOrder(order.id, valid, "legacy-validation")).ok, false);
      assert.equal(
        await db.orderEvent.count({
          where: { orderId: order.id, type: OrderEventTypes.PaymentReviewRequired },
        }),
        1,
      );
      const customer = { id: f.user.id, name: f.user.name, role: Roles.Customer };
      assert.equal(
        (await confirmLegacyOrderCurrency(order.id, "BDT", "BDT ", "Invoice 123", customer)).ok,
        false,
      );
      const admin = await adminActor();
      assert.equal(
        (await confirmLegacyOrderCurrency(order.id, "BDT", "BDT ", "Original invoice 123", admin))
          .ok,
        true,
      );
      assert.equal(
        (await confirmLegacyOrderCurrency(order.id, "USD", "$", "Another invoice", admin)).ok,
        false,
      );
      assert.equal((await fulfillPaidOrder(order.id, valid, "legacy-validation")).ok, true);
      assert.equal(
        await db.orderEvent.count({
          where: { orderId: order.id, type: OrderEventTypes.CurrencyConfirmed },
        }),
        1,
      );
    });

    await test("historical currency source is explicit and immutable", async () => {
      const f = await fixture();
      const settings = await db.storeSettings.update({
        where: { singletonKey: 1 },
        data: { currencySymbol: "Tk " },
      });
      const legacy = await db.order.create({
        data: {
          number: randomUUID(),
          userId: f.user.id,
          subtotalCents: 2000,
          totalCents: 2100,
          shippingCents: 100,
          paymentMethod: PaymentMethods.COD,
          currencySource: OrderCurrencySources.Unrecorded,
          recipientName: "Legacy buyer",
          phone: "01700000000",
          line1: "Legacy street",
          city: "Dhaka",
        },
      });
      // Imported historical snapshot may legitimately predate this store currency.
      const recorded = await db.order.create({
        data: {
          number: randomUUID(),
          userId: f.user.id,
          subtotalCents: 2000,
          totalCents: 2100,
          shippingCents: 100,
          currencyCode: "USD",
          currencySymbol: "$",
          recipientName: "Historical buyer",
          phone: "01700000000",
          line1: "Historical street",
          city: "Dhaka",
        },
      });
      const assigned = await db.order.findUniqueOrThrow({ where: { id: legacy.id } });
      assert.equal(assigned.currencyCode, null);
      assert.equal(assigned.currencySource, OrderCurrencySources.Unrecorded);
      assert.equal(
        (await db.order.findUniqueOrThrow({ where: { id: recorded.id } })).currencySource,
        OrderCurrencySources.Snapshot,
      );
      await assert.rejects(
        db.order.update({
          where: { id: recorded.id },
          data: { currencySource: OrderCurrencySources.InferredFromSettings },
        }),
        /provenance cannot be changed/i,
      );
      await assert.rejects(
        db.storeSettings.update({
          where: { id: settings.id },
          data: { currencyCode: "EUR", currencySymbol: "EUR " },
        }),
      );
    });

    await test("COD records the actual cash remainder and preserves courier evidence", async () => {
      const f = await shippedCod();
      assert.equal(
        (
          await transitionOrder(f.order.id, OrderStatuses.Delivered, {
            riderId: f.rider.id,
            cashCollected: true,
          })
        ).ok,
        false,
      );
      assert.equal(
        (
          await transitionOrder(f.order.id, OrderStatuses.Delivered, {
            riderId: f.rider.id,
            cashCollected: true,
            actor: f.actor,
          })
        ).ok,
        true,
      );
      const collection = await db.codCollection.findUniqueOrThrow({
        where: { orderId: f.order.id },
      });
      assert.equal(collection.amountCents, 1600);
      assert.equal(collection.currencyCode, "BDT");
      assert.equal(collection.collectedById, f.actor.id);
      assert.equal(collection.courierName, "Accountable courier");
      assert.equal(collection.remittedAt, null);
      await assert.rejects(
        db.codCollection.update({ where: { id: collection.id }, data: { amountCents: 1 } }),
      );
      await assert.rejects(db.codCollection.delete({ where: { id: collection.id } }));
      assert.equal(
        await db.orderEvent.count({
          where: { orderId: f.order.id, type: OrderEventTypes.CodCollected },
        }),
        1,
      );
    });

    await test("COD remittance is admin-only and concurrent receipt confirmation records once", async () => {
      const f = await shippedCod();
      await transitionOrder(f.order.id, OrderStatuses.Delivered, {
        riderId: f.rider.id,
        cashCollected: true,
        actor: f.actor,
      });
      assert.equal((await remitCodCollection(f.order.id, "DEPOSIT-123", f.actor)).ok, false);
      assert.equal(
        (await remitCodCollection(f.order.id, "DEPOSIT-123", { ...f.actor, role: Roles.Admin })).ok,
        false,
      );
      const admin = await adminActor();
      assert.equal((await remitCodCollection(f.order.id, "", admin)).ok, false);
      const results = await Promise.all([
        remitCodCollection(f.order.id, "DEPOSIT-123", admin),
        remitCodCollection(f.order.id, "DEPOSIT-123", admin),
      ]);
      assert.ok(results.every((result) => result.ok));
      const collection = await db.codCollection.findUniqueOrThrow({
        where: { orderId: f.order.id },
      });
      assert.equal(collection.remittedById, admin.id);
      assert.equal(collection.remittanceReference, "DEPOSIT-123");
      assert.ok(collection.remittedAt);
      assert.equal(
        await db.orderEvent.count({
          where: { orderId: f.order.id, type: OrderEventTypes.CodRemitted },
        }),
        1,
      );
      assert.equal((await remitCodCollection(f.order.id, "different-reference", admin)).ok, false);
      await assert.rejects(
        db.codCollection.update({
          where: { id: collection.id },
          data: { remittanceReference: "rewritten" },
        }),
      );
    });

    await test("failure to persist COD audit rolls back delivery and collection together", async () => {
      const f = await shippedCod();
      await db.$executeRawUnsafe(
        `CREATE FUNCTION reject_test_cod_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."type" = 'COD_COLLECTED' THEN RAISE EXCEPTION 'test audit failure'; END IF; RETURN NEW; END; $$`,
      );
      await db.$executeRawUnsafe(
        `CREATE TRIGGER reject_test_cod_event BEFORE INSERT ON "OrderEvent" FOR EACH ROW EXECUTE FUNCTION reject_test_cod_event()`,
      );
      try {
        await assert.rejects(
          transitionOrder(f.order.id, OrderStatuses.Delivered, {
            riderId: f.rider.id,
            cashCollected: true,
            actor: f.actor,
          }),
        );
        assert.equal(
          (await db.order.findUniqueOrThrow({ where: { id: f.order.id } })).status,
          OrderStatuses.Shipped,
        );
        assert.equal(await db.codCollection.count({ where: { orderId: f.order.id } }), 0);
        assert.equal(
          await db.orderEvent.count({
            where: { orderId: f.order.id, type: OrderStatuses.Delivered },
          }),
          0,
        );
      } finally {
        await db.$executeRawUnsafe(`DROP TRIGGER reject_test_cod_event ON "OrderEvent"`);
        await db.$executeRawUnsafe(`DROP FUNCTION reject_test_cod_event()`);
      }
    });

    await test("legacy delivery without collection evidence cannot be marked remitted", async () => {
      const f = await fixture();
      const order = await db.order.create({
        data: {
          number: randomUUID(),
          userId: f.user.id,
          status: OrderStatuses.Delivered,
          paymentMethod: PaymentMethods.COD,
          currencyCode: "BDT",
          currencySymbol: "Tk",
          subtotalCents: 2000,
          totalCents: 2100,
          recipientName: "Legacy",
          phone: "01700000000",
          line1: "Legacy road",
          city: "Dhaka",
        },
      });
      assert.equal(
        (await remitCodCollection(order.id, "some-receipt", await adminActor())).ok,
        false,
      );
      assert.equal(await db.codCollection.count({ where: { orderId: order.id } }), 0);
    });

    await test("wallet-only COD delivery creates no cash collection or remittance", async () => {
      const f = await fixture();
      const order = await createReservedOrder({ ...f.input, walletCents: 2100 });
      const rider = await db.rider.create({
        data: { name: "Wallet courier", phone: "01700000001" },
      });
      await assignOrderDelivery(order.id, `rider:${rider.id}`);
      assert.equal((await transitionOrder(order.id, OrderStatuses.Shipped)).ok, true);
      assert.equal((await transitionOrder(order.id, OrderStatuses.Delivered)).ok, true);
      assert.equal(await db.codCollection.count({ where: { orderId: order.id } }), 0);
      assert.equal((await remitCodCollection(order.id, "not-cash", await adminActor())).ok, false);
    });

    await test("historical dispatch without courier assignment cannot create cash evidence", async () => {
      const f = await fixture();
      const order = await createReservedOrder(f.input);
      await db.order.update({ where: { id: order.id }, data: { status: OrderStatuses.Shipped } });
      const result = await transitionOrder(order.id, OrderStatuses.Delivered, {
        cashCollected: true,
        actor: await adminActor(),
      });
      assert.equal(result.ok, false);
      assert.equal(
        (await db.order.findUniqueOrThrow({ where: { id: order.id } })).status,
        OrderStatuses.Shipped,
      );
      assert.equal(await db.codCollection.count({ where: { orderId: order.id } }), 0);
    });

    await test("SSLCommerz adapter reads documented original currency fields and does not cache validation", async () => {
      const originalFetch = globalThis.fetch;
      const originalId = process.env.SSLCOMMERZ_STORE_ID;
      const originalPassword = process.env.SSLCOMMERZ_STORE_PASSWORD;
      process.env.SSLCOMMERZ_STORE_ID = "test";
      process.env.SSLCOMMERZ_STORE_PASSWORD = "test";
      globalThis.fetch = async (input, options) => {
        const requestUrl = new URL(String(input));
        assert.equal(requestUrl.pathname, "/validator/api/validationserverAPI.php");
        assert.equal(requestUrl.searchParams.get("val_id"), "test-validation");
        assert.equal(options?.cache, "no-store");
        return Response.json({
          status: "VALID",
          tran_id: "order",
          amount: "1800.00",
          currency: "BDT",
          currency_amount: "16.00",
          currency_type: "USD",
          risk_level: "0",
        });
      };
      try {
        const result = await validateSslcommerzPayment("test-validation");
        assert.equal(result?.amount, 16);
        assert.equal(result?.currencyType, "USD");
        assert.equal(result?.highRisk, false);
      } finally {
        globalThis.fetch = originalFetch;
        if (originalId === undefined) delete process.env.SSLCOMMERZ_STORE_ID;
        else process.env.SSLCOMMERZ_STORE_ID = originalId;
        if (originalPassword === undefined) delete process.env.SSLCOMMERZ_STORE_PASSWORD;
        else process.env.SSLCOMMERZ_STORE_PASSWORD = originalPassword;
      }
    });
  } finally {
    await testDb?.$disconnect();
    // This identifier is generated above, never supplied by the caller.
    await admin.$executeRawUnsafe(`DROP DATABASE "${databaseName}"`);
    await admin.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Order integration tests failed");
  process.exitCode = 1;
});
