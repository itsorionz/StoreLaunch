import { config } from "dotenv";
import { createPrismaClient } from "../lib/prisma-client";
import { PrismaClient } from "@backend/generated/prisma/client";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { test } from "node:test";
import { ChatConversationStatuses, InboxCategories, Roles } from "../lib/enums.mjs";
import type { Role } from "@backend/generated/prisma/client";

config({ quiet: true });
async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
  const name = `test_chat_${randomUUID().replaceAll("-", "")}`;
  const adminDb = createPrismaClient();
  await adminDb.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
  url.pathname = `/${name}`;
  process.env.DATABASE_URL = url.toString();
  let store: PrismaClient | undefined;
  try {
    execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], {
      env: process.env,
      stdio: "pipe",
      timeout: 60_000,
    });
    const { db } = await import("../lib/db");
    store = db;
    const chat = await import("../lib/chat");

    const stamp = randomUUID();
    async function makeUser(name: string, roles: Role[]) {
      return db.user.create({
        data: {
          name,
          email: `${name.toLowerCase()}_${stamp}@chat.invalid`,
          passwordHash: "unused",
          roles,
        },
      });
    }
    const alice = await makeUser("Alice", [Roles.Customer]);
    const bob = await makeUser("Bob", [Roles.Customer]);
    const agentOne = await makeUser("AgentOne", [Roles.Customer, Roles.Support]);
    const agentTwo = await makeUser("AgentTwo", [Roles.Customer, Roles.Support]);
    const aliceActor = { id: alice.id, role: Roles.Customer };
    const bobActor = { id: bob.id, role: Roles.Customer };
    const agentOneActor = { id: agentOne.id, role: Roles.Support };
    const agentTwoActor = { id: agentTwo.id, role: Roles.Support };

    let aliceConversationId = "";
    let bobConversationId = "";

    await test("starting a support chat is idempotent and serializes concurrent starts", async () => {
      const first = await chat.startConversation(aliceActor, { body: "My order has not arrived" });
      assert.equal(first.ok, true);
      assert.ok(first.conversationId);
      aliceConversationId = first.conversationId;

      const again = await chat.startConversation(aliceActor, { body: "Any update on my order?" });
      assert.equal(again.ok, true);
      assert.equal(again.conversationId, aliceConversationId);
      assert.equal(
        await db.chatConversation.count({
          where: { customerId: alice.id, status: ChatConversationStatuses.Open },
        }),
        1,
      );
      assert.equal(
        await db.chatMessage.count({ where: { conversationId: aliceConversationId } }),
        2,
      );

      // Concurrent starts from a fresh customer collapse into one open thread.
      const carol = await makeUser("Carol", [Roles.Customer]);
      const carolActor = { id: carol.id, role: Roles.Customer };
      const [a, b] = await Promise.all([
        chat.startConversation(carolActor, { body: "First" }),
        chat.startConversation(carolActor, { body: "Second" }),
      ]);
      assert.equal(a.ok, true);
      assert.equal(b.ok, true);
      assert.equal(a.conversationId, b.conversationId);
      assert.ok(a.conversationId);
      assert.equal(
        await db.chatConversation.count({
          where: { customerId: carol.id, status: ChatConversationStatuses.Open },
        }),
        1,
      );
      assert.equal(await db.chatMessage.count({ where: { conversationId: a.conversationId } }), 2);

      // Overlong bodies and orders the customer does not own are rejected up front.
      assert.equal(
        (await chat.startConversation(aliceActor, { body: "x".repeat(2001) })).ok,
        false,
      );
      assert.equal(
        (await chat.startConversation(aliceActor, { body: "Link it", orderId: randomUUID() })).ok,
        false,
      );
    });

    await test("the first agent reply claims the thread and notifies the customer once", async () => {
      const thread = await chat.getConversation(agentOneActor, aliceConversationId);
      assert.ok(thread);
      assert.equal(thread.customer.name, "Alice");
      assert.equal(thread.messages.length, 2);
      // Reading the thread marks the customer's messages as seen by the service side.
      assert.ok(thread.messages.every((message) => message.readAt !== null));

      const reply = await chat.postMessage(
        agentOneActor,
        aliceConversationId,
        "We are checking the courier status",
      );
      assert.equal(reply.ok, true);
      assert.ok(reply.messageId);
      const conversation = await db.chatConversation.findUniqueOrThrow({
        where: { id: aliceConversationId },
      });
      assert.equal(conversation.customerServiceId, agentOne.id);

      const notifications = await db.inboxMessage.findMany({
        where: { userId: alice.id, category: InboxCategories.NOTIFICATION },
      });
      assert.equal(notifications.length, 1);
      assert.equal(notifications[0].href, "/account/chat");
      assert.equal(notifications[0].sourceKey, `chat:${aliceConversationId}:${reply.messageId}`);
      assert.equal(notifications[0].readAt, null);

      const asCustomer = await chat.getConversation(aliceActor, aliceConversationId);
      assert.equal(asCustomer?.messages.length, 3);
    });

    await test("other customers cannot read or post into someone else's conversation", async () => {
      assert.equal(await chat.getConversation(bobActor, aliceConversationId), null);
      const before = await db.chatMessage.count({
        where: { conversationId: aliceConversationId },
      });
      const posted = await chat.postMessage(bobActor, aliceConversationId, "Let me in");
      assert.equal(posted.ok, false);
      assert.equal(
        await db.chatMessage.count({ where: { conversationId: aliceConversationId } }),
        before,
      );
      assert.equal(await chat.getConversation(bobActor, randomUUID()), null);
    });

    await test("claiming is race-free and only the owning agent can reply", async () => {
      const started = await chat.startConversation(bobActor, {
        body: "Damaged item in my parcel",
      });
      assert.equal(started.ok, true);
      assert.ok(started.conversationId);
      bobConversationId = started.conversationId;

      const [first, second] = await Promise.all([
        chat.claimConversation(agentOneActor, bobConversationId),
        chat.claimConversation(agentTwoActor, bobConversationId),
      ]);
      assert.equal(first.ok, !second.ok, "exactly one agent wins the claim");
      const winner = first.ok ? agentOneActor : agentTwoActor;
      const loser = first.ok ? agentTwoActor : agentOneActor;

      const loserReply = await chat.postMessage(loser, bobConversationId, "I will take this");
      assert.equal(loserReply.ok, false);
      const winnerReply = await chat.postMessage(winner, bobConversationId, "Thanks for reporting");
      assert.equal(winnerReply.ok, true);
      // Re-claiming your own thread is a no-op; the other agent still cannot take it.
      assert.equal((await chat.claimConversation(winner, bobConversationId)).ok, true);
      assert.equal((await chat.claimConversation(loser, bobConversationId)).ok, false);
      // Customers can neither claim nor close.
      assert.equal((await chat.claimConversation(bobActor, bobConversationId)).ok, false);
    });

    await test("only agents close conversations, and closed threads reject messages", async () => {
      const claimed = await db.chatConversation.findUniqueOrThrow({
        where: { id: bobConversationId },
      });
      const owner = claimed.customerServiceId === agentOne.id ? agentOneActor : agentTwoActor;
      const otherAgent = claimed.customerServiceId === agentOne.id ? agentTwoActor : agentOneActor;

      assert.equal((await chat.closeConversation(bobActor, bobConversationId)).ok, false);
      assert.equal((await chat.closeConversation(otherAgent, bobConversationId)).ok, false);
      assert.equal((await chat.closeConversation(owner, bobConversationId)).ok, true);
      // Closing twice stays a no-op.
      assert.equal((await chat.closeConversation(owner, bobConversationId)).ok, true);
      const closed = await db.chatConversation.findUniqueOrThrow({
        where: { id: bobConversationId },
      });
      assert.equal(closed.status, ChatConversationStatuses.Closed);
      assert.ok(closed.closedAt);

      // Neither side can keep talking in a closed thread.
      assert.equal((await chat.postMessage(owner, bobConversationId, "One more thing")).ok, false);
      assert.equal(
        (await chat.postMessage(bobActor, bobConversationId, "One more thing")).ok,
        false,
      );

      // ...but the customer can open a fresh conversation afterwards.
      const fresh = await chat.startConversation(bobActor, {
        body: "New question about a voucher",
      });
      assert.equal(fresh.ok, true);
      assert.notEqual(fresh.conversationId, bobConversationId);
      assert.equal(
        await db.chatConversation.count({
          where: { customerId: bob.id, status: ChatConversationStatuses.Open },
        }),
        1,
      );
    });

    await test("unread counts follow the reader's side", async () => {
      const dave = await makeUser("Dave", [Roles.Customer]);
      const daveActor = { id: dave.id, role: Roles.Customer };
      const started = await chat.startConversation(daveActor, { body: "Help with a return" });
      assert.equal(started.ok, true);
      assert.ok(started.conversationId);
      const conversationId = started.conversationId;

      // Customer-side counts only service replies, never the customer's own messages.
      assert.equal(await chat.getUnreadCounts(daveActor), 0);
      assert.equal(
        (await chat.postMessage(agentOneActor, conversationId, "Happy to help")).ok,
        true,
      );
      assert.equal(
        (await chat.postMessage(agentOneActor, conversationId, "What is your order number?")).ok,
        true,
      );
      assert.equal(await chat.getUnreadCounts(daveActor), 2);
      // The chat screen itself reads the thread, so the badge clears on reload.
      const daveView = await chat.listCustomerConversations(daveActor);
      assert.equal(daveView.open?.messages.length, 3);
      assert.equal(await chat.getUnreadCounts(daveActor), 0);

      // Agent-side counts cover unassigned plus their own threads; the opener is
      // already read here so the deltas below are exact.
      assert.ok(await chat.getConversation(agentOneActor, conversationId));
      const agentOneBefore = await chat.getUnreadCounts(agentOneActor);
      const agentTwoBefore = await chat.getUnreadCounts(agentTwoActor);

      assert.equal((await chat.postMessage(daveActor, conversationId, "Order 1234")).ok, true);
      assert.equal(await chat.getUnreadCounts(agentOneActor), agentOneBefore + 1);
      // Another agent's claimed thread never inflates this agent's badge.
      assert.equal(await chat.getUnreadCounts(agentTwoActor), agentTwoBefore);

      assert.ok(await chat.getConversation(agentOneActor, conversationId));
      assert.equal(await chat.getUnreadCounts(agentOneActor), agentOneBefore);
      assert.equal(await chat.getUnreadCounts(agentTwoActor), agentTwoBefore);
    });

    await test("queue and history listings expose scoped previews", async () => {
      // The agent queue lists open threads only, unassigned before claimed.
      const queue = await chat.listOpenConversations(agentOneActor);
      assert.ok(queue.length >= 1);
      const openIds = new Set(
        (
          await db.chatConversation.findMany({
            where: { status: ChatConversationStatuses.Open },
            select: { id: true },
          })
        ).map((conversation) => conversation.id),
      );
      assert.ok(queue.every((item) => openIds.has(item.id)));

      const bobOpen = await db.chatConversation.findFirst({
        where: { customerId: bob.id, status: ChatConversationStatuses.Open },
      });
      assert.ok(bobOpen);
      const bobItem = queue.find((item) => item.id === bobOpen.id);
      assert.ok(bobItem);
      assert.equal(bobItem.preview?.body, "New question about a voucher");
      assert.equal(bobItem.mine, false);
      assert.ok(bobItem.unread >= 1);
      const firstMine = queue.findIndex((item) => item.mine);
      const lastUnassigned = queue.map((item) => item.agent === null).lastIndexOf(true);
      if (firstMine !== -1 && lastUnassigned !== -1) assert.ok(lastUnassigned < firstMine);
      // Customers cannot browse the queue.
      assert.deepEqual(await chat.listOpenConversations(aliceActor), []);

      // A customer sees only their own open thread plus their closed previews.
      const aliceView = await chat.listCustomerConversations(aliceActor);
      assert.equal(aliceView.open?.id, aliceConversationId);
      assert.ok(aliceView.closed.every((item) => item.status === ChatConversationStatuses.Closed));
      const aliceTotal = await db.chatConversation.count({ where: { customerId: alice.id } });
      assert.equal(aliceView.closed.length, aliceTotal - (aliceView.open ? 1 : 0));

      // Agent history contains closed threads only; customers get an empty view.
      const closedList = await chat.listClosedConversations(agentOneActor);
      assert.ok(closedList.total >= 1);
      assert.ok(closedList.items.every((item) => item.status === ChatConversationStatuses.Closed));
      assert.deepEqual(await chat.listClosedConversations(aliceActor), {
        items: [],
        total: 0,
        pages: 1,
      });
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
