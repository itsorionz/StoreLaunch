import { Roles } from "../lib/enums.mjs";
// Requires the local app on :3000 and a disposable Chrome debugging session on :9223.
import { config } from "dotenv";
import { createPrismaClient } from "../lib/prisma-client.ts";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import WebSocket from "next/dist/compiled/ws/index.js";

config({ quiet: true });
const db = createPrismaClient();
const userIds = [];
let socket;
let tab;
const pending = new Map();
let sequence = 0;

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
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

async function until(expression) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Browser condition timed out");
}

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
  tab = await (await fetch("http://127.0.0.1:9223/json/new?about:blank", { method: "PUT" })).json();
  socket = new WebSocket(tab.webSocketDebuggerUrl);
  socket.on("message", (message) => {
    const response = JSON.parse(String(message));
    const request = pending.get(response.id);
    if (!request) return;
    pending.delete(response.id);
    if (response.error) request.reject(new Error(response.error.message));
    else request.resolve(response.result);
  });
  await new Promise((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
  await command("Page.enable");
  const password = randomUUID();
  const passwordHash = await bcrypt.hash(password, 4);
  for (const roles of [[Roles.Customer], [Roles.Customer, Roles.Admin]]) {
    const user = await db.user.create({
      data: {
        email: `${randomUUID()}@login-smoke.invalid`,
        name: "Temporary login check",
        passwordHash,
        roles,
      },
    });
    userIds.push(user.id);
    await command("Page.navigate", { url: "http://localhost:3000/login?callbackUrl=/account" });
    await until(
      "location.pathname === '/login' && Boolean(document.querySelector('input[name=email]')) && Object.keys(document.querySelector('input[name=email]')).some(key => key.startsWith('__reactProps$'))",
    );
    assert.equal(await evaluate("Boolean(document.querySelector('button[name=role]'))"), false);
    if (roles.length > 1) {
      await evaluate(
        `(() => { const email = document.querySelector('input[name=email]'); email.value = ${JSON.stringify(user.email)}; document.querySelector('input[name=password]').value = 'incorrect-password'; email.form.requestSubmit(); })()`,
      );
      await until("document.body.innerText.includes('Invalid email or password')");
      assert.equal(await evaluate("Boolean(document.querySelector('button[name=role]'))"), false);
      console.log("PASS: invalid credentials do not reveal account roles");
    }
    await evaluate(
      `(() => { const email = document.querySelector('input[name=email]'); const password = document.querySelector('input[name=password]'); email.value = ${JSON.stringify(user.email)}; password.value = ${JSON.stringify(password)}; email.form.requestSubmit(); })()`,
    );
    if (roles.length === 1) {
      await until("location.pathname === '/account'");
      assert.equal(
        await evaluate(
          "fetch('/api/auth/session').then(response => response.json()).then(session => session.user.role)",
        ),
        Roles.Customer,
      );
      console.log("PASS: single-role account signs in without role choices");
    } else {
      await until("Boolean(document.querySelector('input[name=ticket]'))");
      assert.deepEqual(
        await evaluate(
          "Array.from(document.querySelectorAll('button[name=role]')).map(button => button.value).sort()",
        ),
        [Roles.Admin, Roles.Customer],
      );
      assert.equal(
        await evaluate(
          "fetch('/login').then(response => response.text()).then(html => html.includes('name=\"ticket\"'))",
        ),
        true,
      );
      await evaluate(
        "document.querySelector('input[name=ticket]').form.querySelector('button:not([name])').click()",
      );
      await until(
        "Boolean(document.querySelector('input[name=email]')) && !document.querySelector('input[name=ticket]')",
      );
      assert.equal(
        await db.loginChallenge.count({ where: { userId: user.id, consumedAt: null } }),
        0,
      );
      console.log(
        "PASS: role choice survives a new page request and changing account invalidates it",
      );
      await evaluate(
        `(() => { const email = document.querySelector('input[name=email]'); email.value = ${JSON.stringify(user.email)}; document.querySelector('input[name=password]').value = ${JSON.stringify(password)}; email.form.requestSubmit(); })()`,
      );
      await until("Boolean(document.querySelector('input[name=ticket]'))");
      await evaluate("document.querySelector('button[name=role][value=Admin]').click()");
      // The shopper callback is valid for admins too; the selected session must still be ADMIN.
      await until("location.pathname === '/account'");
      assert.equal(
        await evaluate(
          "fetch('/api/auth/session').then(response => response.json()).then(session => session.user.role)",
        ),
        Roles.Admin,
      );
      console.log(
        "PASS: verified multi-role account displays assigned choices and signs in with selection",
      );
    }
  }
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    socket?.close();
    if (tab?.id) await fetch(`http://127.0.0.1:9223/json/close/${tab.id}`).catch(() => {});
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.$disconnect();
  });
