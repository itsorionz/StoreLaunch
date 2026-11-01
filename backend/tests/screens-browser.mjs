import {
  DeliveryRelationships,
  AddressTypes,
  ChatConversationStatuses,
  InboxCategories,
  OrderEventTypes,
  OrderStatuses,
  PaymentMethods,
  PaymentAttemptStatuses,
  ReviewStatuses,
  Roles,
} from "../lib/enums.mjs";
// End-to-end screen checks: disposable PostgreSQL database, separate Next build and Chrome profile.
import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";
import { encode } from "next-auth/jwt";
import { spawn, execFileSync } from "node:child_process";
import { randomUUID, createHmac } from "node:crypto";
import { mkdtemp, writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { hash } from "bcryptjs";
import WebSocket from "next/dist/compiled/ws/index.js";

config({ quiet: true });
const base = "http://localhost:3109";
const databaseName = `test_screens_${randomUUID().replaceAll("-", "")}`;
const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
let db, server, chrome, socket;
const pending = new Map();
let sequence = 0;
let serverLog = "";
const results = [];
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function command(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await command("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
async function until(check, label) {
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await delay(100);
  }
  throw new Error(`Timed out: ${label}`);
}
async function visit(route, text) {
  const previousDocument = await evaluate("performance.timeOrigin");
  await command("Page.navigate", { url: base + route });
  await until(
    () =>
      evaluate(
        `performance.timeOrigin !== ${previousDocument} && location.pathname === ${JSON.stringify(route.split("?")[0])} && document.readyState === 'complete' && Boolean(document.querySelector('main')) && document.querySelector('main').innerText.trim().length > 10 && !document.body.innerText.includes('Application error:')`,
      ),
    route,
  );
  if (text)
    await until(
      () => evaluate(`document.body.innerText.includes(${JSON.stringify(text)})`),
      `${route}: ${text}`,
    );
  const error = await evaluate(
    "document.body.innerText.includes('Internal Server Error') || document.body.innerText.includes('Application error:')",
  );
  assert.equal(error, false, route);
}
async function hydrated(selector) {
  await until(
    () =>
      evaluate(
        `Boolean(document.querySelector(${JSON.stringify(selector)})) && Object.keys(document.querySelector(${JSON.stringify(selector)})).some(key => key.startsWith('__reactProps$'))`,
      ),
    `hydrate ${selector}`,
  );
}
async function clickText(text) {
  await until(
    () =>
      evaluate(
        `(() => { const b = Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === ${JSON.stringify(text)}); return b && !b.disabled && b.getClientRects().length > 0 && !b.closest('[inert]') && Object.keys(b).some(key => key.startsWith('__reactProps$')); })()`,
      ),
    `hydrate button ${text}`,
  );
  await evaluate(
    `(() => { const button = Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === ${JSON.stringify(text)}); if (!button) throw Error('Missing button: '+${JSON.stringify(text)}); button.click(); })()`,
  );
}
async function submit(selector, fields, submitNow = true) {
  await hydrated(selector);
  await evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)}); const form = element.form || element;
    const setNative = (node, prop, value) => {
      const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(node), prop);
      if (descriptor?.set) descriptor.set.call(node, value);
      else node[prop] = value;
    };
    for (const [name, value] of Object.entries(${JSON.stringify(fields)})) {
      const input = form.elements.namedItem(name); if (!input) throw Error('Missing field '+name);
      if (input.type === 'checkbox') { setNative(input, 'checked', Boolean(value)); input.dispatchEvent(new Event('change', { bubbles: true })); }
      else {
        setNative(input, 'value', String(value));
        if (typeof input.dispatchEvent === 'function') input.dispatchEvent(new Event('input', { bubbles: true }));
        else { const checked = Array.from(input).find((radio) => radio.checked); if (checked) checked.dispatchEvent(new Event('change', { bubbles: true })); }
      }
    }
    if (${submitNow}) form.requestSubmit();
  })()`);
}
function pass(label) {
  results.push(label);
  console.log(`PASS: ${label}`);
}
async function session(user, role) {
  await command("Network.clearBrowserCookies");
  const token = await encode({
    secret: process.env.AUTH_SECRET,
    salt: "authjs.session-token",
    token: { uid: user.id, sub: user.id, name: user.name, email: user.email, role },
    maxAge: 3600,
  });
  await command("Network.setCookie", {
    name: "authjs.session-token",
    value: token,
    url: base,
    httpOnly: true,
    sameSite: "Lax",
  });
}
async function run() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname), "Local database required");
  await admin.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`);
  url.pathname = `/${databaseName}`;
  const env = {
    ...process.env,
    DATABASE_URL: url.toString(),
    STORELAUNCH_SCREEN_TEST: "1",
    AUTH_URL: base,
    AUTH_TRUST_HOST: "true",
    SMS_PROVIDER: "disabled",
    SMTP_HOST: "",
    SSLCOMMERZ_STORE_ID: "",
    SSLCOMMERZ_STORE_PASSWORD: "",
    CLOUDINARY_CLOUD_NAME: "",
    PAYMENT_RECOVERY_SECRET: randomUUID(),
  };
  execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], {
    env,
    stdio: "pipe",
  });
  db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString() }) });
  const customer = await db.user.create({
    data: {
      name: "Screen Customer",
      email: "customer@screen.invalid",
      passwordHash: "unused",
      roles: [Roles.Customer],
    },
  });
  const owner = await db.user.create({
    data: {
      name: "Screen Admin",
      email: "admin@screen.invalid",
      passwordHash: "unused",
      roles: [Roles.Admin],
    },
  });
  const riderUser = await db.user.create({
    data: {
      name: "Screen Rider",
      email: "rider@screen.invalid",
      passwordHash: "unused",
      roles: [Roles.Rider],
    },
  });
  const rider = await db.rider.create({
    data: { name: riderUser.name, phone: "8801700000001", userId: riderUser.id },
  });
  const support = await db.user.create({
    data: {
      name: "Screen Support",
      email: "support@screen.invalid",
      passwordHash: "unused",
      roles: [Roles.Customer, Roles.Support],
    },
  });
  const category = await db.category.create({
    data: { name: "Screen Category", slug: "screen-category" },
  });
  const brand = await db.brand.create({ data: { name: "Screen Brand", slug: "screen-brand" } });
  const product = await db.product.create({
    data: {
      name: "Screen Product",
      slug: "screen-product",
      categoryId: category.id,
      brandId: brand.id,
      priceCents: 10000,
      stock: 10,
      featured: true,
      flashSale: true,
    },
  });
  await db.product.create({
    data: {
      name: "Sold Out",
      slug: "sold-out",
      categoryId: category.id,
      priceCents: 100,
      stock: 0,
    },
  });
  const order = await db.order.create({
    data: {
      number: "SCREEN001",
      userId: customer.id,
      riderId: rider.id,
      status: OrderStatuses.Delivered,
      paymentMethod: PaymentMethods.COD,
      subtotalCents: 10000,
      totalCents: 10000,
      currencyCode: "BDT",
      currencySymbol: "Tk",
      recipientName: customer.name,
      phone: "01700000000",
      line1: "Screen Road",
      city: "Dhaka",
      items: {
        create: {
          productId: product.id,
          name: product.name,
          slug: product.slug,
          priceCents: product.priceCents,
          quantity: 1,
        },
      },
    },
  });
  await db.cart.create({
    data: { userId: customer.id, items: { create: { productId: product.id, quantity: 1 } } },
  });
  console.log("Building isolated screen test app...");
  execFileSync(process.execPath, ["node_modules/next/dist/bin/next", "build"], {
    env,
    stdio: "inherit",
    timeout: 180000,
  });
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--port", "3109"], {
    env,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (chunk) => {
    serverLog += chunk;
  });
  server.stderr.on("data", (chunk) => {
    serverLog += chunk;
  });
  await until(async () => {
    try {
      return (await fetch(base + "/login")).ok;
    } catch {
      return false;
    }
  }, "isolated server");
  const profile = await mkdtemp(path.join(tmpdir(), "storelaunch-screens-"));
  chrome = spawn(
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--remote-debugging-port=9224",
      `--user-data-dir=${profile}`,
      "about:blank",
    ],
    { windowsHide: true, stdio: "ignore" },
  );
  await until(async () => {
    try {
      return (await fetch("http://127.0.0.1:9224/json/version")).ok;
    } catch {
      return false;
    }
  }, "Chrome");
  const tab = await (
    await fetch("http://127.0.0.1:9224/json/new?about:blank", { method: "PUT" })
  ).json();
  socket = new WebSocket(tab.webSocketDebuggerUrl);
  socket.on("message", (message) => {
    const response = JSON.parse(String(message));
    const request = pending.get(response.id);
    if (request) {
      pending.delete(response.id);
      if (response.error) request.reject(Error(response.error.message));
      else request.resolve(response.result);
    }
  });
  await new Promise((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
  await command("Page.enable");
  await command("Network.enable");

  await visit("/setup");
  const licensePayload = Buffer.from(
    JSON.stringify({ v: 1, iat: Math.floor(Date.now() / 1000) }),
  ).toString("base64url");
  const licenseKey = `SL1.${licensePayload}.${createHmac("sha256", process.env.LICENSE_SECRET).update(licensePayload).digest("base64url")}`;
  await submit("input[name=licenseKey]", { licenseKey }, false);
  await clickText("Continue");
  await until(
    () => evaluate("!document.querySelector('input[name=adminName]').closest('fieldset').hidden"),
    "setup account step",
  );
  await submit(
    "input[name=adminName]",
    { adminName: "Setup Admin", email: "setup@screen.invalid", password: "test-password-123" },
    false,
  );
  await clickText("Continue");
  await until(
    () => evaluate("!document.querySelector('input[name=storeName]').closest('fieldset').hidden"),
    "setup store step",
  );
  assert.equal(
    await evaluate("document.querySelector('input[name=licenseKey]').value.length > 10"),
    true,
  );
  await submit("input[name=storeName]", {
    storeName: "Screen Test Store",
    currencySymbol: "Tk",
    currencyCode: "XX",
  });
  await until(
    () => evaluate("Boolean(document.querySelector('[data-field-error=currencyCode]'))"),
    "setup server validation",
  );
  assert.equal(await db.license.count(), 0);
  pass("setup rejects invalid currency and shows server validation text");
  await submit("input[name=storeName]", { currencyCode: "BDT" });
  await until(
    async () => Boolean((await db.storeSettings.findFirst())?.setupCompletedAt),
    "setup complete",
  );
  await visit("/", "Screen Test Store");
  pass("setup retains all steps and persists store, administrator and license");

  if (process.argv.includes("--payments-only")) {
    async function pendingPayment(number, status, expired = false, buyerId = customer.id) {
      return db.$transaction(async (tx) => {
        await tx.product.update({ where: { id: product.id }, data: { stock: { decrement: 1 } } });
        return tx.order.create({
          data: {
            number,
            userId: buyerId,
            status: OrderStatuses.Pending,
            paymentMethod: PaymentMethods.GATEWAY,
            subtotalCents: 10000,
            totalCents: 10000,
            currencyCode: "BDT",
            currencySymbol: "Tk",
            recipientName: "Payment buyer",
            phone: "01700000000",
            line1: "Payment road",
            city: "Dhaka",
            items: {
              create: {
                productId: product.id,
                name: product.name,
                slug: product.slug,
                priceCents: 10000,
                quantity: 1,
              },
            },
            paymentAttempt: {
              create: {
                status,
                expiresAt: new Date(Date.now() + (expired ? -60000 : 1800000)),
                nextCheckAt: new Date(0),
                ...(status === PaymentAttemptStatuses.Ready
                  ? {
                      sessionKey: "isolated-session",
                      gatewayUrl: "https://sandbox.sslcommerz.com/payment",
                    }
                  : {}),
              },
            },
          },
        });
      });
    }
    const expired = await pendingPayment("PAYEXPIRED", PaymentAttemptStatuses.Created, true);
    const foreign = await pendingPayment(
      "PAYFOREIGN",
      PaymentAttemptStatuses.Created,
      true,
      owner.id,
    );
    const ready = await pendingPayment("PAYREADY", PaymentAttemptStatuses.Ready);
    await session(customer, Roles.Customer);
    await visit(`/account/orders/${expired.number}`, "Online payment");
    assert.ok(
      await evaluate(
        "document.querySelector('[data-payment-recovery]').innerText.includes('Created')",
      ),
    );
    await hydrated("input[name=orderId]");
    await evaluate(
      `document.querySelector('[data-payment-recovery] input[name=orderId]').value = ${JSON.stringify(foreign.id)}`,
    );
    await clickText("Check payment status");
    await until(
      () =>
        evaluate(
          "document.querySelector('[data-payment-recovery]').innerText.includes('Order not found')",
        ),
      "foreign payment blocked",
    );
    assert.equal(
      (await db.order.findUnique({ where: { id: foreign.id } })).status,
      OrderStatuses.Pending,
    );
    pass("customer payment action rejects another customer's forged order ID");
    await visit(`/account/orders/${expired.number}`, "Online payment");
    await clickText("Check payment status");
    await until(
      async () =>
        (await db.order.findUnique({ where: { id: expired.id } })).status ===
        OrderStatuses.Cancelled,
      "unstarted expiry from customer screen",
    );
    await visit(`/account/orders/${expired.number}`, "Expired");
    assert.equal((await db.product.findUnique({ where: { id: product.id } })).stock, 8);
    pass("customer payment check expires an unstarted order and reloads the released reservation");
    await visit(`/account/orders/${ready.number}`, "Continue payment");
    assert.ok(
      await evaluate(
        "document.querySelector('[data-payment-recovery]').innerText.includes('Ready')",
      ),
    );
    pass("customer can see the existing hosted payment resume action");
    await visit("/checkout");
    await submit("input[name=line1]", {
      name: customer.name,
      phone: "01700000000",
      line1: "Payment checkout road",
      city: "Dhaka",
      paymentMethod: PaymentMethods.GATEWAY,
    });
    await until(
      async () =>
        Boolean(
          await db.order.findFirst({
            where: {
              userId: customer.id,
              number: { startsWith: "SL" },
              status: OrderStatuses.Cancelled,
            },
          }),
        ),
      "checkout payment initiation failure handled",
    );
    const gatewayCheckout = await db.order.findFirst({
      where: { userId: customer.id, number: { startsWith: "SL" } },
      include: { paymentAttempt: true },
    });
    assert.equal(gatewayCheckout.paymentAttempt.status, PaymentAttemptStatuses.Expired);
    await until(
      () => evaluate(`location.pathname === '/account/orders/${gatewayCheckout.number}'`),
      "checkout returns to its saved payment state",
    );
    assert.equal((await db.product.findUnique({ where: { id: product.id } })).stock, 8);
    pass(
      "real gateway checkout persists its attempt and safely cancels a definitively unavailable provider without leaking stock",
    );
    await session(owner, Roles.Admin);
    await visit(`/admin/orders/${ready.number}`, "Online payment");
    await clickText("Cancel order");
    await hydrated("[role=dialog] button");
    await evaluate(
      "Array.from(document.querySelectorAll('[role=dialog] button')).find(button => button.innerText.trim() === 'Cancel order').click()",
    );
    await until(
      () =>
        evaluate(
          "document.body.innerText.includes('Check the provider payment status before cancellation')",
        ),
      "unsafe admin cancellation blocked",
    );
    assert.equal(
      (await db.order.findUnique({ where: { id: ready.id } })).status,
      OrderStatuses.Pending,
    );
    pass("admin cannot cancel an in-flight gateway payment without verification");
    await db.paymentAttempt.update({
      where: { orderId: expired.id },
      data: { status: PaymentAttemptStatuses.ReviewRequired, requiresManualReview: true },
    });
    await visit("/admin/payments", "Payment recovery");
    assert.ok(
      await evaluate(
        "document.querySelector('tbody').innerText.includes('PAYEXPIRED') && document.querySelector('tbody').innerText.includes('PAYREADY')",
      ),
    );
    pass("admin recovery queue includes unpaid orders and late-payment review on cancelled orders");
    const unauthorized = await fetch(base + "/api/jobs/payment-recovery", { method: "POST" });
    assert.equal(unauthorized.status, 401);
    const authorized = await fetch(base + "/api/jobs/payment-recovery", {
      method: "POST",
      headers: { authorization: `Bearer ${env.PAYMENT_RECOVERY_SECRET}` },
    });
    assert.equal(authorized.status, 200);
    assert.equal(
      (await db.order.findUnique({ where: { id: foreign.id } })).status,
      OrderStatuses.Cancelled,
    );
    assert.equal(
      (await db.order.findUnique({ where: { id: ready.id } })).status,
      OrderStatuses.Pending,
    );
    pass(
      "scheduled endpoint rejects anonymous requests and expires safe reservations with authenticated access",
    );
    console.log(JSON.stringify({ checks: results.length, results }, null, 2));
    return;
  }

  if (process.argv.includes("--integrity-only")) {
    await db.user.update({
      where: { id: customer.id },
      data: { passwordHash: await hash("Screen-password-123", 10) },
    });
    await command("Network.clearBrowserCookies");
    await visit("/products/screen-product");
    await clickText("Add to Cart");
    await until(
      async () =>
        Boolean(
          await db.cart.findFirst({
            where: { userId: null, items: { some: { productId: product.id } } },
          }),
        ),
      "guest basket persisted",
    );
    const guest = await db.cart.findFirst({
      where: { userId: null, items: { some: { productId: product.id } } },
    });
    await command("Page.navigate", { url: base + "/checkout" });
    await until(
      () =>
        evaluate(
          "location.pathname === '/login' && new URLSearchParams(location.search).get('callbackUrl') === '/checkout'",
        ),
      "checkout login return address",
    );
    await submit("input[name=email]", { email: customer.email, password: "Wrong-password-123" });
    await until(
      () => evaluate("document.body.innerText.includes('Invalid email or password')"),
      "failed login error",
    );
    assert.ok(await db.cart.findUnique({ where: { id: guest.id } }));
    await submit("input[name=email]", { email: customer.email, password: "Screen-password-123" });
    await until(
      () => evaluate("location.pathname === '/checkout'"),
      "successful login returns to checkout",
    );
    assert.equal(await db.cart.findUnique({ where: { id: guest.id } }), null);
    const merged = await db.cart.findUnique({
      where: { userId: customer.id },
      include: { items: true },
    });
    assert.equal(merged.items.find((item) => item.productId === product.id).quantity, 2);
    pass(
      "real login merges the guest basket once and returns to checkout; failed login preserves it",
    );
    await session(owner, Roles.Admin);
    await visit(`/admin/products/${product.id}`);
    assert.equal(await evaluate("Boolean(document.querySelector('input[name=stock]'))"), false);
    await db.product.update({ where: { id: product.id }, data: { stock: { decrement: 1 } } });
    await hydrated("input[name=slug]");
    await evaluate(
      "(() => { const input = document.createElement('input'); input.type='hidden'; input.name='stock'; input.value='not-a-number'; document.querySelector('input[name=slug]').form.append(input); })()",
    );
    await submit("input[name=slug]", { name: "Integrity Product" });
    await until(
      async () =>
        (await db.product.findUnique({ where: { id: product.id } })).name === "Integrity Product",
      "catalog metadata saved",
    );
    assert.equal((await db.product.findUnique({ where: { id: product.id } })).stock, 9);
    pass("stale product edits ignore forged stock and preserve inventory changes");
    await visit(`/admin/products/${product.id}`);
    await submit("input[name=delta]", { delta: "2", reason: "Received two replacement units" });
    await until(
      async () => (await db.inventoryAdjustment.count({ where: { productId: product.id } })) === 1,
      "stock adjustment audited",
    );
    assert.equal((await db.product.findUnique({ where: { id: product.id } })).stock, 11);
    pass("dedicated stock adjustment saves the delta and immutable audit record");
    await visit("/admin/settings");
    assert.equal(
      await evaluate("document.querySelector('input[name=currencyCode]').readOnly"),
      true,
    );
    await submit("input[name=currencyCode]", { currencyCode: "USD", storeName: "Must not save" });
    await until(
      () => evaluate("Boolean(document.querySelector('[data-field-error=currencyCode]'))"),
      "currency field error",
    );
    assert.equal((await db.storeSettings.findFirst()).storeName, "Screen Test Store");
    assert.equal((await db.storeSettings.findFirst()).currencyCode, "BDT");
    pass("locked currency is read-only and forged changes reject the entire settings save");
    console.log(JSON.stringify({ checks: results.length, results }, null, 2));
    return;
  }

  if (process.argv.includes("--promotions-only")) {
    const unselectedCustomer = await db.user.create({
      data: {
        name: "Unselected customer",
        email: "unselected@screen.invalid",
        passwordHash: "unused",
        roles: [Roles.Customer],
      },
    });
    await session(owner, Roles.Admin);
    await visit("/admin/campaigns");
    await clickText("Add campaign");
    await submit("input[name=title]", {
      title: "Weekend Deals Section",
      imageUrl: "/banners/banner-1.svg",
      linkUrl: "",
      active: true,
      flashSale: true,
      showOnHome: true,
    });
    await until(
      async () =>
        Boolean(await db.campaign.findFirst({ where: { title: "Weekend Deals Section" } })),
      "offer section saved",
    );
    const campaign = await db.campaign.findFirst({ where: { title: "Weekend Deals Section" } });
    assert.equal(campaign.showOnHome, true);
    await visit(`/admin/campaigns/${campaign.id}`, "Select products & apply discount");
    await hydrated(`input[type=checkbox][value="${product.id}"]`);
    await evaluate(`document.querySelector('input[type=checkbox][value="${product.id}"]').click()`);
    await submit("input[name=amount]", { amount: "20" });
    await until(
      async () =>
        (await db.campaignProduct.findFirst({ where: { campaignId: campaign.id } }))
          ?.offerPriceCents === 8000,
      "offer products saved",
    );
    await visit("/", "Weekend Deals Section");
    assert.ok(
      await evaluate(
        `document.querySelector('[data-offer-section="${campaign.id}"]').innerText.includes('Tk80')`,
      ),
    );
    await visit("/offers", "Weekend Deals Section");
    assert.ok(
      await evaluate(
        `document.querySelector('[data-offer-section="${campaign.id}"]').innerText.includes('Screen Product')`,
      ),
    );
    pass(
      "admin-created offer section displays its discounted products on the homepage and Offers page",
    );
    await visit("/admin/promotions/new", "Create customer promotion");
    await submit("input[name=title]", { title: "", body: "" });
    await until(
      () =>
        evaluate(
          "Boolean(document.querySelector('[data-field-error=title]')) && Boolean(document.querySelector('[data-field-error=body]'))",
        ),
      "promotion field errors",
    );
    assert.equal(await db.promotion.count(), 0);
    await hydrated("select[name=audience]");
    await evaluate(
      "(() => { const field = document.querySelector('select[name=audience]'); field.value = 'SelectedCustomers'; field.dispatchEvent(new Event('change', { bubbles: true })); })()",
    );
    await until(
      () => evaluate("Boolean(document.querySelector('input[aria-label=\"Find customers\"]'))"),
      "selected audience",
    );
    await evaluate(
      `(() => { const input = document.querySelector('input[aria-label="Find customers"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input, ${JSON.stringify(customer.email)}); input.dispatchEvent(new Event('input', { bubbles: true })); })()`,
    );
    await clickText("Find customers");
    await until(
      () =>
        evaluate(
          "Array.from(document.querySelectorAll('label')).some(label => label.innerText.includes('customer@screen.invalid') && label.querySelector('input[type=checkbox]'))",
        ),
      "customer search result",
    );
    await evaluate(
      "Array.from(document.querySelectorAll('label')).find(label => label.innerText.includes('customer@screen.invalid') && label.querySelector('input[type=checkbox]')).querySelector('input').click()",
    );
    await until(
      () => evaluate("document.querySelectorAll('input[name=selectedUserIds]').length === 1"),
      "recipient selected",
    );
    await submit("input[name=title]", {
      title: "Your weekend beauty offer",
      body: "Enjoy 20% off our selected product collection this weekend.",
      campaignId: campaign.id,
    });
    await until(
      async () =>
        Boolean(await db.promotion.findFirst({ where: { title: "Your weekend beauty offer" } })),
      "promotion draft saved",
    );
    const promotion = await db.promotion.findFirst({
      where: { title: "Your weekend beauty offer" },
    });
    assert.equal(promotion.status, "Draft");
    assert.deepEqual(promotion.selectedUserIds, [customer.id]);
    assert.equal(await db.inboxMessage.count({ where: { promotionId: promotion.id } }), 0);
    await until(
      () =>
        evaluate(
          `location.pathname === '/admin/promotions/${promotion.id}' && document.body.innerText.includes('Review saved version before sending')`,
        ),
      "review draft",
    );
    pass("promotion form validates fields, searches customers and saves a draft without sending");
    await clickText("Send promotion (1)");
    await clickText("Send promotion");
    await until(
      async () =>
        (await db.promotion.findUnique({ where: { id: promotion.id } })).status === "Sent",
      "promotion sent",
    );
    assert.equal(await db.inboxMessage.count({ where: { promotionId: promotion.id } }), 1);
    await until(
      () => evaluate("document.body.innerText.includes('Sent message')"),
      "sent result view",
    );
    pass("explicit send delivers the saved promotion once to the selected customer");
    await session(customer, Roles.Customer);
    await visit("/account/inbox?tab=promotion", "Your weekend beauty offer");
    const message = await db.inboxMessage.findFirst({ where: { promotionId: promotion.id } });
    await until(
      () =>
        evaluate(
          `document.querySelector('[data-inbox-message="${message.id}"]')?.dataset.unread === 'true'`,
        ),
      "customer promotion unread",
    );
    await hydrated(`[data-inbox-message="${message.id}"] button`);
    await evaluate(
      `Array.from(document.querySelectorAll('[data-inbox-message="${message.id}"] button')).find(button => button.innerText.trim() === 'Mark as read').click()`,
    );
    await until(
      async () => Boolean((await db.inboxMessage.findUnique({ where: { id: message.id } })).readAt),
      "customer marks promotion read",
    );
    await visit("/account/inbox?tab=promotion", "Your weekend beauty offer");
    assert.ok(
      await evaluate(
        `document.querySelector('[data-inbox-message="${message.id}"]').dataset.unread === 'false'`,
      ),
    );
    pass("customer inbox displays promotions with shared unread state and read actions");
    await session(unselectedCustomer, Roles.Customer);
    await visit("/account/inbox?tab=promotion", "Inbox");
    assert.equal(
      await evaluate("document.body.innerText.includes('Your weekend beauty offer')"),
      false,
    );
    await session(owner, Roles.Admin);
    await visit(`/admin/promotions/${promotion.id}`, "Sent message");
    assert.equal(
      await evaluate(
        "Array.from(document.querySelectorAll('form')).some(form => form.querySelector('input[name=title]'))",
      ),
      false,
    );
    assert.ok(await evaluate("document.body.innerText.includes('Read')"));
    await visit("/admin/promotions", "Your weekend beauty offer");
    assert.ok(await evaluate("document.querySelector('tbody').innerText.includes('1 / 0')"));
    pass("unselected accounts cannot see the promotion and admin history shows live read totals");
    console.log(`${results.length} promotion/browser checks passed.`);
    return;
  }

  if (process.argv.includes("--campaigns-only")) {
    await session(owner, Roles.Admin);
    await visit("/admin/campaigns", "Campaigns & discounts");
    await clickText("Add campaign");
    await submit("input[name=title]", {
      title: "Screen Flash Offer",
      imageUrl: "/banners/banner-1.svg",
      linkUrl: "",
      active: true,
      flashSale: true,
    });
    await until(
      async () => Boolean(await db.campaign.findFirst({ where: { title: "Screen Flash Offer" } })),
      "campaign saved",
    );
    const campaign = await db.campaign.findFirst({ where: { title: "Screen Flash Offer" } });
    await visit(`/admin/campaigns/${campaign.id}`, "Select products & apply discount");
    await submit("input[name=amount]", { amount: "15" });
    await until(
      () => evaluate("Boolean(document.querySelector('[data-field-error=productIds]'))"),
      "choose product validation",
    );
    assert.equal(await db.campaignProduct.count(), 0);
    await until(
      () =>
        evaluate(`!document.querySelector('input[type=checkbox][value="${product.id}"]').disabled`),
      "product selection ready",
    );
    await evaluate(`document.querySelector('input[type=checkbox][value="${product.id}"]').click()`);
    await until(
      () =>
        evaluate(`document.querySelector('input[type=checkbox][value="${product.id}"]').checked`),
      "product selected",
    );
    await submit("input[name=amount]", { amount: "100" });
    await until(
      () => evaluate("Boolean(document.querySelector('[data-field-error=amount]'))"),
      "discount validation",
    );
    await until(
      () => evaluate("!document.querySelector('input[type=checkbox][name=productIds]').disabled"),
      "discount correction ready",
    );
    assert.equal(
      await evaluate(
        `document.querySelector('input[type=checkbox][value="${product.id}"]').checked`,
      ),
      true,
      "selection retained after validation",
    );
    await submit("input[name=amount]", { amount: "15" });
    await until(
      async () =>
        (await db.campaignProduct.findFirst({ where: { campaignId: campaign.id } }))
          ?.offerPriceCents === 8500,
      "campaign discount persisted",
    );
    await until(
      () => evaluate("document.body.innerText.includes('Campaign products (1)')"),
      "campaign products refreshed",
    );
    pass(
      "campaign creation, product selection and field validation work with persisted percentage discounts",
    );
    await visit(`/products?campaign=${campaign.id}`, "Screen Flash Offer");
    assert.ok(await evaluate("document.body.innerText.includes('Tk85')"));
    await visit("/products?flashSale=1", "Flash Sale");
    assert.ok(
      await evaluate(
        "document.body.innerText.includes('Screen Product') && document.body.innerText.includes('Tk85')",
      ),
    );
    await visit("/products/screen-product", "Screen Product");
    assert.ok(await evaluate("document.body.innerText.includes('Tk85')"));
    pass("campaign collection, flash sale and product detail display the same discounted price");
    await session(customer, Roles.Customer);
    await visit("/cart", "Screen Product");
    assert.ok(await evaluate("document.body.innerText.includes('Tk85')"));
    await visit("/checkout", "Order Summary");
    assert.ok(await evaluate("document.body.innerText.includes('Tk85')"));
    pass("saved customer cart and checkout pull campaign prices");
    await session(owner, Roles.Admin);
    await visit(`/admin/campaigns/${campaign.id}`, "Campaign products (1)");
    await submit("article input[name=amount]", { amount: "75" });
    await until(
      async () =>
        (await db.campaignProduct.findFirst({ where: { campaignId: campaign.id } }))
          ?.offerPriceCents === 7500,
      "individual price saved",
    );
    await visit(`/products?campaign=${campaign.id}`, "Screen Flash Offer");
    assert.ok(await evaluate("document.body.innerText.includes('Tk75')"));
    await visit(`/admin/campaigns/${campaign.id}`);
    await hydrated('button[aria-label="Edit campaign"]');
    await evaluate("document.querySelector('button[aria-label=\"Edit campaign\"]').click()");
    await submit("input[name=title]", { active: false });
    await until(
      async () => !(await db.campaign.findUnique({ where: { id: campaign.id } })).active,
      "campaign deactivated",
    );
    await visit(`/products?campaign=${campaign.id}`, "Campaign unavailable");
    await visit("/products/screen-product", "Screen Product");
    assert.ok(await evaluate("!document.body.innerText.includes('Tk75')"));
    pass(
      "individual offer updates invalidate storefront prices and deactivation withdraws campaign discounts",
    );
    await visit(`/admin/campaigns/${campaign.id}`);
    await clickText("Remove from campaign");
    await until(
      async () => (await db.campaignProduct.count({ where: { campaignId: campaign.id } })) === 0,
      "campaign product removed",
    );
    await until(
      () => evaluate("document.body.innerText.includes('No products yet.')"),
      "removal refreshed",
    );
    pass("removing a campaign product refreshes the saved collection");
    console.log(`${results.length} campaign/browser checks passed.`);
    return;
  }

  if (process.argv.includes("--layout-only")) {
    const ownedCart = await db.cart.findUnique({ where: { userId: customer.id } });
    const products = await Promise.all(
      Array.from({ length: 18 }, (_, index) =>
        db.product.create({
          data: {
            name: `Checkout layout item ${index}`,
            slug: `checkout-layout-${index}`,
            categoryId: category.id,
            priceCents: 100,
            stock: 5,
          },
        }),
      ),
    );
    await db.cartItem.createMany({
      data: products.map((entry) => ({ cartId: ownedCart.id, productId: entry.id, quantity: 1 })),
    });
    await db.wallet.create({ data: { userId: customer.id, balanceCents: 1000 } });
    await db.address.create({
      data: {
        userId: customer.id,
        name: "Checkout Receiver",
        phone: "01700000000",
        line1: "Checkout Street",
        city: "Dhaka",
        isDefault: true,
      },
    });
    await session(customer, Roles.Customer);
    await command("Emulation.setDeviceMetricsOverride", {
      width: 1366,
      height: 768,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await visit("/checkout", "Order Summary");
    const bounds = await evaluate(
      "({height:document.documentElement.scrollHeight,viewport:innerHeight,width:document.documentElement.scrollWidth,viewportWidth:innerWidth,submit:document.querySelector('[data-checkout-submit]').getBoundingClientRect().bottom})",
    );
    assert.ok(bounds.height <= bounds.viewport + 1, JSON.stringify(bounds));
    assert.ok(bounds.width <= bounds.viewportWidth);
    assert.ok(bounds.submit <= bounds.viewport);
    assert.equal(await evaluate("Boolean(document.querySelector('header.sticky,footer'))"), false);
    const checkoutPreview = await command("Page.captureScreenshot", { format: "png" });
    await writeFile(
      path.join(tmpdir(), "storelaunch-compact-checkout.png"),
      Buffer.from(checkoutPreview.data, "base64"),
    );
    pass(
      "desktop checkout fits 1366x768 with wallet options and a long order, submit stays visible",
    );
    await submit("input[name=name]", { name: "", phone: "bad", line1: "", city: "" });
    await until(
      () => evaluate("Boolean(document.querySelector('[data-field-error=name]'))"),
      "compact checkout validation",
    );
    assert.ok(
      await evaluate(
        "document.documentElement.scrollHeight <= innerHeight + 1 && document.querySelector('[data-checkout-submit]').getBoundingClientRect().bottom <= innerHeight",
      ),
    );
    pass("checkout validation remains field-wise without pushing the submit button offscreen");
    await command("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await visit("/checkout", "Order Summary");
    assert.ok(await evaluate("document.documentElement.scrollWidth <= innerWidth"));
    await evaluate("window.scrollTo(0,500)");
    await until(
      () => evaluate("Boolean(document.querySelector('[data-scroll-top]'))"),
      "scroll to top appears",
    );
    await evaluate("document.querySelector('[data-scroll-top]').click()");
    await until(
      () => evaluate("scrollY < 2 && !document.querySelector('[data-scroll-top]')"),
      "scroll to top action",
    );
    pass("mobile checkout remains readable and floating back-to-top control works");
    await visit("/account");
    await submit("input[name=name]", { name: "Toast Customer" });
    await until(
      () =>
        evaluate(
          "Array.from(document.querySelectorAll('[data-toast-stack] [role=status]')).some(node => node.innerText.includes('Profile updated'))",
        ),
      "customer profile toast",
    );
    assert.equal((await db.user.findUnique({ where: { id: customer.id } })).name, "Toast Customer");
    pass("customer profile save persists and shows a success toast");
    await session(riderUser, Roles.Rider);
    await visit("/rider/profile");
    assert.equal(
      await evaluate(
        "Array.from(document.querySelectorAll('main button')).some(button => button.innerText.trim() === 'Logout')",
      ),
      false,
    );
    await submit("input[name=name]", { name: "Toast Rider" });
    await until(
      () =>
        evaluate(
          "Array.from(document.querySelectorAll('[data-toast-stack] [role=status]')).some(node => node.innerText.includes('Profile updated'))",
        ),
      "rider profile toast",
    );
    assert.equal((await db.rider.findUnique({ where: { id: rider.id } })).name, "Toast Rider");
    pass("rider profile logout section is removed and profile save shows a success toast");
    console.log(`${results.length} layout/profile/browser checks passed.`);
    return;
  }
  if (process.argv.includes("--cart-only")) {
    const secondary = await db.product.create({
      data: {
        name: "Cart Selection Product",
        slug: "cart-selection-product",
        categoryId: category.id,
        priceCents: 1000,
        salePriceCents: 500,
        stock: 20,
      },
    });
    const ownedCart = await db.cart.findUnique({
      where: { userId: customer.id },
      include: { items: true },
    });
    const secondaryLine = await db.cartItem.create({
      data: { cartId: ownedCart.id, productId: secondary.id, quantity: 2 },
    });
    await session(owner, Roles.Admin);
    await visit("/admin/settings");
    await submit("input[name=storeName]", {
      deliveryFeeCents: "1500",
      freeShippingOverCents: "15000",
    });
    await until(
      () => evaluate("document.body.innerText.includes('Settings saved.')"),
      "cart delivery settings saved",
    );
    await db.address.create({
      data: {
        userId: customer.id,
        type: AddressTypes.OFFICE,
        name: "Cart Receiver",
        phone: "01700000000",
        line1: "Saved Office Road",
        city: "Dhaka",
        isDefault: true,
      },
    });
    const nextAddress = await db.address.create({
      data: {
        userId: customer.id,
        type: AddressTypes.HOME,
        name: "Home Receiver",
        phone: "01700000001",
        line1: "Saved Home Road",
        city: "Dhaka",
      },
    });
    await session(customer, Roles.Customer);
    await visit("/");
    await hydrated("header button[aria-label=Cart]");
    await hydrated("[data-cart-drawer]");
    await evaluate(
      "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
    );
    await evaluate("document.querySelector('header button[aria-label=Cart]').click()");
    await until(
      () =>
        evaluate("document.querySelectorAll('[data-cart-drawer] [data-cart-item]').length === 2"),
      "drawer loaded",
    );
    assert.equal(
      await evaluate("document.querySelector('[data-cart-payable]').innerText"),
      "Tk125",
    );
    assert.ok(
      await evaluate(
        "Array.from(document.querySelectorAll('[data-cart-drawer]')).find(node => node.getClientRects().length > 0 && !node.inert).innerText.includes('Saved Office Road')",
      ),
    );
    const preview = await command("Page.captureScreenshot", { format: "png" });
    await writeFile(
      path.join(tmpdir(), "storelaunch-cart-drawer-preview.png"),
      Buffer.from(preview.data, "base64"),
    );
    pass(
      "reference cart layout shows real saved address, discounts and delivery-inclusive payable",
    );
    await evaluate(
      `document.querySelector('[data-cart-item="${ownedCart.items[0].id}"] input[type=checkbox]').click()`,
    );
    await until(
      async () =>
        !(await db.cartItem.findUnique({ where: { id: ownedCart.items[0].id } })).selected,
      "deselect item",
    );
    await until(
      () => evaluate("document.querySelector('[data-cart-payable]').innerText === 'Tk25'"),
      "selection totals",
    );
    const quantityButton = (direction) =>
      `[data-cart-item="${secondaryLine.id}"] [data-quantity-${direction}]`;
    const changeQuantity = async (direction, quantity) => {
      await until(
        () =>
          evaluate(
            `!!document.querySelector('${quantityButton(direction)}') && !document.querySelector('${quantityButton(direction)}').disabled`,
          ),
        "quantity control ready",
      );
      await evaluate(`document.querySelector('${quantityButton(direction)}').click()`);
      await until(
        async () =>
          (await db.cartItem.findUnique({ where: { id: secondaryLine.id } })).quantity === quantity,
        "drawer quantity saved",
      );
    };
    await changeQuantity("decrease", 1);
    await until(
      () => evaluate(`document.querySelector('${quantityButton("decrease")}').disabled`),
      "minimum quantity enforced",
    );
    await changeQuantity("increase", 2);
    await changeQuantity("increase", 3);
    await until(
      async () =>
        (await db.cartItem.findUnique({ where: { id: secondaryLine.id } })).quantity === 3,
      "drawer quantity saved",
    );
    await until(
      () => evaluate("document.querySelector('[data-cart-payable]').innerText === 'Tk30'"),
      "quantity totals",
    );
    pass("item selection and quantity persist and recalculate shipping/payable");
    await clickText("Change");
    await until(
      () =>
        evaluate(
          "Array.from(document.querySelectorAll('[data-cart-drawer] button')).some(button => button.innerText.includes('Saved Home Road') && !button.disabled)",
        ),
      "address picker ready",
    );
    await evaluate(
      "Array.from(document.querySelectorAll('[data-cart-drawer] button')).find(button => button.innerText.includes('Saved Home Road')).click()",
    );
    try {
      await until(
        () =>
          evaluate(
            "Array.from(document.querySelectorAll('[data-cart-drawer]')).some(node => node.getClientRects().length > 0 && !node.inert && !node.innerText.includes('Choose delivery address') && node.innerText.includes('Saved Home Road'))",
          ),
        "changed cart address",
      );
    } catch (error) {
      console.log(
        "Cart address debug:",
        await evaluate(
          "Array.from(document.querySelectorAll('[data-cart-drawer]')).map(node => ({ inert: node.inert, rects: node.getClientRects().length, text: node.innerText }))",
        ),
      );
      throw error;
    }
    await clickText("Checkout (3)");
    await until(
      () =>
        evaluate(
          "location.pathname === '/checkout' && Boolean(document.querySelector('input[name=line1]'))",
        ),
      "selected checkout",
    );
    assert.equal(
      await evaluate("document.querySelector('input[name=line1]').value"),
      nextAddress.line1,
    );
    assert.equal(
      await evaluate("document.querySelector('aside').innerText.includes('Screen Product')"),
      false,
    );
    assert.ok(
      await evaluate(
        "document.querySelector('aside').innerText.includes('Cart Selection Product')",
      ),
    );
    pass("only selected items reach checkout and chosen address pre-fills the form");
    await visit("/");
    await evaluate("window.dispatchEvent(new CustomEvent('cart:open'))");
    await until(
      () => evaluate("Boolean(document.querySelector('[data-cart-checkout]'))"),
      "reopened drawer",
    );
    await evaluate(
      "document.querySelector('[data-cart-drawer] input[aria-label=\"Select all\"]').click()",
    );
    await until(
      async () =>
        (await db.cartItem.count({ where: { cartId: ownedCart.id, selected: true } })) === 2,
      "select all",
    );
    await until(
      () => evaluate("!document.querySelector('[data-cart-checkout]').disabled"),
      "selection ready",
    );
    await evaluate(
      "document.querySelector('[data-cart-drawer] button[aria-label=\"Remove selected items\"]').click()",
    );
    await until(
      async () => (await db.cartItem.count({ where: { cartId: ownedCart.id } })) === 0,
      "bulk removal",
    );
    await until(
      () =>
        evaluate(
          "Array.from(document.querySelectorAll('[data-cart-drawer]')).find(node => node.getClientRects().length > 0 && !node.inert).innerText.includes('Your cart is empty')",
        ),
      "empty drawer",
    );
    pass("select all and bulk removal update saved cart and show empty state");
    await command("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
    });
    assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth"), true);
    pass("cart drawer fits the mobile viewport");
    console.log(`${results.length} cart/browser checks passed.`);
    return;
  }
  if (process.argv.includes("--settings-only")) {
    await session(owner, Roles.Admin);
    await visit("/admin/settings", "Header announcement");
    await submit("input[name=storeName]", {
      headerAnnouncement: "x".repeat(201),
      headerSupportLabel: "x".repeat(61),
    });
    await until(
      () =>
        evaluate(
          "Boolean(document.querySelector('[data-field-error=headerAnnouncement]')) && Boolean(document.querySelector('[data-field-error=headerSupportLabel]'))",
        ),
      "announcement field validation",
    );
    assert.equal((await db.storeSettings.findFirst()).headerAnnouncement, null);
    pass("announcement fields enforce server length validation beside each field");
    await submit("input[name=storeName]", {
      headerAnnouncement: "Delivery across Bangladesh in 48 hours",
      headerSupportLabel: "Call our team",
      contactPhone: "+8801712345678",
    });
    await until(
      async () =>
        (await db.storeSettings.findFirst()).headerAnnouncement ===
        "Delivery across Bangladesh in 48 hours",
      "announcement saved",
    );
    await visit("/admin/settings", "Header announcement");
    assert.equal(
      await evaluate("document.querySelector('input[name=headerAnnouncement]').value"),
      "Delivery across Bangladesh in 48 hours",
    );
    await visit("/", "Delivery across Bangladesh in 48 hours");
    assert.ok(
      await evaluate(
        "document.querySelector('.announcement-marquee').innerText.includes('Call our team +8801712345678')",
      ),
    );
    pass("custom announcement and support details save, reload and propagate to header");
    await visit("/admin/settings");
    await submit("input[name=storeName]", {
      headerAnnouncement: "",
      headerSupportLabel: "",
      contactPhone: "",
      deliveryEstimate: "36 HOURS",
    });
    await until(
      async () => (await db.storeSettings.findFirst()).headerAnnouncement === null,
      "announcement cleared",
    );
    await visit("/", "36 HOURS");
    assert.ok(
      !(await evaluate(
        "document.querySelector('.announcement-marquee').innerText.includes('Call our team')",
      )),
    );
    pass("blank overrides restore default delivery wording and blank phone hides support");
    console.log(`${results.length} settings/browser checks passed.`);
    return;
  }

  if (process.argv.includes("--chat-only")) {
    // A multi-role account picks Support at login and lands in the portal.
    await db.user.update({
      where: { id: support.id },
      data: { passwordHash: await hash("Screen-password-123", 10) },
    });
    await command("Network.clearBrowserCookies");
    await visit("/login");
    await submit("input[name=email]", { email: support.email, password: "Screen-password-123" });
    await until(
      () =>
        evaluate(
          "document.body.innerText.includes('Support') && document.body.innerText.includes('Choose how to continue')",
        ),
      "role chooser with support label",
    );
    await clickText("Support");
    await until(() => evaluate("location.pathname === '/support'"), "support login destination");
    pass("support login shows the role chooser and lands on the support portal");

    // Customer opens a conversation from the account chat screen.
    await session(customer, Roles.Customer);
    await visit("/account/chat", "Chat with support");
    await submit("textarea[name=body]", {
      subject: "Delivery question",
      body: "Where is my order SCREEN001?",
    });
    await until(
      async () =>
        (await db.chatConversation.count({
          where: { customerId: customer.id, status: ChatConversationStatuses.Open },
        })) === 1,
      "conversation created",
    );
    const conversation = await db.chatConversation.findFirst({
      where: { customerId: customer.id },
    });
    await visit("/account/chat", "Where is my order SCREEN001?");
    pass("customer starts a support conversation from the chat screen");

    // Agent claims the queue item and replies from the portal.
    await session(support, Roles.Support);
    await visit("/support", "Screen Customer");
    await until(
      () => evaluate("document.querySelector('main').innerText.includes('Unassigned')"),
      "queue unassigned badge",
    );
    await clickText("Take");
    await until(
      () => evaluate(`location.pathname === '/support/conversation/${conversation.id}'`),
      "taken conversation screen",
    );
    await submit("textarea[name=body]", { body: "Your parcel left our warehouse this morning" });
    await until(
      async () =>
        (await db.chatMessage.count({
          where: { conversationId: conversation.id, senderRole: Roles.Support },
        })) === 1,
      "agent reply saved",
    );
    await visit("/support/conversation/" + conversation.id, "Where is my order SCREEN001?");
    pass("agent claims the conversation from the queue and replies in the portal");

    // Customer sees the reply and the unread badge clears once the thread is read.
    await session(customer, Roles.Customer);
    await visit("/account");
    await until(
      () => evaluate("document.querySelector('[data-chat-unread]')?.innerText === '1'"),
      "customer chat unread badge",
    );
    await visit("/account/chat", "Your parcel left our warehouse this morning");
    await visit("/account");
    await until(
      () => evaluate("!document.querySelector('[data-chat-unread]')"),
      "customer chat unread badge cleared",
    );
    pass("customer sees the agent reply and the chat unread badge clears after reading");

    // A customer session cannot open the portal; a support session outside it is sent back.
    await command("Page.navigate", { url: base + "/support" });
    await until(() => evaluate("location.pathname === '/login'"), "customer blocked from /support");
    await session(support, Roles.Support);
    await command("Page.navigate", { url: base + "/account" });
    await until(() => evaluate("location.pathname === '/support'"), "support locked to /support");
    pass("role locks keep customers out of the portal and support agents inside it");

    // Agent closes the thread; the customer can then start a fresh conversation.
    await visit(`/support/conversation/${conversation.id}`);
    await clickText("Close conversation");
    await until(
      async () =>
        (await db.chatConversation.findUnique({ where: { id: conversation.id } })).status ===
        ChatConversationStatuses.Closed,
      "conversation closed",
    );
    await visit("/support/closed", "Screen Customer");
    await session(customer, Roles.Customer);
    await visit("/account/chat", "Chat with support");
    await submit("textarea[name=body]", { subject: "", body: "I have one more question" });
    await until(
      async () =>
        (await db.chatConversation.count({
          where: { customerId: customer.id, status: ChatConversationStatuses.Open },
        })) === 1,
      "fresh conversation after close",
    );
    pass("agent closes the conversation, it lands in history and the customer can reopen chat");

    for (const route of [
      "/support",
      "/support/closed",
      "/support/tickets",
      "/support/orders",
      "/support/customers",
      "/support/search?q=SCREEN001",
    ]) {
      await session(support, Roles.Support);
      await visit(route);
      pass(`support screen ${route}`);
    }
    console.log(JSON.stringify({ checks: results.length, results }, null, 2));
    return;
  }
  for (const route of [
    "/",
    "/products",
    "/products/screen-product",
    "/categories/screen-category",
    "/brands/screen-brand",
    "/login",
    "/register",
    "/blog",
    "/career",
    "/faq",
    "/privacy",
    "/returns",
    "/terms",
  ]) {
    await visit(route);
    pass(`public screen ${route}`);
  }
  await visit("/products");
  await submit('header form[role="search"] input[name="q"]', { q: "Screen Brand" });
  await until(
    () =>
      evaluate(
        "location.pathname === '/products' && new URLSearchParams(location.search).get('q') === 'Screen Brand' && Boolean(document.querySelector('main')?.innerText.includes('Screen Product'))",
      ),
    "header brand search",
  );
  assert.equal(
    await evaluate("document.querySelector('header input[name=q]').value"),
    "Screen Brand",
  );
  await visit("/products?q=screen%20product&sort=price-asc&page=999999", "Screen Product");
  await visit("/products?q=no-matching-products", "No products found");
  pass(
    "header search finds brands/products, retains the query and handles empty/out-of-range results",
  );
  await visit("/login");
  await submit("input[name=email]", { email: "", password: "" });
  await until(
    () =>
      evaluate(
        "Boolean(document.querySelector('[data-field-error=email]')) && Boolean(document.querySelector('[data-field-error=password]'))",
      ),
    "login field validation",
  );
  assert.equal(
    await evaluate(
      "document.querySelector('[data-field-error=email]').closest('label') === document.querySelector('input[name=email]').closest('label')",
    ),
    true,
  );
  assert.equal(await evaluate("document.querySelectorAll('form > [role=alert]').length"), 0);
  pass("login shows errors at email and password fields without a combined banner");
  await visit("/register");
  await submit("input[name=email]", { name: " ", email: "invalid-email", password: "short" });
  await until(
    () =>
      evaluate(
        "Boolean(document.querySelector('[data-field-error=email]')) && Boolean(document.querySelector('[data-field-error=password]'))",
      ),
    "registration validation text",
  );
  pass("registration displays server field validation without relying on browser checks");
  await visit("/register");
  await submit("input[name=email]", {
    name: "Confirmation Check",
    email: "confirmation@screen.invalid",
    password: "test-password-123",
    confirmPassword: "different-password",
  });
  await until(
    () => evaluate("document.body.innerText.includes('Passwords do not match')"),
    "confirmation mismatch validation",
  );
  assert.equal(await db.user.count({ where: { email: "confirmation@screen.invalid" } }), 0);
  pass("registration blocks mismatched passwords and shows confirmation error");
  await submit("input[name=email]", {
    name: "Confirmation Check",
    email: "confirmation@screen.invalid",
    password: "test-password-123",
    confirmPassword: "",
  });
  await until(
    () => evaluate("document.body.innerText.includes('Re-enter your password')"),
    "required confirmation validation",
  );
  assert.equal(await db.user.count({ where: { email: "confirmation@screen.invalid" } }), 0);
  pass("registration requires password confirmation before creating an account");
  await session(customer, Roles.Customer);
  await visit("/account/orders?q=SCREEN001", "SCREEN001");
  await visit("/account/orders?q=no-such-order", "No matches found");
  pass("customer order search finds only the signed-in account's orders");
  await visit("/account/inbox", "Promotion");
  const offer = await db.campaign.create({
    data: { title: "Inbox test offer", imageUrl: "/offer.png", linkUrl: "/products", active: true },
  });
  const notice = await db.inboxMessage.create({
    data: {
      userId: customer.id,
      category: InboxCategories.NOTIFICATION,
      title: "Customer-only update",
      body: "A private delivery update",
      href: "/account/orders/SCREEN001",
      sourceKey: "screen:notification",
    },
  });
  const otherNotice = await db.inboxMessage.create({
    data: {
      userId: riderUser.id,
      category: InboxCategories.NOTIFICATION,
      title: "Other account private",
      body: "Private",
      sourceKey: "screen:other",
    },
  });
  await visit("/account/inbox", "Inbox test offer");
  await until(
    () =>
      evaluate("Number(document.querySelector('[data-inbox-unread]').dataset.inboxUnread) >= 2"),
    "inbox unread total",
  );
  const offerMessage = await db.inboxMessage.findUnique({
    where: { userId_sourceKey: { userId: customer.id, sourceKey: `campaign:${offer.id}` } },
  });
  assert.ok(offerMessage);
  if (process.argv.includes("--inbox-only")) {
    const screenshot = await command("Page.captureScreenshot", { format: "png" });
    await writeFile(
      path.join(tmpdir(), "storelaunch-inbox-preview.png"),
      Buffer.from(screenshot.data, "base64"),
    );
  }
  await hydrated(`[data-inbox-message="${offerMessage.id}"] button`);
  await evaluate(
    `document.querySelector('[data-inbox-message="${offerMessage.id}"] button:not([name])').closest('li').querySelectorAll('button')[1].click()`,
  );
  await until(
    async () =>
      Boolean((await db.inboxMessage.findUnique({ where: { id: offerMessage.id } })).readAt),
    "mark promotion read",
  );
  await visit("/account/inbox", "Inbox test offer");
  assert.equal(
    await evaluate(
      `document.querySelector('[data-inbox-message="${offerMessage.id}"]').dataset.unread`,
    ),
    "false",
  );
  await clickText("Mark as unread");
  await until(
    async () => !(await db.inboxMessage.findUnique({ where: { id: offerMessage.id } })).readAt,
    "mark promotion unread",
  );
  await clickText("Mark all as read");
  await until(
    async () =>
      (await db.inboxMessage.count({
        where: { userId: customer.id, category: InboxCategories.PROMOTION, readAt: null },
      })) === 0,
    "mark promotion tab read",
  );
  assert.equal((await db.inboxMessage.findUnique({ where: { id: notice.id } })).readAt, null);
  pass("promotion read/unread state persists and bulk read is scoped to the selected tab");
  await visit("/account/inbox?tab=notification", "Customer-only update");
  assert.equal(
    await evaluate("document.querySelector('main').innerText.includes('Other account private')"),
    false,
  );
  await hydrated(`[data-inbox-message="${notice.id}"] button`);
  await evaluate(
    `(() => {const form=document.querySelector('[data-inbox-message="${notice.id}"]').querySelectorAll('form')[1];form.elements.namedItem('id').value=${JSON.stringify(otherNotice.id)};form.requestSubmit();})()`,
  );
  await until(
    () => evaluate("document.querySelector('main').innerText.includes('Message not found')"),
    "foreign inbox message rejection",
  );
  assert.equal((await db.inboxMessage.findUnique({ where: { id: otherNotice.id } })).readAt, null);
  pass("inbox rejects forged message IDs and never exposes another account's messages");
  await visit("/account/inbox?tab=notification", "Customer-only update");
  await clickText("Mark all as read");
  await until(
    async () =>
      (await db.inboxMessage.count({ where: { userId: customer.id, readAt: null } })) === 0,
    "all notification read",
  );
  await visit("/account/inbox?tab=notification&filter=unread", "You're all caught up");
  assert.equal(
    await evaluate("document.querySelector('[data-inbox-unread]').dataset.inboxUnread"),
    "0",
  );
  assert.equal(
    await evaluate(
      "document.querySelector('header a[href=\"/account/inbox\"]').innerText.includes('0')",
    ),
    true,
  );
  pass("unread filter, empty state and header count reflect saved inbox state");
  await command("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await visit("/account/inbox?tab=notification", "Customer-only update");
  assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth"), true);
  await command("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await hydrated(`[data-inbox-message="${notice.id}"] button`);
  await evaluate(
    `document.querySelector('[data-inbox-message="${notice.id}"]').querySelectorAll('form')[1].requestSubmit()`,
  );
  await until(
    async () => !(await db.inboxMessage.findUnique({ where: { id: notice.id } })).readAt,
    "notification unread",
  );
  await until(
    () =>
      evaluate(
        `document.querySelector('[data-inbox-message="${notice.id}"]').dataset.unread === 'true'`,
      ),
    "notification unread UI",
  );
  await evaluate(
    `document.querySelector('[data-inbox-message="${notice.id}"]').querySelector('form').requestSubmit()`,
  );
  await until(
    () => evaluate("location.pathname === '/account/orders/SCREEN001'"),
    "view inbox destination",
  );
  assert.ok((await db.inboxMessage.findUnique({ where: { id: notice.id } })).readAt);
  pass("mobile inbox fits the screen and viewing a destination marks its message read");
  await db.campaign.update({ where: { id: offer.id }, data: { active: false } });
  if (process.argv.includes("--inbox-only")) {
    console.log(`${results.length} inbox/browser checks passed.`);
    return;
  }
  for (const route of [
    "/account",
    "/account/addresses",
    "/account/notifications",
    "/account/orders",
    "/account/orders/SCREEN001",
    "/account/products",
    "/account/rate",
    "/account/refer",
    "/account/report",
    "/account/reviews",
    "/account/rider-review",
    "/account/suggest",
    "/account/wallet",
    "/account/wishlists",
    "/checkout",
    "/order/SCREEN001/result",
  ]) {
    await visit(route);
    pass(`customer screen ${route}`);
  }
  await visit("/account");
  await submit("input[name=name]", { name: " ", dateOfBirth: "2999-01-01" });
  await until(
    () =>
      evaluate(
        "['name','dateOfBirth'].every(name => document.querySelector('[data-field-error=' + name + ']'))",
      ),
    "profile validation text",
  );
  assert.equal((await db.user.findUnique({ where: { id: customer.id } })).name, "Screen Customer");
  pass("profile rejects whitespace and future dates without saving");
  assert.equal(await evaluate("Boolean(document.querySelector('input[name=phone]'))"), false);
  await submit("input[name=name]", {
    name: "Saved Customer",
    gender: AddressTypes.OTHER,
    dateOfBirth: "2000-02-03",
  });
  await until(
    async () =>
      (await db.user.findUnique({ where: { id: customer.id } })).name === "Saved Customer",
    "profile save",
  );
  await visit("/account");
  assert.equal(
    await evaluate("document.querySelector('input[name=name]').value"),
    "Saved Customer",
  );
  assert.equal((await db.user.findUnique({ where: { id: customer.id } })).phone, null);
  assert.equal(await evaluate("Boolean(document.querySelector('input[name=phone]'))"), false);
  pass("customer profile saves and reloads while mobile stays read-only in the form");
  const avatarFile = path.join(profile, "profile-photo.png");
  const sharp = (await import("sharp")).default;
  await sharp({ create: { width: 32, height: 32, channels: 3, background: "#336699" } })
    .png()
    .toFile(avatarFile);
  async function attachAvatar(file) {
    await hydrated('input[name="profilePhoto"]');
    const dom = await command("DOM.getDocument");
    const input = await command("DOM.querySelector", {
      nodeId: dom.root.nodeId,
      selector: 'input[name="profilePhoto"]',
    });
    await command("DOM.setFileInputFiles", { nodeId: input.nodeId, files: [file] });
  }
  const invalidAvatarFile = path.join(profile, "invalid-avatar.png");
  await writeFile(invalidAvatarFile, "This is not a PNG image");
  await attachAvatar(invalidAvatarFile);
  await submit("input[name=name]", { name: "Must Not Save" });
  await until(
    () => evaluate("Boolean(document.querySelector('[data-field-error=profilePhoto]'))"),
    "invalid avatar feedback",
  );
  assert.equal((await db.user.findUnique({ where: { id: customer.id } })).name, "Saved Customer");
  pass("invalid profile image shows a field error and prevents partial profile saves");
  await visit("/account");
  await attachAvatar(avatarFile);
  await submit("input[name=name]", { name: "Saved Customer" });
  await until(
    async () =>
      Boolean((await db.user.findUnique({ where: { id: customer.id } })).profilePhotoVersion),
    "customer photo save",
  );
  await visit("/account");
  assert.equal(await evaluate("fetch('/api/account/photo').then(r => r.status)"), 200);
  assert.equal(
    await evaluate(
      "document.querySelector('img[alt=\"Profile photo\"]').complete && document.querySelector('img[alt=\"Profile photo\"]').naturalWidth > 0",
    ),
    true,
  );
  pass("customer uploads a profile photo and sees it after reload");
  await visit("/account/suggest");
  await submit("textarea[name=message]", { message: " " });
  await until(
    () => evaluate("Boolean(document.querySelector('[data-field-error=message]'))"),
    "feedback validation text",
  );
  assert.equal(await db.feedback.count(), 0);
  pass("suggestions reject blank content and show validation text");
  await submit("textarea[name=message]", { message: "Persist this product suggestion" });
  await until(
    async () => (await db.feedback.count({ where: { userId: customer.id } })) === 1,
    "suggestion save",
  );
  await visit("/account/suggest", "Persist this product suggestion");
  pass("suggestion saves and reloads in history");
  await visit("/account/addresses");
  await clickText("+ Add address");
  await submit("input[name=line1]", { name: " ", phone: "bad", line1: " ", city: " " });
  await until(
    () =>
      evaluate(
        "Boolean(document.querySelector('[data-field-error=line1]')) && Boolean(document.querySelector('[data-field-error=city]'))",
      ),
    "address validation text",
  );
  assert.equal(await db.address.count(), 0);
  pass("address validation errors are visible and do not save invalid records");
  await submit("input[name=line1]", {
    name: "Home Address",
    phone: "01700000000",
    line1: "Saved Home Road",
    city: "Dhaka",
    isDefault: true,
  });
  await until(
    async () => (await db.address.count({ where: { userId: customer.id } })) === 1,
    "address create",
  );
  await visit("/account/addresses", "Saved Home Road");
  pass("address creates and reloads");
  const firstAddress = await db.address.findFirst({ where: { userId: customer.id } });
  await db.address.create({
    data: {
      userId: customer.id,
      name: "Office Address",
      phone: "01700000000",
      line1: "Office Road",
      city: "Dhaka",
      isDefault: true,
    },
  });
  await visit("/account/addresses");
  await hydrated("button");
  await evaluate(
    "Array.from(document.querySelectorAll('li')).find(li => li.innerText.includes('Saved Home Road')).querySelector('button.btn-outline').click()",
  );
  await submit("input[name=line1]", { line1: "Updated Home Road", isDefault: true });
  await until(
    async () =>
      (await db.address.findUnique({ where: { id: firstAddress.id } })).line1 ===
      "Updated Home Road",
    "address edit",
  );
  assert.equal(await db.address.count({ where: { userId: customer.id, isDefault: true } }), 1);
  await visit("/account/addresses", "Updated Home Road");
  pass("editing default address clears the previous default and reloads");
  await visit("/products/screen-product");
  await hydrated("button[aria-label=wishlist]");
  await evaluate("document.querySelector('button[aria-label=wishlist]').click()");
  await until(
    async () => (await db.wishlist.count({ where: { userId: customer.id } })) === 1,
    "wishlist save",
  );
  await visit("/account/wishlists", "Screen Product");
  pass("wishlist saves and pulls into account screen");
  await visit("/products/sold-out");
  await clickText("Notify me when available");
  await until(
    async () => (await db.stockNotification.count({ where: { userId: customer.id } })) === 1,
    "notification save",
  );
  await visit("/account/notifications", "Sold Out");
  pass("stock notification subscription saves and reloads");
  for (const [route, model, message] of [
    ["/account/reviews", "review", "Saved product review"],
    ["/account/rider-review", "riderReview", "Saved rider review"],
  ]) {
    await visit(route);
    await clickText("Write review");
    await hydrated('button[aria-label="5 stars"]');
    await evaluate(`document.querySelector('button[aria-label="5 stars"]').click()`);
    await until(
      () => evaluate("document.querySelector('input[name=rating]').value === '5'"),
      "review rating",
    );
    await submit("textarea[name=body]", { body: "x".repeat(2001) });
    await until(
      () => evaluate("document.body.innerText.includes('2000 characters')"),
      `${model} validation text`,
    );
    assert.equal(await db[model].count({ where: { userId: customer.id } }), 0);
    pass(`${model} rejects oversized review and displays validation text`);
    await submit("textarea[name=body]", { body: message });
    await until(
      async () => (await db[model].count({ where: { userId: customer.id } })) === 1,
      `${model} save`,
    );
    await visit(route, message);
    pass(`${model} saves and reloads`);
  }
  await visit("/checkout");
  await submit("input[name=line1]", {
    name: "Saved Customer",
    phone: "bad",
    line1: " ",
    city: "Dhaka",
    paymentMethod: PaymentMethods.COD,
  });
  await until(
    () =>
      evaluate(
        "Boolean(document.querySelector('[data-field-error=phone]')) && Boolean(document.querySelector('[data-field-error=line1]'))",
      ),
    "checkout validation text",
  );
  assert.equal(await db.order.count({ where: { userId: customer.id } }), 1);
  pass("checkout blocks invalid address and phone with visible errors");
  await submit("input[name=line1]", {
    name: "Saved Customer",
    phone: "01700000000",
    line1: "Checkout Road",
    city: "Dhaka",
    paymentMethod: PaymentMethods.COD,
    additionalInfo: "x".repeat(1001),
  });
  await until(
    () => evaluate("Boolean(document.querySelector('[data-field-error=additionalInfo]'))"),
    "additional info server validation",
  );
  await submit("input[name=line1]", {
    name: "Saved Customer",
    phone: "01700000000",
    line1: "Checkout Road",
    city: "Dhaka",
    paymentMethod: PaymentMethods.COD,
    additionalInfo: "Call before delivery. Leave at office reception.",
  });
  await until(
    async () => (await db.order.count({ where: { userId: customer.id } })) === 2,
    "checkout save",
  );
  const placed = await db.order.findFirst({
    where: { userId: customer.id, number: { not: order.number } },
  });
  assert.equal(placed.additionalInfo, "Call before delivery. Leave at office reception.");
  await visit("/account/orders", "Call before delivery. Leave at office reception.");
  await visit(
    `/account/orders/${placed.number}`,
    "Call before delivery. Leave at office reception.",
  );
  pass(
    "checkout validates and saves additional info, which reloads in customer order cards and details",
  );
  await visit(`/account/orders/${placed.number}`, "Checkout Road");
  assert.equal((await db.product.findUnique({ where: { id: product.id } })).stock, 9);
  pass("COD checkout persists order, clears cart and reloads order detail");

  await session(owner, Roles.Admin);
  await visit("/admin/search?q=screen", "Screen Product");
  assert.equal(
    await evaluate(
      "Boolean(document.querySelector('[data-search-kind=products]')) && Boolean(document.querySelector('[data-search-kind=brands]')) && Boolean(document.querySelector('[data-search-kind=orders]'))",
    ),
    true,
  );
  pass("admin search spans products, brands and order records");
  await command("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await visit("/admin?range=7", "Store overview");
  assert.equal(await evaluate("document.querySelector('[data-admin-dashboard]') !== null"), true);
  await clickText("Orders");
  assert.equal(
    await evaluate(
      "Array.from(document.querySelectorAll('button')).find(b => b.innerText === 'Orders').getAttribute('aria-pressed')",
    ),
    "true",
  );
  await clickText("Refresh");
  await visit("/admin?range=90", "Last 90 days");
  assert.equal(
    await evaluate(
      "document.querySelector('nav[aria-label=\"Dashboard period\"] a[aria-current=page]').innerText",
    ),
    "Last 90 days",
  );
  await command("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth"), true);
  await command("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  const dashboardPreview = await command("Page.captureScreenshot", { format: "png" });
  await writeFile(
    path.join(tmpdir(), "storelaunch-admin-dashboard-preview.png"),
    Buffer.from(dashboardPreview.data, "base64"),
  );
  await visit("/admin/orders?queue=payment", "Awaiting online payment");
  assert.equal(
    await evaluate(
      `document.querySelector('main').innerText.includes(${JSON.stringify(placed.number)})`,
    ),
    false,
  );
  await visit("/admin/products?stock=out", "Active products with zero stock");
  pass("admin dashboard range, chart mode, refresh, mobile width and queue/inventory links work");
  for (const route of [
    "/admin",
    "/admin/brands",
    "/admin/campaigns",
    "/admin/categories",
    "/admin/customers",
    "/admin/users",
    "/admin/orders",
    "/admin/orders/SCREEN001",
    "/admin/products",
    "/admin/products/new",
    `/admin/products/${product.id}`,
    "/admin/reviews",
    "/admin/riders",
    "/admin/settings",
    "/admin/wallets",
    "/admin/feedback",
  ]) {
    await visit(route);
    pass(`admin screen ${route}`);
  }
  await visit("/admin/feedback", "Persist this product suggestion");
  pass("admin reads saved customer feedback");
  await visit(`/admin/products/${product.id}`);
  await submit("input[name=slug]", { name: " ", slug: "INVALID SLUG" });
  await until(
    () =>
      evaluate(
        "Boolean(document.querySelector('[data-field-error=slug]')) && Boolean(document.querySelector('[data-field-error=name]'))",
      ),
    "product validation text",
  );
  assert.equal((await db.product.findUnique({ where: { id: product.id } })).name, "Screen Product");
  pass("product rejects invalid name and slug without updating");
  await visit(`/admin/products/${product.id}`);
  await hydrated("input[name=price]");
  await evaluate(
    `(() => { const field = document.querySelector('input[name=price]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(field, '123.45'); field.dispatchEvent(new Event('input', { bubbles: true })); })()`,
  );
  await until(
    () => evaluate("document.querySelector('input[name=priceCents]').value === '12345'"),
    "product price conversion",
  );
  await submit("input[name=slug]", {
    name: "Saved Product",
    flashSale: false,
    featured: false,
    active: false,
  });
  await until(
    async () => !(await db.product.findUnique({ where: { id: product.id } })).active,
    "product checkbox save",
  );
  await visit(`/admin/products/${product.id}`);
  assert.equal(await evaluate("document.querySelector('input[name=active]').checked"), false);
  assert.equal(await evaluate("document.querySelector('input[name=featured]').checked"), false);
  assert.equal(await evaluate("document.querySelector('input[name=flashSale]').checked"), false);
  assert.equal((await db.product.findUnique({ where: { id: product.id } })).priceCents, 12345);
  assert.equal(await evaluate("document.querySelector('input[name=price]').value"), "123.45");
  pass("product price in taka and unchecked flags persist and reload");
  await submit("input[name=slug]", { active: true });
  await until(
    async () => (await db.product.findUnique({ where: { id: product.id } })).active,
    "reactivate product",
  );
  await visit("/products", "Saved Product");
  pass("catalog immediately pulls saved product data");
  for (const [route, button, fields, model, marker] of [
    [
      "/admin/categories",
      "Add category",
      { name: "Saved Category", slug: "saved-category" },
      "category",
      "Saved Category",
    ],
    [
      "/admin/brands",
      "Add brand",
      { name: "Saved Brand", slug: "saved-brand" },
      "brand",
      "Saved Brand",
    ],
    [
      "/admin/campaigns",
      "Add campaign",
      {
        title: "Saved Banner",
        imageUrl: "/banners/banner-1.svg",
        linkUrl: "/products",
        active: false,
      },
      "campaign",
      "Saved Banner",
    ],
    [
      "/admin/riders",
      "Add delivery company",
      {
        name: "Saved Courier",
        phone: "01700000001",
        trackingUrl: "https://example.com/track",
        active: true,
      },
      "deliveryCompany",
      "Saved Courier",
    ],
  ]) {
    await visit(route);
    await clickText(button);
    const selector =
      model === "campaign" ? "input[name=title]" : "input[name=slug], input[name=trackingUrl]";
    const invalid =
      model === "campaign"
        ? { ...fields, linkUrl: "javascript:alert(1)" }
        : model === "deliveryCompany"
          ? { ...fields, trackingUrl: "javascript:alert(1)" }
          : { ...fields, slug: "INVALID SLUG" };
    await submit(selector, invalid);
    await until(
      () => evaluate("Boolean(document.querySelector('[role=alert]'))"),
      `${model} server validation text`,
    );
    assert.equal(
      await db[model].count({ where: model === "campaign" ? { title: marker } : { name: marker } }),
      0,
    );
    pass(`${model} rejects invalid input and displays validation text`);
    await submit(selector, fields);
    await until(
      async () =>
        (await db[model].count({
          where: model === "campaign" ? { title: marker } : { name: marker },
        })) === 1,
      `${model} save`,
    );
    await visit(route, marker);
    pass(`${model} creates and reloads`);
  }
  assert.equal((await db.campaign.findFirst({ where: { title: "Saved Banner" } })).active, false);
  pass("unchecked campaign remains inactive");
  await visit("/admin/customers");
  await clickText("Add customer");
  await submit("input[name=email]", {
    name: "Created Customer",
    email: "created@screen.invalid",
    password: "test-password-123",
  });
  await until(
    async () => (await db.user.count({ where: { email: "created@screen.invalid" } })) === 1,
    "customer create",
  );
  await visit("/admin/customers", "Created Customer");
  pass("admin customer creation saves and reloads");
  const managedCustomer = await db.user.findUnique({ where: { email: "created@screen.invalid" } });
  await visit("/admin/users?q=created%40screen.invalid", "Created Customer");
  await hydrated("main button");
  await clickText("Deactivate");
  await until(
    () => evaluate("Boolean(document.querySelector('[role=dialog]'))"),
    "deactivation confirmation",
  );
  await evaluate(
    "Array.from(document.querySelectorAll('[role=dialog] button')).find(b => b.textContent.trim() === 'Deactivate').click()",
  );
  await until(
    async () => !(await db.user.findUnique({ where: { id: managedCustomer.id } })).active,
    "deactivate customer",
  );
  await visit("/admin/users?q=created%40screen.invalid", "Inactive");
  await session(managedCustomer, Roles.Customer);
  await command("Page.navigate", { url: base + "/account" });
  await until(
    () =>
      evaluate(
        "location.pathname === '/login' && Boolean(document.querySelector('input[name=email]'))",
      ),
    "inactive account redirect",
  );
  assert.ok((await evaluate("location.pathname")).startsWith("/login"));
  pass("inactive customer session cannot access account pages");
  await session(owner, Roles.Admin);
  await visit("/admin/users?q=created%40screen.invalid", "Inactive");
  await clickText("Activate");
  await until(
    async () => (await db.user.findUnique({ where: { id: managedCustomer.id } })).active,
    "activate customer",
  );
  await visit("/admin/users?q=created%40screen.invalid", "Active");
  pass("account activation and deactivation persist through admin controls");
  await visit("/admin/riders");
  await clickText("Add delivery partner");
  await submit("input[name=email]", {
    name: "Created Rider",
    phone: "01700000002",
    email: "created-rider@screen.invalid",
    password: "test-password-123",
    active: true,
  });
  await until(
    async () => (await db.rider.count({ where: { name: "Created Rider" } })) === 1,
    "rider create",
  );
  await visit("/admin/riders", "Created Rider");
  pass("admin rider creation saves and reloads");
  await visit("/admin/reviews", "Saved product review");
  await clickText("Approve");
  await until(
    async () =>
      (await db.review.count({
        where: { status: ReviewStatuses.Approved, userId: customer.id },
      })) === 1,
    "review approve",
  );
  await visit("/products/screen-product", "Saved product review");
  pass("review moderation persists and refreshes public product");
  await visit(`/admin/orders/${placed.number}`);
  await hydrated("select");
  await evaluate(
    `(() => { const select = Array.from(document.querySelectorAll('select')).find(s => Array.from(s.options).some(o => o.value === ${JSON.stringify("rider:" + rider.id)})); select.value = ${JSON.stringify("rider:" + rider.id)}; select.dispatchEvent(new Event('change', { bubbles: true })); })()`,
  );
  await until(
    async () => (await db.order.findUnique({ where: { id: placed.id } })).riderId === rider.id,
    "delivery assignment",
  );
  await visit(`/admin/orders/${placed.number}`, "Screen Rider");
  pass("delivery assignment saves and reloads");
  assert.equal(
    await evaluate(
      "document.querySelector('main').innerText.includes('Call before delivery. Leave at office reception.')",
    ),
    true,
  );
  for (const stage of [
    OrderStatuses.Processing,
    OrderStatuses.Confirmed,
    OrderStatuses.Packing,
    OrderStatuses.Packed,
  ]) {
    await clickText(
      {
        [OrderStatuses.Processing]: "Start processing",
        [OrderStatuses.Confirmed]: "Confirm order",
        [OrderStatuses.Packing]: "Start packing",
        [OrderStatuses.Packed]: "Mark as packed",
      }[stage],
    );
    await until(
      async () => (await db.order.findUnique({ where: { id: placed.id } })).status === stage,
      `preparation ${stage}`,
    );
    await visit(`/admin/orders/${placed.number}`);
  }
  await session(customer, Roles.Customer);
  await visit(`/account/orders/${placed.number}`, "Timeline");
  for (const stage of [
    OrderEventTypes.Placed,
    OrderStatuses.Processing,
    OrderStatuses.Confirmed,
    OrderStatuses.Packing,
    OrderStatuses.Packed,
  ])
    assert.equal(
      await evaluate(`Boolean(document.querySelector('[data-order-event="${stage}"] time'))`),
      true,
    );
  assert.equal(
    await evaluate(
      "document.querySelector('main').innerText.includes('Bangladesh time (UTC+06:00)')",
    ),
    true,
  );
  await session(owner, Roles.Admin);
  pass(
    "admin preparation stages persist and customer timeline shows every recorded stage with local timestamps",
  );
  await visit("/admin/wallets");
  await hydrated("input[type=number]");
  await evaluate(
    `(() => { const field = document.querySelector('input[type=number]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(field, '25'); field.dispatchEvent(new Event('input', { bubbles: true })); })()`,
  );
  await until(
    () =>
      evaluate(
        "Array.from(document.querySelectorAll('button')).some(b => b.innerText.trim() === 'Gift' && !b.disabled)",
      ),
    "wallet amount",
  );
  const giftedUserId = await evaluate("document.querySelector('input[name=userId]').value");
  await clickText("Gift");
  await until(
    async () =>
      (await db.wallet.findUnique({ where: { userId: giftedUserId } }))?.balanceCents === 2500,
    "wallet gift",
  );
  await visit("/admin/wallets");
  assert.equal(
    await db.walletTransaction.count({ where: { wallet: { userId: giftedUserId } } }),
    1,
  );
  pass("wallet gift persists balance and ledger");
  await visit("/admin/settings");
  await submit("input[name=storeName]", {
    storeName: "Saved Store",
    currencyCode: "invalid",
    contactPhone: "bad",
    deliveryFeeCents: "-1",
  });
  await until(
    () =>
      evaluate(
        "Boolean(document.querySelector('[data-field-error=currencyCode]')) && Boolean(document.querySelector('[data-field-error=deliveryFeeCents]'))",
      ),
    "settings server validation text",
  );
  assert.equal((await db.storeSettings.findFirst()).storeName, "Screen Test Store");
  pass("settings reject invalid data and show field-specific errors");
  await submit("input[name=storeName]", {
    storeName: "Saved Store",
    currencyCode: "BDT",
    contactPhone: "",
    deliveryFeeCents: "1200",
  });
  await until(
    async () => (await db.storeSettings.findFirst()).storeName === "Saved Store",
    "settings save",
  );
  await visit("/admin/settings");
  assert.equal(
    await evaluate("document.querySelector('input[name=storeName]').value"),
    "Saved Store",
  );
  await visit("/", "Saved Store");
  pass("settings save, reload and propagate to storefront");

  await session(riderUser, Roles.Rider);
  await visit("/rider/search?q=SCREEN001", "SCREEN001");
  await visit("/rider/search?q=no-such-order", "No matches found");
  pass("rider search finds assigned deliveries and handles no results");
  for (const route of [
    "/rider",
    "/rider/route",
    "/rider/cash",
    "/rider/help",
    "/rider/history",
    "/rider/orders/SCREEN001",
    "/rider/profile",
  ]) {
    await visit(route);
    pass(`rider screen ${route}`);
  }
  assert.equal(await evaluate("fetch('/api/account/photo').then(r => r.status)"), 404);
  pass("rider cannot retrieve another account's private photo");
  await submit("input[name=name]", { name: "Saved Rider", dateOfBirth: "2999-01-01" });
  await until(
    () => evaluate("Boolean(document.querySelector('[data-field-error=dateOfBirth]'))"),
    "rider profile validation",
  );
  assert.equal(await evaluate("Boolean(document.querySelector('input[name=phone]'))"), false);
  await attachAvatar(avatarFile);
  await submit("input[name=name]", {
    name: "Saved Rider",
    gender: AddressTypes.OTHER,
    dateOfBirth: "1998-04-05",
  });
  await until(
    async () =>
      Boolean((await db.user.findUnique({ where: { id: riderUser.id } })).profilePhotoVersion),
    "rider profile photo save",
  );
  assert.equal(
    (await db.rider.findUnique({ where: { userId: riderUser.id } })).name,
    "Saved Rider",
  );
  assert.equal((await db.user.findUnique({ where: { id: riderUser.id } })).phone, null);
  assert.equal((await db.rider.findUnique({ where: { id: rider.id } })).phone, rider.phone);
  await visit("/rider/profile");
  assert.equal(await evaluate("document.querySelector('input[name=name]').value"), "Saved Rider");
  assert.equal(await evaluate("fetch('/api/account/photo').then(r => r.status)"), 200);
  pass(
    "rider profile fields and photo save and reload while account and rider phones remain unchanged",
  );
  await submit("input[name=name]", {
    name: "Saved Rider",
    removePhoto: true,
  });
  await until(
    async () => !(await db.user.findUnique({ where: { id: riderUser.id } })).profilePhotoVersion,
    "remove rider profile photo",
  );
  assert.equal(await evaluate("fetch('/api/account/photo').then(r => r.status)"), 404);
  pass("profile photo removal deletes the saved image");
  await visit(`/rider/orders/${placed.number}`);
  await clickText("Mark shipped");
  assert.equal(
    await evaluate(
      "document.querySelector('main').innerText.includes('Call before delivery. Leave at office reception.')",
    ),
    true,
  );
  await until(
    async () =>
      (await db.order.findUnique({ where: { id: placed.id } })).status === OrderStatuses.Shipped,
    "rider shipment",
  );
  await visit("/rider/route", placed.number);
  assert.equal(
    await evaluate(
      "Array.from(document.querySelectorAll('a')).some(a => a.innerText === 'Get directions' && a.href.includes('api=1') && a.href.includes('Checkout'))",
    ),
    true,
  );
  pass("rider route offers encoded map navigation for the saved address");
  await visit(`/rider/orders/${placed.number}/attempt`);
  await submit("textarea[name=note]", {
    reason: "NO_ANSWER",
    note: "Called customer; retry agreed",
    nextAttempt: "",
  });
  await until(
    async () => (await db.deliveryAttempt.count({ where: { orderId: placed.id } })) === 1,
    "attempt save",
  );
  await visit(`/rider/orders/${placed.number}`, "Called customer; retry agreed");
  assert.equal(
    (await db.order.findUnique({ where: { id: placed.id } })).status,
    OrderStatuses.Shipped,
  );
  pass("delivery attempt persists without falsely completing the order");
  await visit(`/rider/orders/${placed.number}/proof`);
  await submit("input[name=receivedBy]", {
    receivedBy: " ",
    handoverConfirmed: false,
    cashCollected: false,
  });
  await until(
    () => evaluate("Boolean(document.querySelector('[data-field-error=receivedBy]'))"),
    "proof validation",
  );
  assert.equal(await db.deliveryProof.count({ where: { orderId: placed.id } }), 0);
  const photoFile = path.join(profile, "parcel-proof.png");
  await writeFile(
    photoFile,
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jv5kAAAAASUVORK5CYII=",
      "base64",
    ),
  );
  const documentNode = await command("DOM.getDocument");
  const photoInput = await command("DOM.querySelector", {
    nodeId: documentNode.root.nodeId,
    selector: 'input[name="photo"]',
  });
  await command("DOM.setFileInputFiles", { nodeId: photoInput.nodeId, files: [photoFile] });
  await submit("input[name=receivedBy]", {
    receivedBy: "Verified Receiver",
    relationship: DeliveryRelationships.customer,
    note: "Parcel accepted at entrance",
    handoverConfirmed: true,
    cashCollected: true,
  });
  await until(
    async () =>
      (await db.order.findUnique({ where: { id: placed.id } })).status === OrderStatuses.Delivered,
    "rider delivery",
  );
  await visit(`/rider/orders/${placed.number}`, "Verified Receiver");
  assert.equal(await db.deliveryProof.count({ where: { orderId: placed.id } }), 1);
  const savedProof = await db.deliveryProof.findUnique({ where: { orderId: placed.id } });
  assert.ok(savedProof.photoKey);
  const proofPhotoPath = `/api/rider/proofs/${savedProof.id}/photo`;
  assert.equal(
    await evaluate(`fetch(${JSON.stringify(proofPhotoPath)}).then(response => response.status)`),
    200,
  );
  pass("private handover photo uploads and is readable by the assigned rider");
  pass("proof, delivery and COD collection persist together and reload");
  await visit("/rider/cash", placed.number);
  pass("rider cash screen pulls the unremitted COD ledger");
  await visit("/rider");
  await command("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await hydrated(
    'button[aria-label="Switch to dark mode"], button[aria-label="Switch to light mode"]',
  );
  await until(
    () => evaluate("Boolean(document.querySelector('[data-metric=delivered-today]'))"),
    "rider dashboard metrics",
  );
  assert.equal(
    await evaluate(
      "document.querySelector('[data-metric=delivered-today] > p:nth-child(2)').innerText",
    ),
    "1",
  );
  assert.equal(
    await evaluate(
      "document.querySelector('[data-metric=delivered-month] > p:nth-child(2)').innerText",
    ),
    "1",
  );
  assert.equal(
    await evaluate(
      "document.querySelector('[data-metric=delivered-total] > p:nth-child(2)').innerText",
    ),
    "2",
  );
  assert.equal(
    await evaluate("document.body.innerText.includes('Monthly performance & cash collection')"),
    true,
  );
  pass("rider dashboard shows dated daily/monthly delivery totals and historical total separately");
  assert.equal(
    await evaluate(
      "document.querySelector('[data-metric=cash-today]').innerText.includes('BDT') && document.querySelector('[data-metric=cash-held]').innerText.includes('BDT')",
    ),
    true,
  );
  pass("rider dashboard pulls actual COD collections and outstanding cash");
  const beforeTheme = await evaluate("document.documentElement.classList.contains('dark')");
  await evaluate(
    "Array.from(document.querySelectorAll('button')).find(button => button.getAttribute('aria-label')?.startsWith('Switch to') && button.getBoundingClientRect().width > 0).click()",
  );
  await until(
    () => evaluate(`document.documentElement.classList.contains('dark') !== ${beforeTheme}`),
    "rider theme toggle",
  );
  await visit("/rider");
  assert.equal(await evaluate("document.documentElement.classList.contains('dark')"), !beforeTheme);
  assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true);
  await command("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await until(() => evaluate("innerWidth === 1440"), "desktop resize");
  assert.equal(
    await evaluate("document.querySelector('main > div').getBoundingClientRect().width > 1100"),
    true,
  );
  await evaluate(
    "Array.from(document.querySelectorAll('button')).find(button => button.getAttribute('aria-label')?.startsWith('Switch to') && button.getBoundingClientRect().width > 0).click()",
  );
  await until(
    () => evaluate(`document.documentElement.classList.contains('dark') === ${beforeTheme}`),
    "desktop rider theme",
  );
  pass("mobile and desktop rider theme toggles work, persist, and use full available width");
  await visit("/rider/history", placed.number);
  pass("rider shipment and COD delivery save and reload in history");
  await session(owner, Roles.Admin);
  await visit(`/admin/orders/${placed.number}`);
  await submit("input[name=reference]", { reference: "SCREEN-RECEIPT-001" });
  await until(
    async () =>
      Boolean((await db.codCollection.findUnique({ where: { orderId: placed.id } }))?.remittedAt),
    "COD remittance",
  );
  await visit(`/admin/orders/${placed.number}`, "SCREEN-RECEIPT-001");
  await until(
    () => evaluate("document.body.innerText.includes('Verified Receiver')"),
    "admin proof read",
  );
  pass("COD store receipt persists and reloads");
  await session(riderUser, Roles.Rider);
  await visit("/rider");
  await until(
    () =>
      evaluate(
        "document.querySelector('[data-metric=cash-held]')?.innerText.includes('No cash awaiting receipt')",
      ),
    "dashboard receipt reconciliation",
  );
  assert.equal(
    await evaluate(
      "document.querySelector('[data-metric=cash-remitted-month]').innerText.includes('BDT')",
    ),
    true,
  );
  pass("rider dashboard refreshes store receipts without double-counting collected cash");
  await session(customer, Roles.Customer);
  await visit(`/account/orders/${placed.number}`, OrderStatuses.Delivered);
  pass("customer pulls updated delivery status");
  await db.order.update({
    where: { number: "SCREEN001" },
    data: { deliveredAt: new Date() },
  });
  await visit("/account/orders/SCREEN001");
  await hydrated('[data-after-sales-request] button[aria-label^="Add one"]');
  await evaluate(
    `document.querySelector('[data-after-sales-request] button[aria-label^="Add one"]').click()`,
  );
  await until(
    () =>
      evaluate(
        "document.querySelector('[data-after-sales-request] input[type=number]').value === '1'",
      ),
    "after-sales quantity stepper",
  );
  await submit("textarea[name=reason]", { reason: "The jar arrived cracked" });
  await until(
    () => evaluate("Boolean(document.querySelector('[data-after-sales-submitted]'))"),
    "after-sales confirmation",
  );
  await until(
    () => evaluate("Boolean(document.querySelector('[data-after-sales-status]'))"),
    "after-sales status panel",
  );
  assert.equal(
    await evaluate(
      "document.querySelector('[data-after-sales-status]').innerText.includes('Awaiting review')",
    ),
    true,
  );
  assert.equal(
    await evaluate("Boolean(document.querySelector('[data-order-event=ReturnRequested]'))"),
    true,
  );
  assert.equal(
    await evaluate("Boolean(document.querySelector('[data-after-sales-request] form'))"),
    false,
  );
  await session(owner, Roles.Admin);
  await visit("/admin/orders/SCREEN001");
  await submit("textarea[name=adminNote]", { adminNote: "Approved for return pickup" }, false);
  await clickText("Approve request");
  await until(
    () => evaluate("document.body.innerText.includes('Return · Approved')"),
    "admin approves the return request",
  );
  await session(customer, Roles.Customer);
  await visit("/account/orders/SCREEN001");
  await until(
    () => evaluate("Boolean(document.querySelector('[data-after-sales-request-status=Approved]'))"),
    "customer sees the approval",
  );
  assert.equal(
    await evaluate(
      "document.querySelector('[data-after-sales-status]').innerText.includes('Store note')",
    ),
    true,
  );
  pass("return request submits, shows its status panel and is approved by the store");
  await visit("/account/orders", "Call before delivery. Leave at office reception.");
  await hydrated(`[data-order-again="${placed.id}"]`);
  await evaluate(`document.querySelector('[data-order-again="${placed.id}"]').requestSubmit()`);
  await until(
    () => evaluate("document.querySelector('main').innerText.includes('Review cart')"),
    "order again result",
  );
  const restoredCart = await db.cart.findUnique({
    where: { userId: customer.id },
    include: { items: true },
  });
  assert.ok(restoredCart.items.length > 0);
  const restoredCount = restoredCart.items.reduce((sum, item) => sum + item.quantity, 0);
  const orderProductIds = (
    await db.orderItem.findMany({ where: { orderId: placed.id }, select: { productId: true } })
  ).map((item) => item.productId);
  const retryTarget = restoredCart.items.find((item) => orderProductIds.includes(item.productId));
  assert.ok(retryTarget);
  await db.cartItem.update({ where: { id: retryTarget.id }, data: { selected: false } });
  await evaluate(`document.querySelector('[data-order-again="${placed.id}"]').requestSubmit()`);
  await until(
    async () => (await db.cartItem.findUnique({ where: { id: retryTarget.id } })).selected === true,
    "order again retry complete",
  );
  assert.equal(
    (await db.cartItem.findMany({ where: { cartId: restoredCart.id } })).reduce(
      (sum, item) => sum + item.quantity,
      0,
    ),
    restoredCount,
  );
  await visit("/cart", "Saved Product");
  pass(
    "Order Again restores prior items at current prices without duplicating quantities on retries",
  );
  assert.equal(
    await evaluate(`fetch(${JSON.stringify(proofPhotoPath)}).then(response => response.status)`),
    404,
  );
  pass("private proof photo is not exposed to customer sessions");
  await command("Network.clearBrowserCookies");
  assert.equal(await evaluate("fetch('/api/account/photo').then(r => r.status)"), 404);
  pass("anonymous users cannot retrieve profile photos");
  await session(support, Roles.Support);
  for (const route of [
    "/support",
    "/support/closed",
    "/support/tickets",
    "/support/orders",
    "/support/customers",
    "/support/search?q=SCREEN001",
  ]) {
    await visit(route);
    pass(`support screen ${route}`);
  }
  await command("Network.clearBrowserCookies");
  for (const route of ["/account", "/admin", "/rider", "/support", "/checkout"]) {
    await command("Page.navigate", { url: base + route });
    await until(() => evaluate("location.pathname === '/login'"), `anonymous protection ${route}`);
  }
  pass("anonymous users cannot open protected screens");
  console.log(`${results.length} screen/data checks passed.`);
}

try {
  await run();
} catch (error) {
  console.error(error.message);
  if (socket?.readyState === WebSocket.OPEN)
    console.error(
      (await evaluate("location.pathname + '\\n' + document.body.innerText").catch(() => "")).slice(
        0,
        2000,
      ),
    );
  process.exitCode = 1;
} finally {
  if (socket?.readyState === WebSocket.OPEN) await command("Browser.close").catch(() => {});
  socket?.close();
  if (chrome && !chrome.killed) chrome.kill();
  if (server) {
    server.kill();
    await delay(500);
  }
  await writeFile(path.join(tmpdir(), "storelaunch-screen-test-server.log"), serverLog);
  if (db) {
    const proofFiles = await db.deliveryProof
      .findMany({ select: { photoKey: true } })
      .catch(() => []);
    for (const proof of proofFiles)
      if (proof.photoKey && /^[0-9a-f-]{36}$/.test(proof.photoKey))
        await unlink(path.join(process.cwd(), "storage", "delivery-proofs", proof.photoKey)).catch(
          () => {},
        );
  }
  await db?.$disconnect();
  await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${databaseName}"`);
  await admin.$disconnect();
}
