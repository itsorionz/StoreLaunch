import "server-only";
import { z } from "zod";
import { db } from "./db";
import {
  Roles,
  SupportTicketCategories,
  SupportTicketPriorities,
  SupportTicketSources,
  SupportTicketStatuses,
} from "./enums.mjs";
import { recordId, validationFailure } from "./form-validation";
import { OPEN_TICKET_STATUSES } from "./support-dashboard";
import type { ChatActor } from "./chat";
import type { Prisma, Role, SupportTicketStatus } from "@backend/generated/prisma/client";

export type TicketResult = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  ticketId?: string;
  ticketNumber?: string;
};

const bodySchema = z
  .string({ error: "Write a note" })
  .trim()
  .min(1, "Write a note")
  .max(2000, "Use at most 2,000 characters");

const createSchema = z.object({
  subject: z
    .string({ error: "Add a subject" })
    .trim()
    .min(3, "Use at least 3 characters")
    .max(120, "Use at most 120 characters"),
  body: bodySchema,
  customerId: recordId,
  orderId: recordId.or(z.literal("")).default(""),
  conversationId: recordId.or(z.literal("")).default(""),
  category: z.enum(SupportTicketCategories).default(SupportTicketCategories.Other),
  priority: z.enum(SupportTicketPriorities).default(SupportTicketPriorities.Normal),
});

// The workflow. Anything not listed here is rejected, so a ticket can never
// jump from Closed straight to Waiting or silently skip Resolved.
const transitions: Record<SupportTicketStatus, SupportTicketStatus[]> = {
  [SupportTicketStatuses.Open]: [
    SupportTicketStatuses.InProgress,
    SupportTicketStatuses.Waiting,
    SupportTicketStatuses.Resolved,
    SupportTicketStatuses.Closed,
  ],
  [SupportTicketStatuses.InProgress]: [
    SupportTicketStatuses.Open,
    SupportTicketStatuses.Waiting,
    SupportTicketStatuses.Resolved,
    SupportTicketStatuses.Closed,
  ],
  [SupportTicketStatuses.Waiting]: [
    SupportTicketStatuses.Open,
    SupportTicketStatuses.InProgress,
    SupportTicketStatuses.Resolved,
    SupportTicketStatuses.Closed,
  ],
  [SupportTicketStatuses.Resolved]: [
    SupportTicketStatuses.Closed,
    SupportTicketStatuses.InProgress,
  ],
  [SupportTicketStatuses.Closed]: [SupportTicketStatuses.Open],
};

export function allowedStatuses(status: SupportTicketStatus): SupportTicketStatus[] {
  return transitions[status] ?? [];
}

export function isOpenStatus(status: SupportTicketStatus): boolean {
  return (OPEN_TICKET_STATUSES as readonly SupportTicketStatus[]).includes(status);
}

const CLOSED_STATUSES: SupportTicketStatus[] = [
  SupportTicketStatuses.Resolved,
  SupportTicketStatuses.Closed,
];

export type TicketActor = ChatActor;

export type TicketNoteView = {
  id: string;
  body: string;
  authorId: string;
  authorName: string | null;
  authorRole: Role;
  createdAt: Date;
};

export type TicketCustomerView = { id: string; name: string; email: string; phone: string | null };

export type TicketSummary = {
  id: string;
  number: string;
  subject: string;
  status: SupportTicketStatus;
  priority: (typeof SupportTicketPriorities)[keyof typeof SupportTicketPriorities];
  category: (typeof SupportTicketCategories)[keyof typeof SupportTicketCategories];
  source: (typeof SupportTicketSources)[keyof typeof SupportTicketSources];
  escalated: boolean;
  customer: TicketCustomerView;
  orderNumber: string | null;
  assignedTo: { id: string; name: string } | null;
  createdAt: Date;
  lastActivityAt: Date;
  resolvedAt: Date | null;
  closedAt: Date | null;
  escalatedAt: Date | null;
};

export type TicketRow = TicketSummary & { noteCount: number };

export type TicketDetail = TicketSummary & {
  orderId: string | null;
  conversationId: string | null;
  escalationNote: string | null;
  firstResponseAt: Date | null;
  notes: TicketNoteView[];
};

export type TicketViewFilter = "open" | "mine" | "unassigned" | "escalated" | "closed" | "all";

export type TicketListParams = {
  view?: unknown;
  priority?: unknown;
  q?: unknown;
  page?: unknown;
};

export type TicketList = {
  items: TicketRow[];
  total: number;
  pages: number;
  page: number;
  counts: Record<TicketViewFilter, number>;
  filters: { view: TicketViewFilter; priority: string | null; q: string };
};

const VIEWS: TicketViewFilter[] = ["open", "mine", "unassigned", "escalated", "closed", "all"];

function viewWhere(view: TicketViewFilter, agentId: string): Prisma.SupportTicketWhereInput {
  switch (view) {
    case "mine":
      return { status: { in: [...OPEN_TICKET_STATUSES] }, assignedToId: agentId };
    case "unassigned":
      return { status: { in: [...OPEN_TICKET_STATUSES] }, assignedToId: null };
    case "escalated":
      return { status: { in: [...OPEN_TICKET_STATUSES] }, escalatedAt: { not: null } };
    case "closed":
      return { status: { in: CLOSED_STATUSES } };
    case "all":
      return {};
    default:
      return { status: { in: [...OPEN_TICKET_STATUSES] } };
  }
}

function searchWhere(params: TicketListParams): {
  where: Prisma.SupportTicketWhereInput;
  q: string;
  priority: string | null;
} {
  const priority =
    (Object.values(SupportTicketPriorities) as string[]).find(
      (value) => value === params.priority,
    ) ?? null;
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 120) : "";
  const conditions: Prisma.SupportTicketWhereInput[] = [];
  if (priority) conditions.push({ priority: priority as TicketSummary["priority"] });
  if (q)
    conditions.push({
      OR: [
        { number: { contains: q, mode: "insensitive" } },
        { subject: { contains: q, mode: "insensitive" } },
        { customer: { name: { contains: q, mode: "insensitive" } } },
        { customer: { email: { contains: q, mode: "insensitive" } } },
      ],
    });
  return { where: conditions.length ? { AND: conditions } : {}, q, priority };
}

const summaryInclude = {
  customer: { select: { id: true, name: true, email: true, phone: true } },
  order: { select: { number: true } },
  assignedTo: { select: { id: true, name: true } },
} as const;

type TicketRecord = {
  id: string;
  number: string;
  subject: string;
  status: SupportTicketStatus;
  priority: TicketSummary["priority"];
  category: TicketSummary["category"];
  source: TicketSummary["source"];
  escalatedAt: Date | null;
  customerId: string;
  orderId: string | null;
  conversationId: string | null;
  assignedToId: string | null;
  escalationNote: string | null;
  firstResponseAt: Date | null;
  resolvedAt: Date | null;
  closedAt: Date | null;
  createdAt: Date;
  lastActivityAt: Date;
  customer: TicketCustomerView;
  order: { number: string } | null;
  assignedTo: { id: string; name: string } | null;
};

function toSummary(ticket: TicketRecord): TicketSummary {
  return {
    id: ticket.id,
    number: ticket.number,
    subject: ticket.subject,
    status: ticket.status,
    priority: ticket.priority,
    category: ticket.category,
    source: ticket.source,
    escalated: Boolean(ticket.escalatedAt),
    customer: ticket.customer,
    orderNumber: ticket.order?.number ?? null,
    assignedTo: ticket.assignedTo,
    createdAt: ticket.createdAt,
    lastActivityAt: ticket.lastActivityAt,
    resolvedAt: ticket.resolvedAt,
    closedAt: ticket.closedAt,
    escalatedAt: ticket.escalatedAt,
  };
}

function assertAgent(actor: TicketActor): TicketResult | null {
  if (actor.role !== Roles.Support) return { ok: false, error: "Sign in as a support agent" };
  return null;
}

const PAGE_SIZE = 20;

// Ticket inbox: one paginated list plus the counts behind its view tabs.
// Counts follow the active search/priority filters so the tabs never lie.
export async function listTickets(
  actor: TicketActor,
  params: TicketListParams,
): Promise<TicketList> {
  const empty: TicketList = {
    items: [],
    total: 0,
    pages: 1,
    page: 1,
    counts: { open: 0, mine: 0, unassigned: 0, escalated: 0, closed: 0, all: 0 },
    filters: { view: "open", priority: null, q: "" },
  };
  if (assertAgent(actor)) return empty;
  const view: TicketViewFilter = VIEWS.includes(params.view as TicketViewFilter)
    ? (params.view as TicketViewFilter)
    : "open";
  const { where: search, q, priority } = searchWhere(params);
  const rawPage = Number(params.page ?? "1");
  const requested = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;
  const scoped = (candidate: TicketViewFilter): Prisma.SupportTicketWhereInput => ({
    AND: [search, viewWhere(candidate, actor.id)],
  });

  const total = await db.supportTicket.count({ where: scoped(view) });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requested, pages);
  const [countValues, rows] = await Promise.all([
    Promise.all(VIEWS.map((candidate) => db.supportTicket.count({ where: scoped(candidate) }))),
    db.supportTicket.findMany({
      where: scoped(view),
      orderBy: { lastActivityAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { ...summaryInclude, _count: { select: { notes: true } } },
    }),
  ]);
  const counts = Object.fromEntries(
    VIEWS.map((candidate, index) => [candidate, countValues[index]]),
  ) as Record<TicketViewFilter, number>;

  return {
    items: rows.map((ticket) => ({ ...toSummary(ticket), noteCount: ticket._count.notes })),
    total,
    pages,
    page,
    counts,
    filters: { view, priority, q },
  };
}

// Full thread for the detail screen, with author display names resolved once.
export async function getTicket(actor: TicketActor, number: unknown): Promise<TicketDetail | null> {
  if (assertAgent(actor)) return null;
  const parsed = z.string().trim().min(1).max(40).safeParse(number);
  if (!parsed.success) return null;
  const ticket = await db.supportTicket.findUnique({
    where: { number: parsed.data },
    include: { ...summaryInclude, notes: { orderBy: { createdAt: "asc" } } },
  });
  if (!ticket) return null;
  const authorIds = [...new Set(ticket.notes.map((note) => note.authorId))];
  const authors = authorIds.length
    ? await db.user.findMany({ where: { id: { in: authorIds } }, select: { id: true, name: true } })
    : [];
  const names = new Map(authors.map((author): [string, string] => [author.id, author.name]));
  return {
    ...toSummary(ticket),
    orderId: ticket.orderId,
    conversationId: ticket.conversationId,
    escalationNote: ticket.escalationNote,
    firstResponseAt: ticket.firstResponseAt,
    notes: ticket.notes.map((note) => ({
      id: note.id,
      body: note.body,
      authorId: note.authorId,
      authorName: names.get(note.authorId) ?? null,
      authorRole: note.authorRole,
      createdAt: note.createdAt,
    })),
  };
}

// Active support agents — the assignment dropdown's candidate list.
export async function listTicketAgents(): Promise<{ id: string; name: string }[]> {
  return db.user.findMany({
    where: { active: true, roles: { has: Roles.Support } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

// Creates the case and its opening description in one transaction. The number
// comes from a Postgres sequence (same race-free approach as order numbers),
// and the referenced customer/order/conversation must actually line up.
export async function createTicket(
  actor: TicketActor,
  input: {
    subject?: unknown;
    body?: unknown;
    customerId?: unknown;
    orderId?: unknown;
    conversationId?: unknown;
    category?: unknown;
    priority?: unknown;
  },
): Promise<TicketResult> {
  const denied = assertAgent(actor);
  if (denied) return denied;
  const parsed = createSchema.safeParse({
    subject: input.subject,
    body: input.body,
    customerId: input.customerId,
    orderId: input.orderId ?? "",
    conversationId: input.conversationId ?? "",
    category: input.category ?? undefined,
    priority: input.priority ?? undefined,
  });
  if (!parsed.success) return { ok: false, ...validationFailure(parsed.error) };
  const { subject, body, customerId, orderId, conversationId, category, priority } = parsed.data;

  return db.$transaction(async (tx) => {
    const customer = await tx.user.findFirst({
      where: { id: customerId, roles: { has: Roles.Customer } },
      select: { id: true },
    });
    if (!customer) return { ok: false, error: "Customer not found" };
    if (orderId) {
      const order = await tx.order.findFirst({
        where: { id: orderId, userId: customerId },
        select: { id: true },
      });
      if (!order) return { ok: false, error: "That order does not belong to this customer" };
    }
    if (conversationId) {
      const conversation = await tx.chatConversation.findFirst({
        where: { id: conversationId, customerId },
        select: { id: true },
      });
      if (!conversation)
        return { ok: false, error: "That conversation does not belong to this customer" };
    }
    const [{ value }] = await tx.$queryRaw<{ value: bigint }[]>`
      SELECT nextval('"SupportTicketNumberSeq"') AS value
    `;
    const number = `SUP-${value.toString().padStart(6, "0")}`;
    const source = conversationId
      ? SupportTicketSources.Chat
      : orderId
        ? SupportTicketSources.Order
        : SupportTicketSources.Manual;
    const ticket = await tx.supportTicket.create({
      data: {
        number,
        subject,
        customerId,
        orderId: orderId || null,
        conversationId: conversationId || null,
        assignedToId: actor.id,
        category,
        priority,
        source,
      },
      select: { id: true },
    });
    await tx.supportTicketNote.create({
      data: { ticketId: ticket.id, authorId: actor.id, authorRole: actor.role, body },
    });
    return { ok: true, ticketId: ticket.id, ticketNumber: number };
  });
}

async function lockTicket(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT id FROM "SupportTicket" WHERE id = ${id} FOR UPDATE`;
  return tx.supportTicket.findUnique({ where: { id } });
}

const ticketIdSchema = recordId;

// Internal note. The first note after creation marks the first response, and
// closed cases stay read-only so history cannot be rewritten.
export async function addTicketNote(
  actor: TicketActor,
  ticketId: unknown,
  body: unknown,
): Promise<TicketResult> {
  const denied = assertAgent(actor);
  if (denied) return denied;
  const parsedId = ticketIdSchema.safeParse(ticketId);
  if (!parsedId.success) return { ok: false, error: "Ticket not found" };
  const parsedBody = bodySchema.safeParse(body);
  if (!parsedBody.success) return { ok: false, ...validationFailure(parsedBody.error) };
  return db.$transaction(async (tx) => {
    const ticket = await lockTicket(tx, parsedId.data);
    if (!ticket) return { ok: false, error: "Ticket not found" };
    if (ticket.status === SupportTicketStatuses.Closed)
      return { ok: false, error: "Reopen the ticket to add notes" };
    await tx.supportTicketNote.create({
      data: {
        ticketId: ticket.id,
        authorId: actor.id,
        authorRole: actor.role,
        body: parsedBody.data,
      },
    });
    await tx.supportTicket.update({
      where: { id: ticket.id },
      data: {
        lastActivityAt: new Date(),
        ...(ticket.firstResponseAt ? {} : { firstResponseAt: new Date() }),
      },
    });
    return { ok: true, ticketId: ticket.id };
  });
}

export async function setTicketStatus(
  actor: TicketActor,
  ticketId: unknown,
  status: unknown,
): Promise<TicketResult> {
  const denied = assertAgent(actor);
  if (denied) return denied;
  const parsedId = ticketIdSchema.safeParse(ticketId);
  if (!parsedId.success) return { ok: false, error: "Ticket not found" };
  const parsedStatus = z.enum(SupportTicketStatuses).safeParse(status);
  if (!parsedStatus.success) return { ok: false, error: "Unknown ticket status" };
  const next = parsedStatus.data;
  return db.$transaction(async (tx) => {
    const ticket = await lockTicket(tx, parsedId.data);
    if (!ticket) return { ok: false, error: "Ticket not found" };
    if (ticket.status === next) return { ok: true, ticketId: ticket.id };
    if (!transitions[ticket.status]?.includes(next))
      return { ok: false, error: `A ${ticket.status} ticket cannot move to ${next}` };
    const now = new Date();
    const leavingDone =
      (ticket.status === SupportTicketStatuses.Resolved ||
        ticket.status === SupportTicketStatuses.Closed) &&
      !CLOSED_STATUSES.includes(next);
    await tx.supportTicket.update({
      where: { id: ticket.id },
      data: {
        status: next,
        lastActivityAt: now,
        resolvedAt:
          next === SupportTicketStatuses.Resolved && !ticket.resolvedAt
            ? now
            : leavingDone
              ? null
              : undefined,
        closedAt:
          next === SupportTicketStatuses.Closed
            ? now
            : ticket.status === SupportTicketStatuses.Closed
              ? null
              : undefined,
      },
    });
    return { ok: true, ticketId: ticket.id };
  });
}

export async function setTicketPriority(
  actor: TicketActor,
  ticketId: unknown,
  priority: unknown,
): Promise<TicketResult> {
  const denied = assertAgent(actor);
  if (denied) return denied;
  const parsedId = ticketIdSchema.safeParse(ticketId);
  if (!parsedId.success) return { ok: false, error: "Ticket not found" };
  const parsedPriority = z.enum(SupportTicketPriorities).safeParse(priority);
  if (!parsedPriority.success) return { ok: false, error: "Unknown priority" };
  return db.$transaction(async (tx) => {
    const ticket = await lockTicket(tx, parsedId.data);
    if (!ticket) return { ok: false, error: "Ticket not found" };
    await tx.supportTicket.update({
      where: { id: ticket.id },
      data: { priority: parsedPriority.data, lastActivityAt: new Date() },
    });
    return { ok: true, ticketId: ticket.id };
  });
}

// Claim: unassigned → me. Already mine stays a no-op; someone else's case is
// rejected (same semantics as claiming a conversation).
export async function claimTicket(actor: TicketActor, ticketId: unknown): Promise<TicketResult> {
  const denied = assertAgent(actor);
  if (denied) return denied;
  const parsedId = ticketIdSchema.safeParse(ticketId);
  if (!parsedId.success) return { ok: false, error: "Ticket not found" };
  return db.$transaction(async (tx) => {
    const ticket = await lockTicket(tx, parsedId.data);
    if (!ticket) return { ok: false, error: "Ticket not found" };
    if (ticket.assignedToId === actor.id) return { ok: true, ticketId: ticket.id };
    if (ticket.assignedToId) return { ok: false, error: "Another agent owns this ticket" };
    await tx.supportTicket.update({
      where: { id: ticket.id },
      data: { assignedToId: actor.id, lastActivityAt: new Date() },
    });
    return { ok: true, ticketId: ticket.id };
  });
}

// Reassignment (or "" to unassign). Any active support agent is a valid target;
// assignment is workflow, not authorization (plan decision D11).
export async function assignTicket(
  actor: TicketActor,
  ticketId: unknown,
  targetUserId: unknown,
): Promise<TicketResult> {
  const denied = assertAgent(actor);
  if (denied) return denied;
  const parsedId = ticketIdSchema.safeParse(ticketId);
  if (!parsedId.success) return { ok: false, error: "Ticket not found" };
  const target = typeof targetUserId === "string" ? targetUserId.trim() : "";
  if (target && !recordId.safeParse(target).success) return { ok: false, error: "Choose an agent" };
  return db.$transaction(async (tx) => {
    const ticket = await lockTicket(tx, parsedId.data);
    if (!ticket) return { ok: false, error: "Ticket not found" };
    if (target) {
      const agent = await tx.user.findFirst({
        where: { id: target, active: true, roles: { has: Roles.Support } },
        select: { id: true },
      });
      if (!agent) return { ok: false, error: "Choose an active support agent" };
    }
    await tx.supportTicket.update({
      where: { id: ticket.id },
      data: { assignedToId: target || null, lastActivityAt: new Date() },
    });
    return { ok: true, ticketId: ticket.id };
  });
}

// Escalation flag for ops/management attention: stamps the time, keeps the
// note and bumps priority to Urgent (a lower priority cannot survive an
// escalation). Re-escalating only refreshes the note.
export async function escalateTicket(
  actor: TicketActor,
  ticketId: unknown,
  note?: unknown,
): Promise<TicketResult> {
  const denied = assertAgent(actor);
  if (denied) return denied;
  const parsedId = ticketIdSchema.safeParse(ticketId);
  if (!parsedId.success) return { ok: false, error: "Ticket not found" };
  const parsedNote = z
    .string()
    .trim()
    .max(500, "Use at most 500 characters")
    .safeParse(typeof note === "string" ? note : "");
  if (!parsedNote.success) return { ok: false, ...validationFailure(parsedNote.error) };
  return db.$transaction(async (tx) => {
    const ticket = await lockTicket(tx, parsedId.data);
    if (!ticket) return { ok: false, error: "Ticket not found" };
    await tx.supportTicket.update({
      where: { id: ticket.id },
      data: {
        escalatedAt: ticket.escalatedAt ?? new Date(),
        escalationNote: parsedNote.data || ticket.escalationNote,
        priority: SupportTicketPriorities.Urgent,
        lastActivityAt: new Date(),
      },
    });
    return { ok: true, ticketId: ticket.id };
  });
}
