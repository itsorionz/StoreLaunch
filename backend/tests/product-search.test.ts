import { config } from "dotenv";
import { createPrismaClient } from "../lib/prisma-client";
import { PrismaClient } from "@backend/generated/prisma/client";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { test } from "node:test";
import { OrderStatuses, OrderEventTypes, ReviewStatuses, Roles } from "../lib/enums.mjs";

config({ quiet: true });
async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  assert.ok(
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname),
    "Local PostgreSQL required",
  );
  const name = `test_search_${randomUUID().replaceAll("-", "")}`;
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
    const { searchProducts } = await import("../lib/catalog");
    const root = await db.category.create({ data: { name: "Health", slug: "health" } });
    const child = await db.category.create({
      data: { name: "Medicine", slug: "medicine", parentId: root.id },
    });
    const leaf = await db.category.create({
      data: { name: "Pain Care", slug: "pain-care", parentId: child.id },
    });
    const brand = await db.brand.create({ data: { name: "Acme Labs", slug: "acme" } });
    const pain = await db.product.create({
      data: {
        name: "Pain Relief 500",
        slug: "pain-relief",
        description: "Headache and fever",
        categoryId: leaf.id,
        brandId: brand.id,
        priceCents: 500,
        salePriceCents: 80,
        stock: 5,
      },
    });
    const vitamin = await db.product.create({
      data: {
        name: "Vitamin",
        slug: "vitamin",
        description: "পুষ্টি",
        categoryId: root.id,
        brandId: brand.id,
        priceCents: 100,
        stock: 4,
      },
    });
    await db.product.create({
      data: {
        name: "Pain Relief Hidden",
        slug: "hidden",
        categoryId: leaf.id,
        brandId: brand.id,
        priceCents: 100,
        active: false,
      },
    });
    await db.product.create({
      data: { name: "100%_Pure", slug: "pure", categoryId: root.id, priceCents: 600 },
    });
    await test("search matches product, brand, category, description and Bengali text", async () => {
      for (const [q, ids] of [
        ["ACME", [pain.id, vitamin.id]],
        ["  pain   acme  ", [pain.id]],
        ["fever", [pain.id]],
        ["পুষ্টি", [vitamin.id]],
        ["pain-care", [pain.id]],
      ] as const) {
        const result = await searchProducts({ q });
        assert.deepEqual(result.products.map((product) => product.id).sort(), [...ids].sort());
      }
      assert.equal((await searchProducts({ q: "nothing-matches" })).total, 0);
      assert.equal((await searchProducts({ q: "hidden" })).total, 0);
      assert.equal((await searchProducts({ q: " " })).total, 3);
    });
    await test("wildcards are literal and combined brand/category filters include descendants", async () => {
      assert.equal((await searchProducts({ q: "%_" })).total, 1);
      assert.equal((await searchProducts({ category: "health", brand: "acme" })).total, 2);
      assert.equal((await searchProducts({ q: "pain", brand: "nonexistent" })).total, 0);
    });
    await test("price sorting uses the displayed price and invalid pages clamp to the final page", async () => {
      const sorted = await searchProducts({ brand: "acme", sort: "price-asc" });
      assert.deepEqual(
        sorted.products.map((product) => product.id),
        [pain.id, vitamin.id],
      );
      const page = await searchProducts({ brand: "acme", perPage: 1, page: 999 });
      assert.equal(page.page, 2);
      assert.equal(page.products.length, 1);
      assert.equal((await searchProducts({ onSale: true })).total, 1);
    });
    await test("discount sorting returns results beyond the former 500-row cap", async () => {
      await db.product.createMany({
        data: Array.from({ length: 505 }, (_, i) => ({
          name: `Bulk ${i}`,
          slug: `bulk-${i}`,
          categoryId: root.id,
          priceCents: 1000,
          salePriceCents: 900,
        })),
      });
      const result = await searchProducts({ q: "bulk", sort: "discount", page: 22, perPage: 24 });
      assert.equal(result.total, 505);
      assert.equal(result.page, 22);
      assert.equal(result.products.length, 1);
    });
    await test("application status enums use PascalCase while existing database values remain mapped", () => {
      for (const value of [
        ...Object.values(OrderStatuses),
        ...Object.values(OrderEventTypes),
        ...Object.values(ReviewStatuses),
      ])
        assert.match(value, /^[A-Z][a-zA-Z0-9]*$/);
    });
    await test("admin search spans records; rider and customer order searches remain scoped", async () => {
      const { searchAdmin, searchRider } = await import("../lib/app-search");
      const { orderTextWhere, appSearchSchema } = await import("../lib/search-filters");
      const buyer = await db.user.create({
        data: {
          email: "search-buyer@search.invalid",
          name: "Search buyer",
          passwordHash: "unused",
        },
      });
      const other = await db.user.create({
        data: {
          email: "search-other@search.invalid",
          name: "Search other",
          passwordHash: "unused",
          roles: [Roles.Customer, Roles.Rider],
        },
      });
      const ownRider = await db.rider.create({
        data: { userId: buyer.id, name: "Search Rider", phone: "8801700000001" },
      });
      const foreignRider = await db.rider.create({
        data: { userId: other.id, name: "Other rider", phone: "8801700000002" },
      });
      const orderData = {
        recipientName: "Search customer",
        phone: "8801700000000",
        line1: "Search road",
        city: "Dhaka",
        totalCents: 100,
        subtotalCents: 100,
        currencyCode: "BDT",
        currencySymbol: "Tk",
      };
      const own = await db.order.create({
        data: { ...orderData, number: "SEARCH-OWN", userId: buyer.id, riderId: ownRider.id },
      });
      await db.order.create({
        data: {
          ...orderData,
          number: "SEARCH-FOREIGN",
          userId: other.id,
          riderId: foreignRider.id,
        },
      });
      const riderResult = await searchRider(ownRider.id, "search");
      assert.deepEqual(
        riderResult[0].rows.map((row) => row.id),
        [own.number],
      );
      assert.equal(
        await db.order.count({ where: { userId: buyer.id, ...orderTextWhere("FOREIGN") } }),
        0,
      );
      const adminResult = await searchAdmin("Acme");
      assert.equal(adminResult.find((group) => group.kind === "brands")?.rows.length, 1);
      assert.equal(adminResult.find((group) => group.kind === "products")?.rows.length, 3);
      assert.equal(appSearchSchema.safeParse({ q: "x".repeat(201) }).success, false);
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
