import {
  AccountStatusTargets,
  EntityStatuses,
  OrderStatuses,
  Roles,
  normalizeRole,
} from "@backend/lib/enums.mjs";
import { config } from "dotenv";
import { createPrismaClient } from "../lib/prisma-client";
import { ContactChannel, PrismaClient, type Role } from "@backend/generated/prisma/client";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import assert from "node:assert/strict";
import { test } from "node:test";

config({ quiet: true });

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    throw new Error("Auth tests require a local PostgreSQL database");
  const databaseName = `test_login_${randomUUID().replaceAll("-", "")}`;
  const admin = createPrismaClient();
  await admin.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`);
  url.pathname = `/${databaseName}`;
  url.searchParams.set("schema", "public");
  process.env.DATABASE_URL = url.toString();
  let testDb: PrismaClient | undefined;
  const originalFetch = globalThis.fetch;
  const smsKeys = [
    "SMS_PROVIDER",
    "SMS_API_KEY",
    "SMS_CLIENT_ID",
    "SMS_SENDER_ID",
    "SMS_API_URL",
  ] as const;
  const previous = Object.fromEntries(smsKeys.map((key) => [key, process.env[key]]));
  try {
    execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], {
      env: process.env,
      stdio: "pipe",
      timeout: 60_000,
    });
    const { db } = await import("../lib/db");
    testDb = db;
    const {
      prepareEmailLogin,
      preparePhoneLogin,
      consumeLoginProof,
      pendingLoginProof,
      abandonLoginProof,
    } = await import("../lib/login");
    const { createPhoneOtp, canonicalPhone } = await import("../lib/otp");
    const { sendSms } = await import("../lib/sms");
    const { requestContactVerification, confirmContactVerification } =
      await import("../lib/contact-verification");
    let phoneIndex = 0;
    const password = "test-password-123";
    const passwordHash = await bcrypt.hash(password, 4);
    async function account(roles: Role[]) {
      phoneIndex += 1;
      return db.user.create({
        data: {
          email: `${randomUUID()}@example.test`,
          name: "Login test",
          passwordHash,
          phone: `017${String(phoneIndex).padStart(8, "0")}`,
          roles,
        },
      });
    }
    function smsConfig(provider: string) {
      process.env.SMS_PROVIDER = provider;
      process.env.SMS_API_KEY = "test-key";
      process.env.SMS_CLIENT_ID = "test-client";
      process.env.SMS_SENDER_ID = "test-sender";
    }

    const { setAccountStatus } = await import("../lib/account-status");
    const changeStatus = (
      actorId: string,
      id: string,
      active: boolean,
      target = AccountStatusTargets.User as string,
    ) =>
      setAccountStatus(actorId, {
        id,
        target: target as typeof AccountStatusTargets.User,
        status: active ? EntityStatuses.Active : EntityStatuses.Inactive,
        expectedStatus: active ? EntityStatuses.Inactive : EntityStatuses.Active,
      });
    await test("role values are PascalCase and legacy signed session roles normalize without granting unknown roles", () => {
      assert.deepEqual(Object.values(Roles), [
        "Customer",
        "Admin",
        "Rider",
        "Support",
        "Warehouse",
        "Sales",
        "Manager",
      ]);
      for (const role of Object.values(Roles)) {
        assert.equal(normalizeRole(role), role);
      }
      // Uppercase forms exist only for the legacy database encodings of the original roles.
      for (const role of ["Customer", "Admin", "Rider"]) {
        assert.equal(normalizeRole(role.toUpperCase()), role);
      }
      // Pre-rename department role names keep resolving for signed sessions.
      assert.equal(normalizeRole("CustomerService"), "Support");
      assert.equal(normalizeRole("WarehouseKeeper"), "Warehouse");
      assert.equal(normalizeRole("SalesRep"), "Sales");
      for (const value of ["Shop", "Delivery", "Unknown", "toString", "__proto__", null, 1])
        assert.equal(normalizeRole(value), null);
    });
    await test("concurrent administrator deactivation leaves one active admin and prevents self-deactivation", async () => {
      const a = await account([Roles.Admin]),
        b = await account([Roles.Admin]);
      const results = await Promise.all([
        changeStatus(a.id, b.id, false),
        changeStatus(b.id, a.id, false),
      ]);
      assert.equal(results.filter((result) => result.ok).length, 1);
      assert.equal(
        await db.user.count({ where: { active: true, roles: { has: Roles.Admin } } }),
        1,
      );
      const survivor = await db.user.findFirstOrThrow({
        where: { active: true, roles: { has: Roles.Admin } },
      });
      assert.equal((await changeStatus(survivor.id, survivor.id, false)).ok, false);
    });
    await test("only active admins change account status; audit, orders and wallet history are preserved", async () => {
      const admin = await account([Roles.Admin]),
        buyer = await account([Roles.Customer]);
      const wallet = await db.wallet.create({ data: { userId: buyer.id, balanceCents: 12345 } });
      const order = await db.order.create({
        data: {
          userId: buyer.id,
          number: randomUUID(),
          subtotalCents: 100,
          totalCents: 100,
          currencyCode: "BDT",
          currencySymbol: "Tk",
          recipientName: buyer.name,
          phone: buyer.phone!,
          line1: "Road",
          city: "Dhaka",
        },
      });
      assert.equal((await changeStatus(buyer.id, admin.id, false)).ok, false);
      const proof = await prepareEmailLogin(buyer.email, password);
      assert.ok(proof);
      assert.equal((await changeStatus(admin.id, buyer.id, false)).ok, true);
      assert.equal(await prepareEmailLogin(buyer.email, password), null);
      assert.equal(await pendingLoginProof(proof.ticket), null);
      assert.equal(await consumeLoginProof(proof.ticket, Roles.Customer), null);
      assert.equal((await createPhoneOtp(buyer.phone!)).ok, false);
      assert.equal(await db.phoneOtp.count({ where: { phone: canonicalPhone(buyer.phone!) } }), 0);
      assert.equal(
        (await db.wallet.findUniqueOrThrow({ where: { id: wallet.id } })).balanceCents,
        12345,
      );
      assert.equal(
        (await db.order.findUniqueOrThrow({ where: { id: order.id } })).status,
        OrderStatuses.Pending,
      );
      const audit = await db.accountStatusEvent.findFirstOrThrow({ where: { userId: buyer.id } });
      assert.equal(audit.actorId, admin.id);
      assert.equal(audit.previousActive, true);
      assert.equal(audit.active, false);
      assert.equal((await changeStatus(admin.id, buyer.id, false)).ok, false);
      assert.equal((await changeStatus(admin.id, buyer.id, true)).ok, true);
      assert.ok(await prepareEmailLogin(buyer.email, password));
      assert.equal(await consumeLoginProof(proof.ticket, Roles.Customer), null);
      await db.user.update({ where: { id: admin.id }, data: { active: false } });
      assert.equal((await changeStatus(admin.id, buyer.id, false)).ok, false);
    });
    await test("account deactivation blocks all role choices and OTP proofs issued before deactivation", async () => {
      const user = await account([Roles.Customer, Roles.Admin, Roles.Rider]);
      await db.rider.create({ data: { userId: user.id, name: user.name, phone: user.phone! } });
      const proof = await prepareEmailLogin(user.email, password);
      assert.ok(proof);
      assert.equal(proof.roles.length, 3);
      await db.phoneOtp.create({
        data: {
          phone: canonicalPhone(user.phone!),
          code: "654321",
          expiresAt: new Date(Date.now() + 60_000),
        },
      });
      await db.user.update({ where: { id: user.id }, data: { active: false } });
      assert.equal(await preparePhoneLogin(user.phone!, "654321"), null);
      assert.equal(await pendingLoginProof(proof.ticket), null);
      for (const role of user.roles)
        assert.equal(await consumeLoginProof(proof.ticket, role), null);
    });
    await test("rider availability is separate from account status and open deliveries must be reassigned", async () => {
      const admin = await account([Roles.Admin]),
        user = await account([Roles.Customer, Roles.Rider]);
      const rider = await db.rider.create({
        data: { userId: user.id, name: user.name, phone: user.phone! },
      });
      const order = await db.order.create({
        data: {
          userId: user.id,
          riderId: rider.id,
          number: randomUUID(),
          subtotalCents: 100,
          totalCents: 100,
          currencyCode: "BDT",
          currencySymbol: "Tk",
          recipientName: user.name,
          phone: user.phone!,
          line1: "Road",
          city: "Dhaka",
        },
      });
      assert.equal(
        (await changeStatus(admin.id, rider.id, false, AccountStatusTargets.Rider)).ok,
        false,
      );
      assert.equal((await changeStatus(admin.id, user.id, false)).ok, false);
      await db.order.update({ where: { id: order.id }, data: { riderId: null } });
      assert.equal(
        (await changeStatus(admin.id, rider.id, false, AccountStatusTargets.Rider)).ok,
        true,
      );
      assert.deepEqual((await prepareEmailLogin(user.email, password))?.roles, [Roles.Customer]);
      assert.equal((await changeStatus(admin.id, user.id, false)).ok, true);
      assert.equal(
        (await changeStatus(admin.id, rider.id, true, AccountStatusTargets.Rider)).ok,
        false,
      );
      const { assignOrderDelivery } = await import("../lib/order-lifecycle");
      assert.equal((await assignOrderDelivery(order.id, `rider:${rider.id}`)).ok, false);
      assert.equal((await changeStatus(admin.id, user.id, true)).ok, true);
      assert.equal(
        (await changeStatus(admin.id, rider.id, true, AccountStatusTargets.Rider)).ok,
        true,
      );
      assert.equal((await assignOrderDelivery(order.id, `rider:${rider.id}`)).ok, true);
    });

    await test("invalid passwords and unknown email never expose roles or issue login proofs", async () => {
      const user = await account([Roles.Customer, Roles.Admin]);
      assert.equal(await prepareEmailLogin(user.email, "wrong"), null);
      assert.equal(await prepareEmailLogin("missing@example.test", password), null);
      assert.equal(await db.loginChallenge.count({ where: { userId: user.id } }), 0);
    });

    await test("single-role email account yields only its assigned role", async () => {
      const user = await account([Roles.Admin]);
      const proof = await prepareEmailLogin(` ${user.email.toUpperCase()} `, password);
      assert.ok(proof);
      assert.deepEqual(proof.roles, [Roles.Admin]);
      const stored = await db.loginChallenge.findFirstOrThrow({ where: { userId: user.id } });
      assert.notEqual(stored.tokenHash, proof.ticket);
      assert.equal((await consumeLoginProof(proof.ticket, Roles.Admin))?.role, Roles.Admin);
    });

    await test("multiple roles are returned only after verification; unassigned roles cannot sign in", async () => {
      const user = await account([Roles.Customer, Roles.Admin]);
      const proof = await prepareEmailLogin(user.email, password);
      assert.ok(proof);
      assert.deepEqual(proof.roles, [Roles.Customer, Roles.Admin]);
      assert.equal(await consumeLoginProof(proof.ticket, Roles.Rider), null);
      assert.equal((await consumeLoginProof(proof.ticket, Roles.Admin))?.id, user.id);
      assert.equal(await consumeLoginProof(proof.ticket, Roles.Customer), null);
    });

    await test("support agents can claim Support while customer-only accounts cannot", async () => {
      const agent = await account([Roles.Customer, Roles.Support]);
      const proof = await prepareEmailLogin(agent.email, password);
      assert.ok(proof);
      assert.deepEqual(proof.roles, [Roles.Customer, Roles.Support]);
      assert.equal((await consumeLoginProof(proof.ticket, Roles.Support))?.role, Roles.Support);

      const shopper = await account([Roles.Customer]);
      const shopperProof = await prepareEmailLogin(shopper.email, password);
      assert.ok(shopperProof);
      assert.deepEqual(shopperProof.roles, [Roles.Customer]);
      assert.equal(await consumeLoginProof(shopperProof.ticket, Roles.Support), null);
    });

    await test("Manager, Warehouse and Sales are claimable while legacy names are refused", async () => {
      const staff = await account([Roles.Customer, Roles.Manager, Roles.Warehouse, Roles.Sales]);
      const proof = await prepareEmailLogin(staff.email, password);
      assert.ok(proof);
      assert.deepEqual(proof.roles, [Roles.Customer, Roles.Manager, Roles.Warehouse, Roles.Sales]);

      // One proof claims one role, so re-verify for each entry of the
      // selectLoginRoleAction whitelist (Warehouse/Sales used to be rejected).
      for (const role of [Roles.Customer, Roles.Manager, Roles.Warehouse, Roles.Sales]) {
        const fresh = await prepareEmailLogin(staff.email, password);
        assert.ok(fresh);
        assert.equal((await consumeLoginProof(fresh.ticket, role))?.role, role);
      }

      for (const claim of ["CustomerService", "WarehouseKeeper", "SalesRep", "Root"]) {
        const fresh = await prepareEmailLogin(staff.email, password);
        assert.ok(fresh);
        assert.equal(await consumeLoginProof(fresh.ticket, claim), null, claim);
      }
      // Manager is now accepted in the whitelist (previously-broken Warehouse/Sales fix).
      const fresh = await prepareEmailLogin(staff.email, password);
      assert.ok(fresh);
      const consumed = await consumeLoginProof(fresh.ticket, Roles.Manager);
      assert.ok(consumed, "Manager should be accepted in consumeLoginProof");
      assert.equal(consumed.role, Roles.Manager);
    });

    await test("inactive or missing rider profiles are excluded from login choices", async () => {
      const user = await account([Roles.Customer, Roles.Rider]);
      assert.deepEqual((await prepareEmailLogin(user.email, password))?.roles, [Roles.Customer]);
      const rider = await db.rider.create({
        data: { userId: user.id, name: user.name, phone: user.phone!, active: false },
      });
      assert.deepEqual((await prepareEmailLogin(user.email, password))?.roles, [Roles.Customer]);
      await db.rider.update({ where: { id: rider.id }, data: { active: true } });
      assert.deepEqual((await prepareEmailLogin(user.email, password))?.roles, [
        Roles.Customer,
        Roles.Rider,
      ]);
    });

    await test("expired, fabricated and concurrent proof submissions cannot replay authentication", async () => {
      const user = await account([Roles.Customer]);
      const expired = await prepareEmailLogin(user.email, password);
      assert.ok(expired);
      await db.loginChallenge.updateMany({
        where: { userId: user.id },
        data: { expiresAt: new Date(0) },
      });
      assert.equal(await consumeLoginProof(expired.ticket, Roles.Customer), null);
      assert.equal(await consumeLoginProof("a".repeat(64), Roles.Admin), null);
      const proof = await prepareEmailLogin(user.email, password);
      assert.ok(proof);
      const results = await Promise.all([
        consumeLoginProof(proof.ticket, Roles.Customer),
        consumeLoginProof(proof.ticket, Roles.Customer),
      ]);
      assert.equal(results.filter(Boolean).length, 1);
    });

    await test("roles revoked after credential verification cannot be selected", async () => {
      const user = await account([Roles.Customer, Roles.Admin]);
      const proof = await prepareEmailLogin(user.email, password);
      assert.ok(proof);
      await db.user.update({ where: { id: user.id }, data: { roles: [Roles.Customer] } });
      assert.equal(await consumeLoginProof(proof.ticket, Roles.Admin), null);
      assert.equal((await consumeLoginProof(proof.ticket, Roles.Customer))?.role, Roles.Customer);
    });

    await test("pending role choice is restored only for valid proofs and cancellation invalidates it", async () => {
      const user = await account([Roles.Customer, Roles.Admin]);
      assert.equal(await pendingLoginProof(undefined), null);
      const proof = await prepareEmailLogin(user.email, password);
      assert.ok(proof);
      assert.deepEqual(await pendingLoginProof(proof.ticket), proof);
      await abandonLoginProof(proof.ticket);
      assert.equal(await pendingLoginProof(proof.ticket), null);
      assert.equal(await consumeLoginProof(proof.ticket, Roles.Admin), null);
    });

    await test("phone OTP verifies once and then allows a role choice without reusing the OTP", async () => {
      const user = await account([Roles.Customer, Roles.Admin]);
      const phone = canonicalPhone(user.phone!);
      await db.phoneOtp.create({
        data: { phone, code: "123456", expiresAt: new Date(Date.now() + 300_000) },
      });
      assert.equal(await preparePhoneLogin(user.phone!, "000000"), null);
      const proof = await preparePhoneLogin(user.phone!, "123456");
      assert.ok(proof);
      assert.deepEqual(proof.roles, [Roles.Customer, Roles.Admin]);
      assert.equal(await preparePhoneLogin(user.phone!, "123456"), null);
      assert.equal((await consumeLoginProof(proof.ticket, Roles.Admin))?.id, user.id);
    });

    await test("concurrent phone OTP verification creates exactly one login proof", async () => {
      const user = await account([Roles.Customer]);
      await db.phoneOtp.create({
        data: {
          phone: canonicalPhone(user.phone!),
          code: "123456",
          expiresAt: new Date(Date.now() + 300_000),
        },
      });
      const results = await Promise.all([
        preparePhoneLogin(user.phone!, "123456"),
        preparePhoneLogin(user.phone!, "123456"),
      ]);
      assert.equal(results.filter(Boolean).length, 1);
      assert.equal(await db.loginChallenge.count({ where: { userId: user.id } }), 1);
    });

    await test("SMSQ sends documented parameters and requires provider acceptance", async () => {
      smsConfig("smsq");
      globalThis.fetch = async (input, options) => {
        assert.equal(String(input), "https://api.smsq.global/api/v2/SendSMS");
        const payload = JSON.parse(String(options?.body));
        assert.equal(payload.MobileNumbers, "8801700000001");
        assert.equal(payload.ClientId, "test-client");
        assert.equal(payload.Is_Unicode, false);
        return Response.json({ ErrorCode: 0, Data: [{ MessageId: "accepted" }] });
      };
      assert.equal(await sendSms("01700000001", "OTP message"), true);
      globalThis.fetch = async () =>
        Response.json({ ErrorCode: 5, ErrorDescription: "Insufficient balance" });
      assert.equal(await sendSms("01700000001", "OTP message"), false);
    });

    await test("BulkSMSBD HTTP success without response code 202 is rejected", async () => {
      smsConfig("bulksmsbd");
      globalThis.fetch = async (input, options) => {
        assert.equal(String(input), "https://bulksmsbd.net/api/smsapi");
        const fields = new URLSearchParams(String(options?.body));
        assert.equal(fields.get("api_key"), "test-key");
        assert.equal(fields.get("number"), "8801700000001");
        return Response.json({ response_code: 202 });
      };
      assert.equal(await sendSms("+8801700000001", "OTP message"), true);
      globalThis.fetch = async () => Response.json({ response_code: 1007 });
      assert.equal(await sendSms("01700000001", "OTP message"), false);
    });

    await test("timeouts and missing provider credentials do not claim SMS success", async () => {
      smsConfig("smsq");
      globalThis.fetch = async () => {
        throw new Error("timeout");
      };
      assert.equal(await sendSms("01700000001", "OTP message"), false);
      delete process.env.SMS_API_KEY;
      globalThis.fetch = async () => {
        assert.fail("Unconfigured SMS must not be sent");
      };
      assert.equal(await sendSms("01700000001", "OTP message"), false);
      process.env.SMS_PROVIDER = "disabled";
      assert.equal(await sendSms("01700000001", "OTP message"), false);
    });

    await test("console mode cannot simulate sent messages in production", async () => {
      const previousMode = process.env.NODE_ENV;
      Object.assign(process.env, { NODE_ENV: "production", SMS_PROVIDER: "console" });
      try {
        assert.equal(await sendSms("01700000001", "OTP message"), false);
      } finally {
        if (previousMode === undefined) Reflect.deleteProperty(process.env, "NODE_ENV");
        else Object.assign(process.env, { NODE_ENV: previousMode });
      }
    });

    await test("failed SMS submission invalidates the OTP and reports failure", async () => {
      const user = await account([Roles.Customer]);
      smsConfig("smsq");
      globalThis.fetch = async () => Response.json({ ErrorCode: 9 });
      assert.deepEqual(await createPhoneOtp(user.phone!), { ok: false, code: "SMS_FAILED" });
      const otp = await db.phoneOtp.findFirstOrThrow({
        where: { phone: canonicalPhone(user.phone!) },
      });
      assert.ok(otp.consumedAt);
      assert.equal(await preparePhoneLogin(user.phone!, otp.code), null);
    });

    await test("contact changes require a hashed, one-time code and reject stale challenges", async () => {
      const owner = await db.user.create({
        data: {
          email: `${randomUUID()}@example.test`,
          name: "Contact owner",
          passwordHash,
          roles: [Roles.Customer],
        },
      });
      const linked = await account([Roles.Customer]);
      assert.deepEqual(
        await requestContactVerification(ContactChannel.Phone, linked.phone!, owner.id),
        { ok: false, code: "ALREADY_USED" },
      );
      smsConfig("smsq");
      const codes: string[] = [];
      globalThis.fetch = async (_input, init) => {
        const body = JSON.parse(String(init?.body)) as { Message?: string };
        const code = body.Message?.match(/\b\d{6}\b/)?.[0];
        assert.ok(code);
        codes.push(code);
        return Response.json({ ErrorCode: 0, Data: [{ MessageId: "accepted" }] });
      };

      const first = await requestContactVerification(ContactChannel.Phone, "01700000881", owner.id);
      assert.ok(first.ok);
      const firstOtp = await db.contactVerificationOtp.findUniqueOrThrow({
        where: { id: first.challengeId },
      });
      assert.notEqual(firstOtp.codeHash, "");
      assert.equal("code" in firstOtp, false);
      assert.equal(
        (
          await confirmContactVerification({
            channel: ContactChannel.Phone,
            target: first.target,
            challengeId: first.challengeId,
            code: "000000",
            userId: owner.id,
          })
        ).ok,
        false,
      );
      const verifiedFirst = await confirmContactVerification({
        channel: ContactChannel.Phone,
        target: first.target,
        challengeId: first.challengeId,
        code: codes[0],
        userId: owner.id,
      });
      assert.deepEqual(verifiedFirst, { ok: true, oldValue: null });
      assert.equal(
        (await db.user.findUniqueOrThrow({ where: { id: owner.id } })).phone,
        first.target,
      );
      assert.deepEqual(
        await confirmContactVerification({
          channel: ContactChannel.Phone,
          target: first.target,
          challengeId: first.challengeId,
          code: codes[0],
          userId: owner.id,
        }),
        { ok: false, code: "INVALID_OTP" },
      );
      await db.contactVerificationOtp.update({
        where: { id: first.challengeId },
        data: { createdAt: new Date(Date.now() - 61_000) },
      });

      const second = await requestContactVerification(
        ContactChannel.Phone,
        "01700000882",
        owner.id,
      );
      assert.ok(second.ok);
      const secondOtp = await db.contactVerificationOtp.findUniqueOrThrow({
        where: { id: second.challengeId },
      });
      assert.match(secondOtp.codeHash, /^[0-9a-f]{64}$/);
      const cooldown = await requestContactVerification(
        ContactChannel.Phone,
        "01700000884",
        owner.id,
      );
      assert.equal(cooldown.ok, false);
      if (!cooldown.ok) {
        assert.equal(cooldown.code, "RATE_LIMIT");
        assert.ok((cooldown.wait ?? 0) > 0 && (cooldown.wait ?? 61) <= 60);
      }
      await db.contactVerificationOtp.update({
        where: { id: second.challengeId },
        data: { createdAt: new Date(Date.now() - 61_000) },
      });
      const third = await requestContactVerification(ContactChannel.Phone, "01700000883", owner.id);
      assert.ok(third.ok);
      assert.equal(
        await confirmContactVerification({
          channel: ContactChannel.Phone,
          target: second.target,
          challengeId: second.challengeId,
          code: codes[1],
          userId: owner.id,
        }).then((result) => result.ok),
        false,
      );
      assert.deepEqual(
        await confirmContactVerification({
          channel: ContactChannel.Phone,
          target: third.target,
          challengeId: third.challengeId,
          code: codes[2],
          userId: owner.id,
        }),
        { ok: true, oldValue: first.target },
      );
      assert.equal(
        (await db.user.findUniqueOrThrow({ where: { id: owner.id } })).phone,
        third.target,
      );
    });

    await test("concurrent OTP send requests submit one SMS and enforce the resend cooldown", async () => {
      const user = await account([Roles.Customer]);
      smsConfig("smsq");
      let requests = 0;
      globalThis.fetch = async () => {
        requests += 1;
        return Response.json({ ErrorCode: 0, Data: [{ MessageId: "accepted" }] });
      };
      const results = await Promise.all([createPhoneOtp(user.phone!), createPhoneOtp(user.phone!)]);
      assert.equal(results.filter((result) => result.ok).length, 1);
      assert.equal(requests, 1);
      assert.ok(results.some((result) => !result.ok && result.code === "RATE_LIMIT"));
      assert.deepEqual(await createPhoneOtp("+12025550123"), { ok: false, code: "INVALID_PHONE" });
    });
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of smsKeys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
    await testDb?.$disconnect();
    await admin.$executeRawUnsafe(`DROP DATABASE "${databaseName}"`);
    await admin.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Auth tests failed");
  process.exitCode = 1;
});
