import {
  AfterSalesKinds,
  ChatConversationStatuses,
  PaymentAttemptStatuses,
  PaymentMethods,
  Roles,
  SupportTicketPriorities,
  SupportTicketStatuses,
} from "@backend/lib/enums.mjs";
import { config } from "dotenv";
import { createPrismaClient } from "../lib/prisma-client";
import { PrismaClient, type Prisma } from "@backend/generated/prisma/client";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { test } from "node:test";
import { bdDayKey, bdStartOfDay } from "../lib/admin-dashboard-periods";

config({ quiet: true });
async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  assert.ok(
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname),
    "Local PostgreSQL required",
  );
  const name = `test_support_dashboard_${randomUUID().replaceAll("-", "")}`;
  const admin = createPrismaClient();
  await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
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
    const { getSupportDashboard, STALE_AFTER_MS } = await import("../lib/support-dashboard");

    const now = new Date("2026-10-21T06:00:00.000Z"); // 12:00 Bangladesh, Oct 21

    await test("Bangladesh day boundary is shared across dashboards", () => {
      assert.equal(STALE_AFTER_MS, 15 * 60000);
      assert.equal(bdStartOfDay(now).toISOString(), "2026-10-20T18:00:00.000Z");
      assert.equal(bdDayKey(new Date("2026-10-20T17:59:59.000Z")), "2026-10-20");
      assert.equal(bdDayKey(new Date("2026-10-20T18:00:00.000Z")), "2026-10-21");
      assert.equal(bdDayKey(now), "2026-10-21");
    });

    await test("empty dashboard returns zero metrics and complete zero-filled buckets", async () => {
      const data = await getSupportDashboard("no-agent-yet", "7", now);
      assert.equal(data.chat.open, 0);
      assert.equal(data.chat.unassigned, 0);
      assert.equal(data.chat.mine, 0);
      assert.equal(data.chat.unread, 0);
      assert.equal(data.chat.awaitingReply, 0);
      assert.equal(data.chat.stale, 0);
      assert.equal(data.chat.resolvedToday, 0);
      assert.equal(data.chat.avgFirstResponseMin, null);
      assert.equal(data.tickets.open, 0);
      assert.equal(data.tickets.unassigned, 0);
      assert.equal(data.tickets.escalated, 0);
      assert.equal(data.tickets.resolvedToday, 0);
      assert.equal(data.tickets.avgFirstResponseMin, null);
      assert.equal(data.ops.returnsRequested, 0);
      assert.equal(data.ops.paymentReview, 0);
      assert.equal(data.trend.length, 7);
      assert.ok(
        data.trend.every(
          (day) =>
            day.chatsOpened === 0 &&
            day.chatsClosed === 0 &&
            day.ticketsOpened === 0 &&
            day.ticketsResolved === 0,
        ),
      );
      assert.equal(data.trend[0].key, "2026-10-15");
      assert.equal(data.trend.at(-1)?.key, "2026-10-21");
    });

    // ---- Seed -------------------------------------------------------------
    const stamp = randomUUID();
    async function makeUser(name: string, roles: (typeof Roles)[keyof typeof Roles][]) {
      return db.user.create({
        data: {
          name,
          email: `${name.toLowerCase()}_${stamp}@support-dashboard.invalid`,
          passwordHash: "unused",
          roles,
        },
      });
    }
    const alice = await makeUser("Alice", [Roles.Customer]);
    const bob = await makeUser("Bob", [Roles.Customer]);
    const agent = await makeUser("Agent", [Roles.Customer, Roles.Support]);
    const agent2 = await makeUser("Agent2", [Roles.Customer, Roles.Support]);

    type Seed = {
      customerId: string;
      customerServiceId?: string;
      status?: (typeof ChatConversationStatuses)[keyof typeof ChatConversationStatuses];
      subject?: string;
      createdAt: Date;
      lastMessageAt: Date;
      closedAt?: Date;
    };
    async function conversation(seed: Seed) {
      return db.chatConversation.create({
        data: {
          customerId: seed.customerId,
          customerServiceId: seed.customerServiceId ?? null,
          status: seed.status ?? ChatConversationStatuses.Open,
          subject: seed.subject ?? null,
          createdAt: seed.createdAt,
          lastMessageAt: seed.lastMessageAt,
          closedAt: seed.closedAt ?? null,
        },
      });
    }
    async function message(
      conversationId: string,
      senderId: string,
      senderRole: (typeof Roles)[keyof typeof Roles],
      createdAt: Date,
      readAt: Date | null,
    ) {
      return db.chatMessage.create({
        data: { conversationId, senderId, senderRole, body: "…", createdAt, readAt },
      });
    }

    // c1: unassigned, customer's newest message 30 minutes ago -> stale + unread.
    const c1 = await conversation({
      customerId: alice.id,
      createdAt: new Date("2026-10-20T20:00:00.000Z"),
      lastMessageAt: new Date("2026-10-21T05:30:00.000Z"),
    });
    await message(c1.id, alice.id, Roles.Customer, new Date("2026-10-21T05:30:00.000Z"), null);

    // c2: mine, agent answered 10 minutes after the conversation started.
    const c2 = await conversation({
      customerId: bob.id,
      customerServiceId: agent.id,
      createdAt: new Date("2026-10-20T22:00:00.000Z"),
      lastMessageAt: new Date("2026-10-20T22:10:00.000Z"),
    });
    await message(c2.id, bob.id, Roles.Customer, new Date("2026-10-20T22:05:00.000Z"), null);
    await message(
      c2.id,
      agent.id,
      Roles.Support,
      new Date("2026-10-20T22:10:00.000Z"),
      new Date("2026-10-20T22:10:00.000Z"),
    );

    // c3: someone else's conversation — its unread customer message must not
    // count toward my dashboard, and it is awaiting a reply but not stale.
    const c3 = await conversation({
      customerId: alice.id,
      customerServiceId: agent2.id,
      createdAt: new Date("2026-10-20T19:00:00.000Z"),
      lastMessageAt: new Date("2026-10-21T05:55:00.000Z"),
    });
    await message(c3.id, alice.id, Roles.Customer, new Date("2026-10-21T05:55:00.000Z"), null);

    // c4: closed today (Bangladesh day) -> resolvedToday.
    const c4 = await conversation({
      customerId: bob.id,
      createdAt: new Date("2026-10-19T10:00:00.000Z"),
      lastMessageAt: new Date("2026-10-19T10:20:00.000Z"),
      status: ChatConversationStatuses.Closed,
      closedAt: new Date("2026-10-21T04:00:00.000Z"),
    });
    await message(c4.id, bob.id, Roles.Customer, new Date("2026-10-19T10:00:00.000Z"), null);
    await message(c4.id, agent.id, Roles.Support, new Date("2026-10-19T10:05:00.000Z"), null);

    // c5: closed before today's Bangladesh midnight -> not resolvedToday.
    await conversation({
      customerId: alice.id,
      createdAt: new Date("2026-10-18T10:00:00.000Z"),
      lastMessageAt: new Date("2026-10-18T10:20:00.000Z"),
      status: ChatConversationStatuses.Closed,
      closedAt: new Date("2026-10-20T10:00:00.000Z"),
    });

    // c6: created today, agent answered after 12 minutes -> avg first response.
    const c6 = await conversation({
      customerId: bob.id,
      customerServiceId: agent2.id,
      createdAt: new Date("2026-10-21T04:00:00.000Z"),
      lastMessageAt: new Date("2026-10-21T04:12:00.000Z"),
    });
    await message(
      c6.id,
      bob.id,
      Roles.Customer,
      new Date("2026-10-21T04:00:00.000Z"),
      new Date("2026-10-21T04:01:00.000Z"),
    );
    await message(c6.id, agent2.id, Roles.Support, new Date("2026-10-21T04:12:00.000Z"), null);

    const order = (data: Partial<Prisma.OrderUncheckedCreateInput> = {}) =>
      db.order.create({
        data: {
          number: randomUUID(),
          userId: alice.id,
          recipientName: alice.name,
          phone: "01700000000",
          line1: "Road",
          city: "Dhaka",
          subtotalCents: 1000,
          totalCents: 1000,
          currencyCode: "BDT",
          currencySymbol: "Tk",
          paymentMethod: PaymentMethods.GATEWAY,
          createdAt: new Date("2026-10-20T10:00:00.000Z"),
          ...data,
        },
      });

    // Tickets: one unassigned, one mine + escalated + urgent, one waiting,
    // one resolved today (45-minute first note), one open with a 15-minute note.
    const ticket = (data: {
      number: string;
      subject: string;
      customerId: string;
      status?: (typeof SupportTicketStatuses)[keyof typeof SupportTicketStatuses];
      priority?: (typeof SupportTicketPriorities)[keyof typeof SupportTicketPriorities];
      assignedToId?: string | null;
      escalatedAt?: Date | null;
      createdAt: Date;
      lastActivityAt?: Date;
      firstResponseAt?: Date | null;
      resolvedAt?: Date | null;
      closedAt?: Date | null;
    }) =>
      db.supportTicket.create({
        data: {
          status: SupportTicketStatuses.Open,
          priority: SupportTicketPriorities.Normal,
          category: "Other",
          source: "Manual",
          lastActivityAt: data.createdAt,
          assignedToId: null,
          escalatedAt: null,
          firstResponseAt: null,
          resolvedAt: null,
          closedAt: null,
          ...data,
        },
      });

    await ticket({
      number: "SUP-000001",
      subject: "Where is my parcel",
      customerId: alice.id,
      createdAt: new Date("2026-10-21T03:00:00.000Z"),
    });
    await ticket({
      number: "SUP-000002",
      subject: "Wrong item delivered",
      customerId: bob.id,
      status: SupportTicketStatuses.InProgress,
      assignedToId: agent.id,
      escalatedAt: new Date("2026-10-20T12:00:00.000Z"),
      priority: SupportTicketPriorities.Urgent,
      createdAt: new Date("2026-10-19T10:00:00.000Z"),
      firstResponseAt: new Date("2026-10-19T10:20:00.000Z"),
    });
    await ticket({
      number: "SUP-000003",
      subject: "Refund not received",
      customerId: alice.id,
      status: SupportTicketStatuses.Waiting,
      assignedToId: agent2.id,
      createdAt: new Date("2026-10-20T21:00:00.000Z"),
    });
    await ticket({
      number: "SUP-000004",
      subject: "Address correction",
      customerId: bob.id,
      status: SupportTicketStatuses.Resolved,
      assignedToId: agent.id,
      createdAt: new Date("2026-10-18T10:00:00.000Z"),
      resolvedAt: new Date("2026-10-21T05:00:00.000Z"),
      firstResponseAt: new Date("2026-10-18T10:30:00.000Z"),
    });
    await ticket({
      number: "SUP-000005",
      subject: "COD amount query",
      customerId: alice.id,
      assignedToId: agent.id,
      priority: SupportTicketPriorities.High,
      createdAt: new Date("2026-10-21T04:00:00.000Z"),
      firstResponseAt: new Date("2026-10-21T04:15:00.000Z"),
    });

    const opsOrder = await order();
    await db.afterSalesRequest.create({
      data: {
        orderId: opsOrder.id,
        userId: alice.id,
        kind: AfterSalesKinds.Return,
        reason: "Damaged on arrival",
        status: "Requested",
        requestedAt: new Date("2026-10-20T11:00:00.000Z"),
      },
    });
    const reviewOrder = await order({ number: randomUUID() });
    await db.paymentAttempt.create({
      data: {
        orderId: reviewOrder.id,
        status: PaymentAttemptStatuses.ReviewRequired,
        expiresAt: new Date("2026-10-21T10:00:00.000Z"),
        nextCheckAt: new Date("2026-10-21T06:00:00.000Z"),
      },
    });

    // ---- Assertions -------------------------------------------------------
    await test("chat KPIs count open, ownership, unread, awaiting and stale threads", async () => {
      const data = await getSupportDashboard(agent.id, "7", now);
      assert.equal(data.chat.open, 4); // c1 c2 c3 c6
      assert.equal(data.chat.unassigned, 1); // c1
      assert.equal(data.chat.mine, 1); // c2
      assert.equal(data.chat.unread, 2); // c1 + c2 (c3 belongs to another agent)
      assert.equal(data.chat.awaitingReply, 2); // c1 c3
      assert.equal(data.chat.stale, 1); // c1 is 30 minutes old; c3 is 5
      assert.equal(data.chat.resolvedToday, 1); // c4 only; c5 closed before BD midnight
      assert.equal(data.chat.avgFirstResponseMin, 11); // (10 + 12) / 2
    });

    await test("ticket KPIs count open, ownership, escalation, urgency and resolutions", async () => {
      const data = await getSupportDashboard(agent.id, "7", now);
      assert.equal(data.tickets.open, 4); // 1 2 3 5 (4 is Resolved)
      assert.equal(data.tickets.unassigned, 1); // 1
      assert.equal(data.tickets.mine, 2); // 2 and 5
      assert.equal(data.tickets.escalated, 1); // 2
      assert.equal(data.tickets.urgent, 1); // 2
      assert.equal(data.tickets.waiting, 1); // 3
      assert.equal(data.tickets.resolvedToday, 1); // 4 resolved today; SUP-000005 not resolved
      assert.equal(data.tickets.avgFirstResponseMin, 15); // only SUP-000005 created today with a note
    });

    await test("operations awareness counts requested returns and payments in review", async () => {
      const data = await getSupportDashboard(agent.id, "7", now);
      assert.equal(data.ops.returnsRequested, 1);
      assert.equal(data.ops.paymentReview, 1);
    });

    await test("trend buckets every day and sums match the raw activity", async () => {
      const data = await getSupportDashboard(agent.id, "7", now);
      assert.equal(data.trend.length, 7);
      assert.equal(
        data.trend.reduce((sum, day) => sum + day.chatsOpened, 0),
        6,
      );
      assert.equal(
        data.trend.reduce((sum, day) => sum + day.chatsClosed, 0),
        2,
      );
      assert.equal(
        data.trend.reduce((sum, day) => sum + day.ticketsOpened, 0),
        5,
      );
      assert.equal(
        data.trend.reduce((sum, day) => sum + day.ticketsResolved, 0),
        1,
      );
      const today = data.trend.at(-1)!;
      assert.equal(today.key, "2026-10-21");
      assert.equal(today.chatsOpened, 4); // c1 c2 c3 c6 fall on Oct 21 in BD time
      assert.equal(today.chatsClosed, 1); // c4
      assert.equal(today.ticketsOpened, 3); // 1 3 5
      assert.equal(today.ticketsResolved, 1); // 4
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
