import { Roles, SupportTicketPriorities, SupportTicketStatuses } from "@backend/lib/enums.mjs";
import { config } from "dotenv";
import { createPrismaClient } from "../lib/prisma-client";
import { PrismaClient, type Prisma } from "@backend/generated/prisma/client";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Role } from "@backend/generated/prisma/client";

config({ quiet: true });
async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  assert.ok(
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname),
    "Local PostgreSQL required",
  );
  const name = `test_support_tickets_${randomUUID().replaceAll("-", "")}`;
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
    const tickets = await import("../lib/support-tickets");

    const stamp = randomUUID();
    async function makeUser(name: string, roles: Role[]) {
      return db.user.create({
        data: {
          name,
          email: `${name.toLowerCase()}_${stamp}@support-tickets.invalid`,
          passwordHash: "unused",
          roles,
        },
      });
    }
    const customer = await makeUser("Customer", [Roles.Customer]);
    const other = await makeUser("Other", [Roles.Customer]);
    const agent = await makeUser("Agent", [Roles.Customer, Roles.Support]);
    const agent2 = await makeUser("Agent2", [Roles.Customer, Roles.Support]);
    const actor = { id: agent.id, role: Roles.Support };
    const actor2 = { id: agent2.id, role: Roles.Support };
    const customerActor = { id: customer.id, role: Roles.Customer };

    let createdTicketId = "";
    let createdTicketNumber = "";

    await test("only support agents can use the ticket APIs", async () => {
      const denied = await tickets.createTicket(customerActor, {
        subject: "Not allowed",
        body: "Nope",
        customerId: customer.id,
      });
      assert.equal(denied.ok, false);
      assert.match(denied.error ?? "", /support agent/i);
      const list = await tickets.listTickets(customerActor, {});
      assert.equal(list.items.length, 0);
      assert.equal(list.counts.open, 0);
      assert.equal(await tickets.getTicket(customerActor, "SUP-000001"), null);
      const note = await tickets.addTicketNote(customerActor, "any", "hello");
      assert.equal(note.ok, false);
    });

    await test("creation validates customer, order and conversation ownership", async () => {
      const badSubject = await tickets.createTicket(actor, {
        subject: "x",
        body: "Body of the case",
        customerId: customer.id,
      });
      assert.equal(badSubject.ok, false);
      assert.ok(badSubject.fieldErrors?.subject);

      const noCustomer = await tickets.createTicket(actor, {
        subject: "Missing customer",
        body: "Body of the case",
        customerId: "not-a-real-customer",
      });
      assert.equal(noCustomer.ok, false);

      const order = await db.order.create({
        data: {
          number: randomUUID(),
          userId: other.id,
          recipientName: other.name,
          phone: "01700000001",
          line1: "Road",
          city: "Dhaka",
          subtotalCents: 500,
          totalCents: 500,
          currencyCode: "BDT",
          currencySymbol: "Tk",
          paymentMethod: "COD",
        } as Prisma.OrderUncheckedCreateInput,
      });
      const mismatchedOrder = await tickets.createTicket(actor, {
        subject: "Wrong order link",
        body: "Body of the case",
        customerId: customer.id,
        orderId: order.id,
      });
      assert.equal(mismatchedOrder.ok, false);
      assert.match(mismatchedOrder.error ?? "", /belong/i);

      const conversation = await db.chatConversation.create({
        data: {
          customerId: other.id,
          subject: "Other customer thread",
          lastMessageAt: new Date(),
        },
      });
      const mismatchedConversation = await tickets.createTicket(actor, {
        subject: "Wrong conversation link",
        body: "Body of the case",
        customerId: customer.id,
        conversationId: conversation.id,
      });
      assert.equal(mismatchedConversation.ok, false);
      assert.match(mismatchedConversation.error ?? "", /belong/i);
    });

    await test("creation mints sequence numbers, links context and opens the thread", async () => {
      const first = await tickets.createTicket(actor, {
        subject: "Where is my order",
        body: "Customer asked for a status update",
        customerId: customer.id,
        category: "OrderStatus",
        priority: "High",
      });
      assert.equal(first.ok, true);
      assert.ok(first.ticketNumber);
      createdTicketNumber = first.ticketNumber!;
      createdTicketId = first.ticketId!;
      assert.match(createdTicketNumber, /^SUP-\d{6}$/);

      const second = await tickets.createTicket(actor2, {
        subject: "Second case",
        body: "Another one",
        customerId: customer.id,
      });
      assert.equal(second.ok, true);
      assert.match(second.ticketNumber!, /^SUP-\d{6}$/);
      assert.notEqual(second.ticketNumber, createdTicketNumber);

      const detail = await tickets.getTicket(actor, createdTicketNumber);
      assert.ok(detail);
      assert.equal(detail.subject, "Where is my order");
      assert.equal(detail.status, SupportTicketStatuses.Open);
      assert.equal(detail.priority, SupportTicketPriorities.High);
      assert.equal(detail.category, "OrderStatus");
      assert.equal(detail.source, "Manual");
      assert.equal(detail.customer.id, customer.id);
      assert.equal(detail.assignedTo?.id, agent.id); // creator owns it
      assert.equal(detail.escalated, false);
      assert.equal(detail.firstResponseAt, null);
      assert.equal(detail.notes.length, 1);
      assert.equal(detail.notes[0].body, "Customer asked for a status update");
      assert.equal(detail.notes[0].authorId, agent.id);
      assert.equal(detail.notes[0].authorRole, Roles.Support);
      assert.equal(await tickets.getTicket(actor, "SUP-999999"), null);
      assert.equal(await tickets.getTicket(actor, "invalid number!"), null);
    });

    await test("status changes follow the explicit transition map", async () => {
      const id = createdTicketId;
      const current = await tickets.getTicket(actor, createdTicketNumber);
      assert.deepEqual(tickets.allowedStatuses(current!.status), [
        SupportTicketStatuses.InProgress,
        SupportTicketStatuses.Waiting,
        SupportTicketStatuses.Resolved,
        SupportTicketStatuses.Closed,
      ]);
      assert.deepEqual(tickets.allowedStatuses(SupportTicketStatuses.Closed), [
        SupportTicketStatuses.Open,
      ]);

      // Legal path: Open -> InProgress -> Waiting -> Resolved -> InProgress -> Closed.
      const step1 = await tickets.setTicketStatus(actor, id, SupportTicketStatuses.InProgress);
      assert.equal(step1.ok, true);
      const step2 = await tickets.setTicketStatus(actor, id, SupportTicketStatuses.Waiting);
      assert.equal(step2.ok, true);
      const step3 = await tickets.setTicketStatus(actor, id, SupportTicketStatuses.Resolved);
      assert.equal(step3.ok, true);
      let row = await db.supportTicket.findUniqueOrThrow({ where: { id } });
      assert.equal(row.status, SupportTicketStatuses.Resolved);
      assert.ok(row.resolvedAt, "Resolved stamps resolvedAt");

      // Illegal jump out of Resolved is rejected and changes nothing.
      const illegal = await tickets.setTicketStatus(actor, id, SupportTicketStatuses.Waiting);
      assert.equal(illegal.ok, false);
      assert.match(illegal.error ?? "", /cannot move/i);
      row = await db.supportTicket.findUniqueOrThrow({ where: { id } });
      assert.equal(row.status, SupportTicketStatuses.Resolved);

      // Reopen from Resolved clears the resolution timestamp.
      const reopen = await tickets.setTicketStatus(actor, id, SupportTicketStatuses.InProgress);
      assert.equal(reopen.ok, true);
      row = await db.supportTicket.findUniqueOrThrow({ where: { id } });
      assert.equal(row.resolvedAt, null);

      // Closed stamps closedAt; a closed ticket can only go back to Open.
      const close = await tickets.setTicketStatus(actor, id, SupportTicketStatuses.Closed);
      assert.equal(close.ok, true);
      row = await db.supportTicket.findUniqueOrThrow({ where: { id } });
      assert.ok(row.closedAt);
      const fromClosed = await tickets.setTicketStatus(actor, id, SupportTicketStatuses.Waiting);
      assert.equal(fromClosed.ok, false);
      const backToOpen = await tickets.setTicketStatus(actor, id, SupportTicketStatuses.Open);
      assert.equal(backToOpen.ok, true);
      row = await db.supportTicket.findUniqueOrThrow({ where: { id } });
      assert.equal(row.closedAt, null);

      const unknown = await tickets.setTicketStatus(actor, id, "Bogus");
      assert.equal(unknown.ok, false);
      const same = await tickets.setTicketStatus(actor, id, SupportTicketStatuses.Open);
      assert.equal(same.ok, true);
    });

    await test("claim only takes unassigned tickets; assignment validates the agent", async () => {
      const created = await tickets.createTicket(actor, {
        subject: "Claim me",
        body: "Body of the case",
        customerId: customer.id,
      });
      assert.ok(created.ticketId);

      // Creator owns it, so the other agent cannot claim it.
      const stolen = await tickets.claimTicket(actor2, created.ticketId!);
      assert.equal(stolen.ok, false);
      assert.match(stolen.error ?? "", /owns/i);

      // Unassign first: claim is only for unassigned tickets.
      const unassigned = await tickets.assignTicket(actor, created.ticketId!, "");
      assert.equal(unassigned.ok, true);
      const claim = await tickets.claimTicket(actor2, created.ticketId!);
      assert.equal(claim.ok, true);
      let row = await db.supportTicket.findUniqueOrThrow({ where: { id: created.ticketId! } });
      assert.equal(row.assignedToId, agent2.id);
      const claimAgain = await tickets.claimTicket(actor2, created.ticketId!);
      assert.equal(claimAgain.ok, true); // idempotent for the owner

      // Non-agent targets and unknown agents are rejected.
      const badTarget = await tickets.assignTicket(actor, created.ticketId!, customer.id);
      assert.equal(badTarget.ok, false);
      assert.match(badTarget.error ?? "", /agent/i);
      const missingTarget = await tickets.assignTicket(actor, created.ticketId!, randomUUID());
      assert.equal(missingTarget.ok, false);

      const reassign = await tickets.assignTicket(actor, created.ticketId!, agent.id);
      assert.equal(reassign.ok, true);
      row = await db.supportTicket.findUniqueOrThrow({ where: { id: created.ticketId! } });
      assert.equal(row.assignedToId, agent.id);

      const agents = await tickets.listTicketAgents();
      assert.ok(agents.some((entry) => entry.id === agent.id));
      assert.ok(agents.some((entry) => entry.id === agent2.id));
      assert.ok(!agents.some((entry) => entry.id === customer.id));
    });

    await test("escalation flags the case and forces urgent priority", async () => {
      const created = await tickets.createTicket(actor, {
        subject: "Escalate me",
        body: "Body of the case",
        customerId: customer.id,
        priority: "Normal",
      });
      assert.ok(created.ticketId);
      const before = await db.supportTicket.findUniqueOrThrow({
        where: { id: created.ticketId! },
      });
      assert.equal(before.escalatedAt, null);

      const escalated = await tickets.escalateTicket(actor, created.ticketId!, "Needs ops now");
      assert.equal(escalated.ok, true);
      const row = await db.supportTicket.findUniqueOrThrow({ where: { id: created.ticketId! } });
      assert.ok(row.escalatedAt);
      assert.equal(row.escalationNote, "Needs ops now");
      assert.equal(row.priority, SupportTicketPriorities.Urgent);

      // Re-escalating keeps the original timestamp and the note.
      const stamped = row.escalatedAt!.toISOString();
      await tickets.escalateTicket(actor2, created.ticketId!, "");
      const again = await db.supportTicket.findUniqueOrThrow({ where: { id: created.ticketId! } });
      assert.equal(again.escalatedAt!.toISOString(), stamped);
      assert.equal(again.escalationNote, "Needs ops now");

      const tooLong = await tickets.escalateTicket(actor, created.ticketId!, "x".repeat(501));
      assert.equal(tooLong.ok, false);

      const detail = await tickets.getTicket(actor, created.ticketNumber!);
      assert.equal(detail!.escalated, true);
      assert.ok(detail!.escalatedAt);

      // Surface it in the escalated view.
      const list = await tickets.listTickets(actor, { view: "escalated" });
      assert.ok(list.items.some((entry) => entry.id === created.ticketId));
    });

    await test("the first note records the first response and closed tickets stay read-only", async () => {
      const created = await tickets.createTicket(actor, {
        subject: "Note lifecycle",
        body: "Opening description",
        customerId: customer.id,
      });
      assert.ok(created.ticketId);
      const opened = await db.supportTicket.findUniqueOrThrow({ where: { id: created.ticketId! } });
      assert.equal(opened.firstResponseAt, null);

      const noted = await tickets.addTicketNote(actor, created.ticketId!, "Checked tracking");
      assert.equal(noted.ok, true);
      const afterNote = await db.supportTicket.findUniqueOrThrow({
        where: { id: created.ticketId! },
      });
      assert.ok(afterNote.firstResponseAt, "first note sets firstResponseAt");
      assert.ok(afterNote.lastActivityAt >= opened.lastActivityAt);

      // Later notes keep the original first-response timestamp.
      await new Promise((resolve) => setTimeout(resolve, 1100));
      await tickets.addTicketNote(actor2, created.ticketId!, "Customer called back");
      const afterSecond = await db.supportTicket.findUniqueOrThrow({
        where: { id: created.ticketId! },
      });
      assert.equal(
        afterSecond.firstResponseAt!.toISOString(),
        afterNote.firstResponseAt!.toISOString(),
      );

      const empty = await tickets.addTicketNote(actor, created.ticketId!, "   ");
      assert.equal(empty.ok, false);
      assert.ok(empty.error);

      await tickets.setTicketStatus(actor, created.ticketId!, SupportTicketStatuses.Closed);
      const closedNote = await tickets.addTicketNote(actor, created.ticketId!, "Too late");
      assert.equal(closedNote.ok, false);
      assert.match(closedNote.error ?? "", /reopen/i);

      const detail = await tickets.getTicket(actor, created.ticketNumber!);
      assert.equal(detail!.notes.length, 3); // opening description + two notes
      assert.equal(detail!.notes[1].authorName, "Agent");
      assert.equal(detail!.notes[2].authorName, "Agent2");
    });

    await test("list filters by view, priority and search with pagination", async () => {
      // Build a known population.
      const openMine = await tickets.createTicket(actor, {
        subject: "Pagination alpha",
        body: "Body of the case",
        customerId: customer.id,
        priority: "Low",
      });
      const openUnassigned = await tickets.createTicket(actor, {
        subject: "Pagination beta",
        body: "Body of the case",
        customerId: other.id,
      });
      await tickets.assignTicket(actor, openUnassigned.ticketId!, "");
      const closed = await tickets.createTicket(actor, {
        subject: "Pagination gamma",
        body: "Body of the case",
        customerId: customer.id,
      });
      await tickets.setTicketStatus(actor, closed.ticketId!, SupportTicketStatuses.Closed);

      const all = await tickets.listTickets(actor, { view: "all" });
      assert.ok(all.total >= 6, "counts every ticket so far");
      assert.equal(all.pages, Math.max(1, Math.ceil(all.total / 20)));
      assert.equal(all.items.length, Math.min(20, all.total));
      assert.equal(all.counts.open, all.total - all.counts.closed);

      const mine = await tickets.listTickets(actor, { view: "mine" });
      assert.ok(mine.items.every((entry) => entry.assignedTo?.id === agent.id));
      assert.ok(mine.items.some((entry) => entry.id === openMine.ticketId));

      const unassigned = await tickets.listTickets(actor, { view: "unassigned" });
      assert.ok(unassigned.items.every((entry) => entry.assignedTo === null));
      assert.ok(unassigned.items.some((entry) => entry.id === openUnassigned.ticketId));

      const closedView = await tickets.listTickets(actor, { view: "closed" });
      assert.ok(closedView.items.some((entry) => entry.id === closed.ticketId));

      const byPriority = await tickets.listTickets(actor, { view: "all", priority: "Low" });
      assert.ok(byPriority.items.length > 0);
      assert.ok(byPriority.items.every((entry) => entry.priority === SupportTicketPriorities.Low));

      const bySearch = await tickets.listTickets(actor, { view: "all", q: "Pagination beta" });
      assert.equal(bySearch.total, 1);
      assert.equal(bySearch.items[0].id, openUnassigned.ticketId);
      assert.equal(bySearch.items[0].orderNumber, null);

      const byNumber = await tickets.listTickets(actor, { view: "all", q: openMine.ticketNumber! });
      assert.equal(byNumber.total, 1);
      assert.equal(byNumber.items[0].number, openMine.ticketNumber);

      const byCustomer = await tickets.listTickets(actor, { view: "all", q: other.name });
      assert.ok(byCustomer.items.every((entry) => entry.customer.id === other.id));

      // Invalid view falls back to open; page requests clamp to the last page.
      const fallback = await tickets.listTickets(actor, { view: "nonsense" });
      assert.equal(fallback.filters.view, "open");
      const clamped = await tickets.listTickets(actor, { view: "all", page: "999" });
      assert.equal(clamped.page, clamped.pages);
      const garbage = await tickets.listTickets(actor, { view: "all", page: "-3" });
      assert.equal(garbage.page, 1);
    });

    await test("sequence numbers are unique across concurrent creations", async () => {
      const results = await Promise.all(
        Array.from({ length: 8 }, (_, index) =>
          tickets.createTicket(actor, {
            subject: `Concurrent case ${index}`,
            body: "Body of the case",
            customerId: customer.id,
          }),
        ),
      );
      assert.ok(results.every((result) => result.ok));
      const numbers = results.map((result) => result.ticketNumber!);
      assert.equal(new Set(numbers).size, numbers.length);
      const stored = await db.supportTicket.findMany({
        where: { number: { in: numbers } },
        select: { number: true },
      });
      assert.equal(stored.length, numbers.length);
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
