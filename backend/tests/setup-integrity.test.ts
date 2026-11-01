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
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    throw new Error("Setup tests require local PostgreSQL");
  const databaseName = `test_setup_${randomUUID().replaceAll("-", "")}`;
  const admin = createPrismaClient();
  await admin.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`);
  url.pathname = `/${databaseName}`;
  url.searchParams.set("schema", "public");
  process.env.DATABASE_URL = url.toString();
  const previousSecret = process.env.LICENSE_SECRET;
  process.env.LICENSE_SECRET = "isolated-setup-test-secret";
  let testDb: PrismaClient | undefined;
  try {
    execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], {
      env: process.env,
      stdio: "pipe",
      timeout: 60_000,
    });
    const { db } = await import("../lib/db");
    testDb = db;
    const { performSetup } = await import("../lib/setup");
    const { generateLicenseKey, hashLicenseKey } = await import("../lib/license");
    const input = async (suffix: string) => ({
      licenseKey: (await generateLicenseKey({ slug: suffix })).key,
      adminName: "Setup Owner",
      email: `${suffix}@example.test`,
      password: "test-password-123",
      storeName: "Setup Test Store",
      currencySymbol: "Tk",
      currencyCode: "BDT",
    });
    await test("production default administrator seeding refuses before any database access", async () => {
      const { seedAdmin } = await import("../lib/seed-data");
      const previous = process.env.NODE_ENV;
      try {
        Object.assign(process.env, { NODE_ENV: "production" });
        await assert.rejects(seedAdmin({} as PrismaClient), /disabled in production/);
      } finally {
        if (previous === undefined) Reflect.deleteProperty(process.env, "NODE_ENV");
        else Object.assign(process.env, { NODE_ENV: previous });
      }
    });
    await test("an already-used license is rejected without creating an owner or completing setup", async () => {
      const data = await input("used-key");
      await db.license.create({ data: { keyHash: await hashLicenseKey(data.licenseKey) } });
      const result = await performSetup(data);
      assert.deepEqual(result, { ok: false, error: "This license key has already been used." });
      assert.equal(await db.user.count(), 0);
      assert.equal(await db.storeSettings.count(), 0);
    });
    await test("existing owner email is rejected without partial license or settings writes", async () => {
      const data = await input("existing-email");
      const user = await db.user.create({
        data: { email: data.email, name: "Existing", passwordHash: "fixture" },
      });
      assert.equal((await performSetup(data)).ok, false);
      assert.equal(
        await db.license.count({ where: { keyHash: await hashLicenseKey(data.licenseKey) } }),
        0,
      );
      assert.equal(await db.storeSettings.count(), 0);
      await db.user.delete({ where: { id: user.id } });
    });
    await test("concurrent distinct-key setup creates exactly one owner and preserves the existing settings identity", async () => {
      const draft = await db.storeSettings.create({
        data: { storeName: "Draft", logoUrl: "/existing-logo.png" },
      });
      const a = await input("owner-a"),
        b = await input("owner-b");
      const results = await Promise.all([performSetup(a), performSetup(b)]);
      assert.equal(results.filter((result) => result.ok).length, 1);
      assert.equal(await db.user.count(), 1);
      assert.equal(await db.storeSettings.count(), 1);
      const settings = await db.storeSettings.findUniqueOrThrow({ where: { id: draft.id } });
      assert.ok(settings.setupCompletedAt);
      assert.equal(settings.logoUrl, draft.logoUrl);
      assert.equal(
        await db.license.count({
          where: {
            keyHash: {
              in: [await hashLicenseKey(a.licenseKey), await hashLicenseKey(b.licenseKey)],
            },
          },
        }),
        1,
      );
      assert.equal((await performSetup(await input("later-owner"))).ok, false);
      assert.equal(await db.user.count(), 1);
    });
    await test("database singleton constraints reject both extra settings and alternative singleton keys", async () => {
      await assert.rejects(db.storeSettings.create({ data: { storeName: "Duplicate" } }));
      await assert.rejects(
        db.storeSettings.create({ data: { storeName: "Alternative", singletonKey: 2 } }),
      );
      assert.equal(await db.storeSettings.count(), 1);
    });
  } finally {
    if (previousSecret === undefined) delete process.env.LICENSE_SECRET;
    else process.env.LICENSE_SECRET = previousSecret;
    await testDb?.$disconnect();
    await admin.$executeRawUnsafe(`DROP DATABASE "${databaseName}"`);
    await admin.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
