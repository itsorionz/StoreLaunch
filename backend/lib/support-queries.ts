import "server-only";
import { db } from "./db";
import { Roles, SupportTicketStatuses } from "./enums.mjs";
import { orderTextWhere, userTextWhere } from "./search-filters";
import type { Prisma } from "@backend/generated/prisma/client";

const PAGE_SIZE = 20;

export type SupportOrderQueueEntry = { label: string; where: Prisma.OrderWhereInput };

/**
 * /support/customers — customer directory: one page of matching customers
 * plus the counts behind the All / With wallet balance pills.
 */
export async function getSupportCustomerDirectory(filters: {
  q: string;
  segment: "wallet" | "all";
  requestedPage: number;
}) {
  const { q, segment, requestedPage: requested } = filters;

  const base = {
    roles: { has: Roles.Customer },
    ...(q ? userTextWhere(q) : {}),
  };

  const countWhere = (candidate: string) =>
    candidate === "wallet"
      ? { AND: [base, { wallet: { is: { balanceCents: { gt: 0 } } } }] }
      : base;

  const total = await db.user.count({ where: countWhere(segment) });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requested, pages);

  const [customers, segmentCounts] = await Promise.all([
    db.user.findMany({
      where: countWhere(segment),
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        createdAt: true,
        active: true,
        wallet: { select: { balanceCents: true } },
        _count: { select: { orders: true, chatConversations: true, supportTickets: true } },
      },
    }),
    Promise.all([
      db.user.count({ where: base }),
      db.user.count({ where: countWhere("wallet") }),
    ]).then(([all, wallet]) => ({ all, wallet })),
  ]);

  return { customers, segmentCounts, total, pages, page };
}

/** /support/customers/[id] — customer 360 header row; null when the id is not a customer */
export async function getSupportCustomer(id: string) {
  return db.user.findFirst({
    where: { id, roles: { has: Roles.Customer } },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      active: true,
      createdAt: true,
      gender: true,
      wallet: { select: { balanceCents: true } },
      _count: { select: { orders: true, chatConversations: true, supportTickets: true } },
    },
  });
}

/**
 * /support/customers/[id] — history rail: recent orders, chats, tickets,
 * feedback, reviews and lifetime spend.
 */
export async function listSupportCustomerHistory(customerId: string) {
  const [orders, conversations, tickets, feedback, reviews, spend] = await Promise.all([
    db.order.findMany({
      where: { userId: customerId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        number: true,
        status: true,
        totalCents: true,
        currencySymbol: true,
        currencyCode: true,
        paymentMethod: true,
        createdAt: true,
        items: { select: { quantity: true } },
      },
    }),
    db.chatConversation.findMany({
      where: { customerId },
      orderBy: { lastMessageAt: "desc" },
      take: 6,
      select: {
        id: true,
        subject: true,
        status: true,
        createdAt: true,
        lastMessageAt: true,
        agent: { select: { name: true } },
      },
    }),
    db.supportTicket.findMany({
      where: { customerId },
      orderBy: { lastActivityAt: "desc" },
      take: 6,
      select: {
        id: true,
        number: true,
        subject: true,
        status: true,
        priority: true,
        escalatedAt: true,
        createdAt: true,
        assignedTo: { select: { name: true } },
      },
    }),
    db.feedback.findMany({
      where: { userId: customerId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, kind: true, message: true, rating: true, createdAt: true },
    }),
    db.review.findMany({
      where: { userId: customerId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        rating: true,
        body: true,
        status: true,
        createdAt: true,
        product: { select: { name: true } },
      },
    }),
    db.order.aggregate({
      where: { userId: customerId, paidAt: { not: null } },
      _sum: { totalCents: true },
      _count: true,
    }),
  ]);

  return { orders, conversations, tickets, feedback, reviews, spend };
}

/**
 * /support/orders — order lookup: newest matches for the active queue and
 * search, plus the counts behind the queue pills.
 */
export async function listSupportOrders(filters: {
  queues: Record<string, SupportOrderQueueEntry>;
  queue: SupportOrderQueueEntry | undefined;
  q: string;
}) {
  const { queues, queue, q } = filters;

  const [orders, counts] = await Promise.all([
    db.order.findMany({
      where: { AND: [queue?.where ?? {}, q ? orderTextWhere(q) : {}] },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        user: { select: { id: true, name: true } },
        items: { select: { quantity: true } },
      },
    }),
    Promise.all(
      Object.entries(queues).map(([, entry]) => db.order.count({ where: entry.where })),
    ).then(
      (values) =>
        Object.fromEntries(Object.keys(queues).map((key, index) => [key, values[index]])) as Record<
          string,
          number
        >,
    ),
  ]);

  return { orders, counts };
}

/** /support/orders/[number] — full read-only order payload (payments, after-sales, tickets) */
export async function getSupportOrderDetail(number: string) {
  return db.order.findUnique({
    where: { number },
    include: {
      paymentAttempt: true,
      refunds: { orderBy: { createdAt: "desc" } },
      afterSalesRequests: {
        include: { refunds: true, items: { include: { orderItem: true } } },
        orderBy: { requestedAt: "desc" },
      },
      deliveryProof: {
        select: {
          id: true,
          orderId: true,
          riderId: true,
          receivedBy: true,
          relationship: true,
          note: true,
          photoKey: true,
          photoMime: true,
          createdAt: true,
        },
      },
      deliveryAttempts: { orderBy: { createdAt: "desc" } },
      items: true,
      user: { select: { id: true, name: true, email: true } },
      events: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
      supportTickets: {
        orderBy: { lastActivityAt: "desc" },
        take: 5,
        select: { id: true, number: true, subject: true, status: true, priority: true },
      },
    },
  });
}

/** /support/orders/[number] — sidebar: the buyer's recent conversations and open ticket count */
export async function listOrderCustomerContext(userId: string) {
  const [conversations, customerTickets] = await Promise.all([
    db.chatConversation.findMany({
      where: { customerId: userId },
      orderBy: { lastMessageAt: "desc" },
      take: 5,
      select: { id: true, subject: true, status: true, lastMessageAt: true },
    }),
    db.supportTicket.count({
      where: {
        customerId: userId,
        status: { notIn: [SupportTicketStatuses.Closed] },
      },
    }),
  ]);

  return { conversations, customerTickets };
}

/**
 * /support/conversation/[id] — context rail: the customer's recent orders
 * and open cases.
 */
export async function listConversationCustomerContext(customerId: string) {
  const [recentOrders, openTickets] = await Promise.all([
    db.order.findMany({
      where: { userId: customerId },
      orderBy: { createdAt: "desc" },
      take: 4,
      select: {
        id: true,
        number: true,
        status: true,
        totalCents: true,
        currencySymbol: true,
        currencyCode: true,
        createdAt: true,
      },
    }),
    db.supportTicket.findMany({
      where: {
        customerId,
        status: { notIn: [SupportTicketStatuses.Closed] },
      },
      orderBy: { lastActivityAt: "desc" },
      take: 4,
      select: { id: true, number: true, subject: true, status: true, priority: true },
    }),
  ]);

  return { recentOrders, openTickets };
}

/** /support/tickets/new — conversation picked as the ticket's context */
export async function getTicketPrefillConversation(conversationId: string) {
  return db.chatConversation.findUnique({
    where: { id: conversationId },
    include: { customer: { select: { id: true, name: true, email: true } } },
  });
}

/** /support/tickets/new — order picked as the ticket's context */
export async function getTicketPrefillOrder(orderId: string) {
  return db.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      number: true,
      user: { select: { id: true, name: true, email: true } },
    },
  });
}

/** /support/tickets/new — customer picked as the ticket's context */
export async function getTicketPrefillCustomer(customerId: string) {
  return db.user.findFirst({
    where: { id: customerId, roles: { has: Roles.Customer } },
    select: { id: true, name: true, email: true },
  });
}
