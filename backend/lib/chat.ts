import "server-only";
import { z } from "zod";
import { db } from "./db";
import { ChatConversationStatuses, InboxCategories, Roles } from "./enums.mjs";
import { recordId, validationFailure } from "./form-validation";
import type { ChatConversationStatus, Role } from "@backend/generated/prisma/client";

export type ChatActor = { id: string; role: Role };

export type ChatResult = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  conversationId?: string;
  messageId?: string;
};

const bodySchema = z
  .string({ error: "Write a message" })
  .trim()
  .min(1, "Write a message")
  .max(2000, "Use at most 2,000 characters");

const startSchema = z.object({
  subject: z.string().trim().max(120, "Use at most 120 characters").default(""),
  body: bodySchema,
  orderId: recordId.or(z.literal("")).default(""),
});

export type ChatMessageView = {
  id: string;
  body: string;
  senderId: string;
  senderRole: Role;
  createdAt: Date;
  readAt: Date | null;
};

export type ChatCustomerView = { id: string; name: string; email: string; phone: string | null };
export type ChatAgentView = { id: string; name: string } | null;

export type ChatThread = {
  id: string;
  status: ChatConversationStatus;
  subject: string | null;
  orderNumber: string | null;
  createdAt: Date;
  lastMessageAt: Date;
  closedAt: Date | null;
  customer: ChatCustomerView;
  agent: ChatAgentView;
  messages: ChatMessageView[];
};

export type ChatPreview = Omit<ChatThread, "messages"> & {
  preview: { body: string; createdAt: Date; senderRole: Role } | null;
};

export type QueueItem = ChatPreview & { unread: number; mine: boolean };

// Opens the customer's single Open thread (creating it when needed) and posts the
// first message. The customer row lock serializes concurrent starts so a customer
// can never end up with two open conversations.
export async function startConversation(
  actor: ChatActor,
  input: { subject?: unknown; body?: unknown; orderId?: unknown },
): Promise<ChatResult> {
  if (actor.role !== Roles.Customer)
    return { ok: false, error: "Only customer accounts start a support chat" };
  const parsed = startSchema.safeParse({
    subject: input.subject ?? undefined,
    body: input.body,
    orderId: input.orderId ?? undefined,
  });
  if (!parsed.success) return { ok: false, ...validationFailure(parsed.error) };
  const { subject, body, orderId } = parsed.data;
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${actor.id} FOR UPDATE`;
    if (orderId) {
      const order = await tx.order.findFirst({
        where: { id: orderId, userId: actor.id },
        select: { id: true },
      });
      if (!order) return { ok: false, error: "Order not found" };
    }
    let conversation = await tx.chatConversation.findFirst({
      where: { customerId: actor.id, status: ChatConversationStatuses.Open },
      select: { id: true },
    });
    if (!conversation)
      conversation = await tx.chatConversation.create({
        data: {
          customerId: actor.id,
          subject: subject || null,
          orderId: orderId || null,
        },
        select: { id: true },
      });
    await tx.chatMessage.create({
      data: {
        conversationId: conversation.id,
        senderId: actor.id,
        senderRole: actor.role,
        body,
      },
    });
    await tx.chatConversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date() },
    });
    return { ok: true, conversationId: conversation.id };
  });
}

// Customers post only into their own open threads; agents post into any open
// thread they own (the first reply claims an unassigned one).
export async function postMessage(
  actor: ChatActor,
  conversationId: unknown,
  body: unknown,
): Promise<ChatResult> {
  const parsedId = recordId.safeParse(conversationId);
  if (!parsedId.success) return { ok: false, error: "Conversation not found" };
  const parsedBody = bodySchema.safeParse(body);
  if (!parsedBody.success) return { ok: false, ...validationFailure(parsedBody.error) };
  const isAgent = actor.role === Roles.Support;
  if (!isAgent && actor.role !== Roles.Customer)
    return { ok: false, error: "Sign in to chat with support" };
  const conversationIdValue = parsedId.data;
  const bodyValue = parsedBody.data;
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "ChatConversation" WHERE id = ${conversationIdValue} FOR UPDATE`;
    const conversation = await tx.chatConversation.findUnique({
      where: { id: conversationIdValue },
      select: { id: true, customerId: true, customerServiceId: true, status: true },
    });
    if (!conversation) return { ok: false, error: "Conversation not found" };
    if (!isAgent && conversation.customerId !== actor.id)
      return { ok: false, error: "Conversation not found" };
    if (conversation.status !== ChatConversationStatuses.Open)
      return { ok: false, error: "This conversation is closed" };
    if (isAgent && conversation.customerServiceId && conversation.customerServiceId !== actor.id)
      return { ok: false, error: "Another agent is already helping this customer" };
    const message = await tx.chatMessage.create({
      data: {
        conversationId: conversation.id,
        senderId: actor.id,
        senderRole: actor.role,
        body: bodyValue,
      },
      select: { id: true },
    });
    await tx.chatConversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: new Date(),
        // The first agent reply claims an unassigned thread.
        ...(isAgent && !conversation.customerServiceId ? { customerServiceId: actor.id } : {}),
      },
    });
    if (isAgent)
      await tx.inboxMessage.createMany({
        data: [
          {
            userId: conversation.customerId,
            category: InboxCategories.NOTIFICATION,
            title: "Support replied",
            body: bodyValue.length > 160 ? `${bodyValue.slice(0, 157)}…` : bodyValue,
            href: "/account/chat",
            // The unique (userId, sourceKey) pair keeps delivery idempotent.
            sourceKey: `chat:${conversation.id}:${message.id}`,
          },
        ],
        skipDuplicates: true,
      });
    return { ok: true, conversationId: conversation.id, messageId: message.id };
  });
}

// Explicit claim from the queue; concurrent claims resolve to a single winner.
export async function claimConversation(
  actor: ChatActor,
  conversationId: unknown,
): Promise<ChatResult> {
  if (actor.role !== Roles.Support) return { ok: false, error: "Sign in as a support agent" };
  const parsedId = recordId.safeParse(conversationId);
  if (!parsedId.success) return { ok: false, error: "Conversation not found" };
  const conversationIdValue = parsedId.data;
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "ChatConversation" WHERE id = ${conversationIdValue} FOR UPDATE`;
    const conversation = await tx.chatConversation.findUnique({
      where: { id: conversationIdValue },
      select: { id: true, status: true, customerServiceId: true },
    });
    if (!conversation) return { ok: false, error: "Conversation not found" };
    if (conversation.status !== ChatConversationStatuses.Open)
      return { ok: false, error: "This conversation is closed" };
    if (conversation.customerServiceId === actor.id)
      return { ok: true, conversationId: conversation.id };
    if (conversation.customerServiceId)
      return { ok: false, error: "Another agent is already helping this customer" };
    await tx.chatConversation.update({
      where: { id: conversation.id },
      data: { customerServiceId: actor.id },
    });
    return { ok: true, conversationId: conversation.id };
  });
}

// Agents close their own (or unassigned) threads; closing twice stays a no-op.
export async function closeConversation(
  actor: ChatActor,
  conversationId: unknown,
): Promise<ChatResult> {
  if (actor.role !== Roles.Support) return { ok: false, error: "Sign in as a support agent" };
  const parsedId = recordId.safeParse(conversationId);
  if (!parsedId.success) return { ok: false, error: "Conversation not found" };
  const conversationIdValue = parsedId.data;
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "ChatConversation" WHERE id = ${conversationIdValue} FOR UPDATE`;
    const conversation = await tx.chatConversation.findUnique({
      where: { id: conversationIdValue },
      select: { id: true, status: true, customerServiceId: true },
    });
    if (!conversation) return { ok: false, error: "Conversation not found" };
    if (conversation.status === ChatConversationStatuses.Closed)
      return { ok: true, conversationId: conversation.id };
    if (conversation.customerServiceId && conversation.customerServiceId !== actor.id)
      return { ok: false, error: "Another agent is already helping this customer" };
    await tx.chatConversation.update({
      where: { id: conversation.id },
      data: {
        status: ChatConversationStatuses.Closed,
        closedAt: new Date(),
        customerServiceId: conversation.customerServiceId ?? actor.id,
      },
    });
    return { ok: true, conversationId: conversation.id };
  });
}

// Authorization-scoped fetch: customers see only their own threads. Reading the
// thread marks the counterpart's replies as seen by this side.
export async function getConversation(
  actor: ChatActor,
  conversationId: unknown,
): Promise<ChatThread | null> {
  const parsedId = recordId.safeParse(conversationId);
  if (!parsedId.success) return null;
  const isAgent = actor.role === Roles.Support;
  // Mark the counterpart's replies as seen before fetching so the returned
  // snapshot reflects the read state. The relation filter keeps a customer from
  // touching threads that are not theirs.
  await db.chatMessage.updateMany({
    where: {
      conversationId: parsedId.data,
      senderRole: isAgent ? Roles.Customer : Roles.Support,
      readAt: null,
      ...(isAgent ? {} : { conversation: { customerId: actor.id } }),
    },
    data: { readAt: new Date() },
  });
  const conversation = await db.chatConversation.findFirst({
    where: {
      id: parsedId.data,
      ...(isAgent ? {} : { customerId: actor.id }),
    },
    include: {
      customer: { select: { id: true, name: true, email: true, phone: true } },
      agent: { select: { id: true, name: true } },
      messages: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!conversation) return null;
  const orderNumber = conversation.orderId
    ? ((
        await db.order.findUnique({
          where: { id: conversation.orderId },
          select: { number: true },
        })
      )?.number ?? null)
    : null;
  return {
    id: conversation.id,
    status: conversation.status,
    subject: conversation.subject,
    orderNumber,
    createdAt: conversation.createdAt,
    lastMessageAt: conversation.lastMessageAt,
    closedAt: conversation.closedAt,
    customer: conversation.customer,
    agent: conversation.agent,
    messages: conversation.messages,
  };
}

type PreviewRow = {
  id: string;
  status: ChatConversationStatus;
  subject: string | null;
  orderId: string | null;
  createdAt: Date;
  lastMessageAt: Date;
  closedAt: Date | null;
  customer: ChatCustomerView;
  agent: ChatAgentView;
  messages: { body: string; createdAt: Date; senderRole: Role }[];
};

async function orderNumberMap(orderIds: (string | null)[]): Promise<Map<string, string>> {
  const unique = [...new Set(orderIds.filter((id): id is string => id !== null))];
  if (!unique.length) return new Map();
  const orders = await db.order.findMany({
    where: { id: { in: unique } },
    select: { id: true, number: true },
  });
  return new Map(orders.map((order): [string, string] => [order.id, order.number]));
}

function toPreview(conversation: PreviewRow, numbers: Map<string, string>): ChatPreview {
  return {
    id: conversation.id,
    status: conversation.status,
    subject: conversation.subject,
    orderNumber: conversation.orderId ? (numbers.get(conversation.orderId) ?? null) : null,
    createdAt: conversation.createdAt,
    lastMessageAt: conversation.lastMessageAt,
    closedAt: conversation.closedAt,
    customer: conversation.customer,
    agent: conversation.agent,
    preview: conversation.messages[0] ?? null,
  };
}

// Agent queue: every open thread, unassigned first, then mine, then other
// agents'. Unread counts cover unassigned threads plus the agent's own.
export async function listOpenConversations(actor: ChatActor): Promise<QueueItem[]> {
  if (actor.role !== Roles.Support) return [];
  const conversations = await db.chatConversation.findMany({
    where: { status: ChatConversationStatuses.Open },
    orderBy: { lastMessageAt: "desc" },
    include: {
      customer: { select: { id: true, name: true, email: true, phone: true } },
      agent: { select: { id: true, name: true } },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { body: true, createdAt: true, senderRole: true },
      },
    },
  });
  const visibleIds = conversations
    .filter(
      (conversation) =>
        !conversation.customerServiceId || conversation.customerServiceId === actor.id,
    )
    .map((conversation) => conversation.id);
  const unreadRows = await db.chatMessage.groupBy({
    by: ["conversationId"],
    where: {
      conversationId: { in: visibleIds },
      senderRole: Roles.Customer,
      readAt: null,
    },
    _count: { _all: true },
  });
  const unread = new Map(
    unreadRows.map((row): [string, number] => [row.conversationId, row._count._all]),
  );
  const numbers = await orderNumberMap(conversations.map((conversation) => conversation.orderId));
  const items = conversations.map((conversation): QueueItem => ({
    ...toPreview(conversation, numbers),
    unread: unread.get(conversation.id) ?? 0,
    mine: conversation.customerServiceId === actor.id,
  }));
  const rank = (item: QueueItem) => (item.agent ? (item.mine ? 1 : 2) : 0);
  return items.sort((a, b) => rank(a) - rank(b));
}

// Customer's view: the open thread in full plus collapsed previews of history.
// Opening the chat screen reads the agent's replies, so they are marked seen here.
export async function listCustomerConversations(
  actor: ChatActor,
): Promise<{ open: ChatThread | null; closed: ChatPreview[] }> {
  if (actor.role !== Roles.Customer) return { open: null, closed: [] };
  const [openRow, closedRows] = await Promise.all([
    db.chatConversation.findFirst({
      where: { customerId: actor.id, status: ChatConversationStatuses.Open },
      include: {
        customer: { select: { id: true, name: true, email: true, phone: true } },
        agent: { select: { id: true, name: true } },
        messages: { orderBy: { createdAt: "asc" } },
      },
    }),
    db.chatConversation.findMany({
      where: { customerId: actor.id, status: ChatConversationStatuses.Closed },
      orderBy: { lastMessageAt: "desc" },
      take: 50,
      include: {
        customer: { select: { id: true, name: true, email: true, phone: true } },
        agent: { select: { id: true, name: true } },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { body: true, createdAt: true, senderRole: true },
        },
      },
    }),
  ]);
  if (openRow)
    await db.chatMessage.updateMany({
      where: {
        conversationId: openRow.id,
        senderRole: Roles.Support,
        readAt: null,
      },
      data: { readAt: new Date() },
    });
  const numbers = await orderNumberMap([
    ...(openRow ? [openRow.orderId] : []),
    ...closedRows.map((conversation) => conversation.orderId),
  ]);
  const open: ChatThread | null = openRow
    ? {
        id: openRow.id,
        status: openRow.status,
        subject: openRow.subject,
        orderNumber: openRow.orderId ? (numbers.get(openRow.orderId) ?? null) : null,
        createdAt: openRow.createdAt,
        lastMessageAt: openRow.lastMessageAt,
        closedAt: openRow.closedAt,
        customer: openRow.customer,
        agent: openRow.agent,
        messages: openRow.messages,
      }
    : null;
  return { open, closed: closedRows.map((conversation) => toPreview(conversation, numbers)) };
}

// Closed history for the portal, 20 per page like the account inbox.
export async function listClosedConversations(
  actor: ChatActor,
  page = 1,
): Promise<{ items: ChatPreview[]; total: number; pages: number }> {
  if (actor.role !== Roles.Support) return { items: [], total: 0, pages: 1 };
  const total = await db.chatConversation.count({
    where: { status: ChatConversationStatuses.Closed },
  });
  const pages = Math.max(1, Math.ceil(total / 20));
  const currentPage = Math.min(Math.max(1, page), pages);
  const rows = await db.chatConversation.findMany({
    where: { status: ChatConversationStatuses.Closed },
    orderBy: { closedAt: "desc" },
    skip: (currentPage - 1) * 20,
    take: 20,
    include: {
      customer: { select: { id: true, name: true, email: true, phone: true } },
      agent: { select: { id: true, name: true } },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { body: true, createdAt: true, senderRole: true },
      },
    },
  });
  const numbers = await orderNumberMap(rows.map((conversation) => conversation.orderId));
  return { items: rows.map((conversation) => toPreview(conversation, numbers)), total, pages };
}

// Customers count unread service replies; agents count unread customer messages
// across unassigned threads and their own (never another agent's).
export async function getUnreadCounts(actor: ChatActor): Promise<number> {
  if (actor.role === Roles.Support)
    return db.chatMessage.count({
      where: {
        senderRole: Roles.Customer,
        readAt: null,
        conversation: {
          status: ChatConversationStatuses.Open,
          OR: [{ customerServiceId: null }, { customerServiceId: actor.id }],
        },
      },
    });
  return db.chatMessage.count({
    where: {
      senderRole: Roles.Support,
      readAt: null,
      conversation: { customerId: actor.id },
    },
  });
}
