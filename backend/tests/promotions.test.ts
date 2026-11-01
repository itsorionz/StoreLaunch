import { config } from "dotenv";
import { createPrismaClient } from "../lib/prisma-client";
import { PrismaClient } from "@backend/generated/prisma/client";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { test } from "node:test";
import { Roles, InboxCategories, PromotionStatuses, PromotionAudiences } from "../lib/enums.mjs";

config({ quiet: true });
async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname), "Local database required");
  const name = `test_promotions_${randomUUID().replaceAll("-", "")}`;
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
    const { savePromotionDraft, sendPromotionToCustomers } = await import("../lib/promotions");
    const { setInboxRead, getInbox } = await import("../lib/inbox");
    const admin = await db.user.create({
      data: {
        name: "Promotion admin",
        email: "admin@promotion.invalid",
        passwordHash: "unused",
        roles: [Roles.Admin],
      },
    });
    const buyer = await db.user.create({
      data: {
        name: "Customer",
        email: "buyer@promotion.invalid",
        passwordHash: "unused",
        roles: [Roles.Customer],
      },
    });
    const other = await db.user.create({
      data: {
        name: "Other customer",
        email: "other@promotion.invalid",
        passwordHash: "unused",
        roles: [Roles.Customer],
      },
    });
    const inactive = await db.user.create({
      data: {
        name: "Inactive",
        email: "inactive@promotion.invalid",
        passwordHash: "unused",
        active: false,
        roles: [Roles.Customer],
      },
    });
    await db.user.create({
      data: {
        name: "Rider only",
        email: "rider@promotion.invalid",
        passwordHash: "unused",
        roles: [Roles.Rider],
      },
    });
    const input = {
      title: "Weekend offer",
      body: "Save on selected products this weekend.",
      href: "/offers",
      audience: PromotionAudiences.SelectedCustomers,
      selectedUserIds: [buyer.id],
    };
    async function draft(overrides = {}) {
      const result = await savePromotionDraft(admin.id, { ...input, ...overrides });
      assert.equal(result.ok, true);
      assert.ok(result.id);
      return result.id;
    }
    await test("drafts validate fields and active recipients without delivering messages", async () => {
      const invalid = await savePromotionDraft(admin.id, {
        ...input,
        title: "",
        body: "",
        href: "javascript:alert(1)",
      });
      assert.equal(invalid.ok, false);
      assert.ok(invalid.fieldErrors?.title);
      assert.ok(invalid.fieldErrors?.body);
      assert.ok(invalid.fieldErrors?.href);
      assert.equal(
        (await savePromotionDraft(admin.id, { ...input, selectedUserIds: [] })).ok,
        false,
      );
      assert.equal(
        (await savePromotionDraft(admin.id, { ...input, selectedUserIds: [inactive.id] })).ok,
        false,
      );
      assert.equal(
        (await savePromotionDraft(admin.id, { ...input, selectedUserIds: [admin.id] })).ok,
        false,
      );
      const id = await draft();
      assert.equal(
        (await db.promotion.findUniqueOrThrow({ where: { id } })).status,
        PromotionStatuses.Draft,
      );
      assert.equal(await db.inboxMessage.count(), 0);
    });
    await test("only active administrators can save or send promotions", async () => {
      assert.equal((await savePromotionDraft(buyer.id, input)).ok, false);
      const id = await draft();
      assert.equal((await sendPromotionToCustomers(buyer.id, id)).ok, false);
      await db.user.update({ where: { id: admin.id }, data: { active: false } });
      assert.equal((await sendPromotionToCustomers(admin.id, id)).ok, false);
      await db.user.update({ where: { id: admin.id }, data: { active: true } });
    });
    await test("selected promotions deliver once, preserve read state and cannot be edited after sending", async () => {
      const id = await draft();
      const results = await Promise.all([
        sendPromotionToCustomers(admin.id, id),
        sendPromotionToCustomers(admin.id, id),
      ]);
      assert.ok(results.every((result) => result.ok));
      const messages = await db.inboxMessage.findMany({ where: { promotionId: id } });
      assert.equal(messages.length, 1);
      assert.equal(messages[0].userId, buyer.id);
      assert.equal(messages[0].category, InboxCategories.PROMOTION);
      assert.equal(messages[0].body, input.body);
      assert.equal(messages[0].href, "/offers");
      assert.equal(
        (await getInbox(other.id, InboxCategories.PROMOTION)).messages.some(
          (message) => message.promotionId === id,
        ),
        false,
      );
      await setInboxRead(buyer.id, messages[0].id, true);
      assert.equal((await sendPromotionToCustomers(admin.id, id)).ok, true);
      assert.ok(
        (await db.inboxMessage.findUniqueOrThrow({ where: { id: messages[0].id } })).readAt,
      );
      assert.equal(
        (await savePromotionDraft(admin.id, { ...input, id, title: "Changed" })).ok,
        false,
      );
      const sent = await db.promotion.findUniqueOrThrow({ where: { id } });
      assert.equal(sent.status, PromotionStatuses.Sent);
      assert.equal(sent.recipientCount, 1);
      assert.equal(sent.sentById, admin.id);
      assert.ok(sent.sentAt);
    });
    await test("all-customer audiences use active customer membership at send time only", async () => {
      const id = await draft({ audience: PromotionAudiences.AllCustomers });
      const before = await db.user.create({
        data: {
          name: "New customer",
          email: "new@promotion.invalid",
          passwordHash: "unused",
          roles: [Roles.Customer, Roles.Rider],
        },
      });
      const result = await sendPromotionToCustomers(admin.id, id);
      assert.equal(result.count, 3);
      const ids = (
        await db.inboxMessage.findMany({ where: { promotionId: id }, select: { userId: true } })
      )
        .map((message) => message.userId)
        .sort();
      assert.deepEqual(ids, [buyer.id, other.id, before.id].sort());
      const later = await db.user.create({
        data: {
          name: "Later",
          email: "later@promotion.invalid",
          passwordHash: "unused",
          roles: [Roles.Customer],
        },
      });
      assert.equal(
        (await getInbox(later.id, InboxCategories.PROMOTION)).messages.some(
          (message) => message.promotionId === id,
        ),
        false,
      );
    });
    await test("unavailable selected recipients and inactive linked campaigns block delivery", async () => {
      const id = await draft();
      await db.user.update({ where: { id: buyer.id }, data: { active: false } });
      assert.equal((await sendPromotionToCustomers(admin.id, id)).ok, false);
      assert.equal(await db.inboxMessage.count({ where: { promotionId: id } }), 0);
      await db.user.update({ where: { id: buyer.id }, data: { active: true } });
      const campaign = await db.campaign.create({
        data: { title: "Draft campaign", imageUrl: "/banner.svg", linkUrl: "", active: false },
      });
      const linkedId = await draft({ campaignId: campaign.id });
      assert.equal((await sendPromotionToCustomers(admin.id, linkedId)).ok, false);
      await db.campaign.update({ where: { id: campaign.id }, data: { active: true } });
      assert.equal((await sendPromotionToCustomers(admin.id, linkedId)).ok, true);
      assert.equal(
        (await db.inboxMessage.findFirstOrThrow({ where: { promotionId: linkedId } })).href,
        `/products?campaign=${campaign.id}`,
      );
    });
    await test("failed inbox writes roll back broadcast delivery and sent status together", async () => {
      const id = await draft({ selectedUserIds: [buyer.id, other.id] });
      await db.inboxMessage.create({
        data: {
          userId: other.id,
          promotionId: id,
          category: InboxCategories.PROMOTION,
          title: "Conflict",
          body: "Existing",
          sourceKey: `promotion:${id}`,
        },
      });
      await assert.rejects(sendPromotionToCustomers(admin.id, id));
      assert.equal(await db.inboxMessage.count({ where: { promotionId: id } }), 1);
      const promotion = await db.promotion.findUniqueOrThrow({ where: { id } });
      assert.equal(promotion.status, PromotionStatuses.Draft);
      assert.equal(promotion.sentAt, null);
      assert.equal(promotion.recipientCount, 0);
    });
  } finally {
    await store?.$disconnect();
    await adminDb.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}"`);
    await adminDb.$disconnect();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
