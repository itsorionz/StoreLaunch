import {
  InboxCategories,
  OrderCurrencySources,
  OrderEventTypes,
  OrderStatuses,
} from "@backend/lib/enums.mjs";
import { config } from "dotenv";
import { createPrismaClient } from "../lib/prisma-client";
import { PrismaClient } from "@backend/generated/prisma/client";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { test } from "node:test";

config({ quiet: true });
async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  assert.ok(
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname),
    "Local PostgreSQL required",
  );
  const name = `test_inbox_${randomUUID().replaceAll("-", "")}`;
  const admin = createPrismaClient();
  await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
  url.pathname = `/${name}`;
  process.env.DATABASE_URL = url.toString();
  let store: PrismaClient | undefined;
  try {
    execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], {
      env: process.env,
      stdio: "pipe",
    });
    const db = (await import("../lib/db")).db;
    store = db;
    const {
      getInbox,
      getInboxUnreadCount,
      markInboxCategoryRead,
      setInboxRead,
      syncInboxPromotions,
    } = await import("../lib/inbox");
    const user = () =>
      db.user.create({
        data: {
          email: `${randomUUID()}@inbox.invalid`,
          name: "Inbox Test",
          passwordHash: "unused",
        },
      });
    await test("promotions are delivered once, preserve read state and exclude inactive campaigns", async () => {
      const a = await user();
      await db.campaign.create({
        data: { title: "Active offer", imageUrl: "/offer.png", linkUrl: "/products", active: true },
      });
      await db.campaign.create({
        data: { title: "Draft offer", imageUrl: "/draft.png", linkUrl: "/products", active: false },
      });
      await Promise.all([syncInboxPromotions(a.id), syncInboxPromotions(a.id)]);
      const inbox = await getInbox(a.id, InboxCategories.PROMOTION);
      assert.equal(inbox.total, 1);
      assert.equal(inbox.promotionUnread, 1);
      await setInboxRead(a.id, inbox.messages[0].id, true);
      await syncInboxPromotions(a.id);
      assert.equal(await getInboxUnreadCount(a.id), 0);
      assert.equal(await db.inboxMessage.count({ where: { userId: a.id } }), 1);
    });
    await test("single and bulk read changes are scoped to the owner and category", async () => {
      const a = await user(),
        b = await user();
      const first = await db.inboxMessage.create({
        data: {
          userId: a.id,
          category: InboxCategories.NOTIFICATION,
          title: "Private update",
          body: "Private",
          sourceKey: "one",
        },
      });
      const foreign = await db.inboxMessage.create({
        data: {
          userId: b.id,
          category: InboxCategories.NOTIFICATION,
          title: "Another account",
          body: "Private",
          sourceKey: "one",
        },
      });
      assert.equal((await setInboxRead(a.id, foreign.id, true)).count, 0);
      await getInbox(a.id, InboxCategories.PROMOTION);
      await markInboxCategoryRead(a.id, InboxCategories.PROMOTION);
      assert.equal(
        (await db.inboxMessage.findUniqueOrThrow({ where: { id: first.id } })).readAt,
        null,
      );
      await setInboxRead(a.id, first.id, true);
      assert.ok((await db.inboxMessage.findUniqueOrThrow({ where: { id: first.id } })).readAt);
      await setInboxRead(a.id, first.id, false);
      assert.equal(
        (await db.inboxMessage.findUniqueOrThrow({ where: { id: first.id } })).readAt,
        null,
      );
      await markInboxCategoryRead(a.id, InboxCategories.NOTIFICATION);
      assert.equal((await getInbox(a.id, InboxCategories.NOTIFICATION, true)).total, 0);
      assert.equal(
        (await db.inboxMessage.findUniqueOrThrow({ where: { id: foreign.id } })).readAt,
        null,
      );
    });
    await test("inbox pages are bounded, owner-only and clamp invalid page ranges", async () => {
      const a = await user();
      await db.inboxMessage.createMany({
        data: Array.from({ length: 25 }, (_, i) => ({
          userId: a.id,
          category: InboxCategories.NOTIFICATION,
          title: `Update ${i}`,
          body: "Body",
          sourceKey: String(i),
        })),
      });
      const page = await getInbox(a.id, InboxCategories.NOTIFICATION);
      assert.equal(page.total, 25);
      assert.equal(page.messages.length, 20);
      assert.equal(page.pages, 2);
      const last = await getInbox(a.id, InboxCategories.NOTIFICATION, false, 999999);
      assert.equal(last.page, 2);
      assert.equal(last.messages.length, 5);
      assert.ok(last.messages.every((message) => message.userId === a.id));
    });
    await test("order events create one public message atomically and hide internal audit details", async () => {
      const a = await user();
      const order = await db.order.create({
        data: {
          userId: a.id,
          number: randomUUID(),
          subtotalCents: 100,
          totalCents: 100,
          currencySource: OrderCurrencySources.Unrecorded,
          recipientName: a.name,
          phone: "01700000000",
          line1: "Road",
          city: "Dhaka",
        },
      });
      const { recordOrderEvent } = await import("../lib/order-events");
      const event = {
        orderId: order.id,
        type: OrderEventTypes.Placed,
        message: "Internal audit details should stay private",
      };
      await db.$transaction(async (tx) => {
        await recordOrderEvent(tx, event);
        await recordOrderEvent(tx, event);
      });
      const messages = await db.inboxMessage.findMany({ where: { userId: a.id } });
      assert.equal(messages.length, 1);
      assert.ok(!messages[0].body.includes("Internal"));
      await assert.rejects(
        db.$transaction(async (tx) => {
          await recordOrderEvent(tx, { ...event, type: OrderStatuses.Shipped });
          throw new Error("Rollback");
        }),
      );
      assert.equal(await db.inboxMessage.count({ where: { userId: a.id } }), 1);
      await db.$transaction((tx) =>
        recordOrderEvent(tx, { ...event, type: OrderEventTypes.DeliveryAssigned }),
      );
      assert.equal(await db.inboxMessage.count({ where: { userId: a.id } }), 1);
    });
    await test("PascalCase migration preserves read timestamps and message deduplication", async () => {
      const a = await user();
      const order = await db.order.create({
        data: {
          userId: a.id,
          number: randomUUID(),
          subtotalCents: 100,
          totalCents: 100,
          currencySource: OrderCurrencySources.Unrecorded,
          recipientName: a.name,
          phone: "01700000000",
          line1: "Road",
          city: "Dhaka",
        },
      });
      const readAt = new Date("2026-10-21T10:00:00Z");
      const old = await db.inboxMessage.create({
        data: {
          userId: a.id,
          category: InboxCategories.NOTIFICATION,
          title: "Order placed",
          body: "Existing notification",
          sourceKey: `order:${order.id}:placed`,
          readAt,
        },
      });
      const migration = readFileSync(
        "backend/prisma/migrations/20261022000000_pascal_case_inbox_keys/migration.sql",
        "utf8",
      );
      await db.$executeRawUnsafe(migration);
      await db.$executeRawUnsafe(migration);
      const migrated = await db.inboxMessage.findUniqueOrThrow({ where: { id: old.id } });
      assert.equal(migrated.sourceKey, `order:${order.id}:${OrderEventTypes.Placed}`);
      assert.deepEqual(migrated.readAt, readAt);
      const { recordOrderEvent } = await import("../lib/order-events");
      await db.$transaction((tx) =>
        recordOrderEvent(tx, {
          orderId: order.id,
          type: OrderEventTypes.Placed,
          message: "Retry notification",
        }),
      );
      assert.equal(await db.inboxMessage.count({ where: { userId: a.id } }), 1);
    });
    await test("back-in-stock creates one in-app message even when SMS is disabled", async () => {
      process.env.SMS_PROVIDER = "disabled";
      const a = await user();
      const product = await db.product.create({
        data: {
          name: "Returned Product",
          slug: randomUUID(),
          priceCents: 100,
          stock: 2,
          category: { create: { name: "Inbox Products", slug: randomUUID() } },
        },
      });
      await db.stockNotification.create({ data: { userId: a.id, productId: product.id } });
      const { notifyBackInStock } = await import("../lib/notify");
      await notifyBackInStock(product.id);
      await notifyBackInStock(product.id);
      assert.equal(
        await db.inboxMessage.count({
          where: { userId: a.id, category: InboxCategories.NOTIFICATION },
        }),
        1,
      );
    });
  } finally {
    await store?.$disconnect();
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}"`);
    await admin.$disconnect();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
