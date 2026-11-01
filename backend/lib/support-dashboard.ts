import "server-only";
import { db } from "./db";
import {
  AfterSalesStatuses,
  ChatConversationStatuses,
  PaymentAttemptStatuses,
  Roles,
  SupportTicketPriorities,
  SupportTicketStatuses,
} from "./enums.mjs";
import { adminDashboardPeriods, bdDayKey, bdStartOfDay } from "./admin-dashboard-periods";

// A conversation or ticket still waiting on us after this long counts as stale.
export const STALE_AFTER_MS = 15 * 60000;

export const OPEN_TICKET_STATUSES = Object.freeze([
  SupportTicketStatuses.Open,
  SupportTicketStatuses.InProgress,
  SupportTicketStatuses.Waiting,
]);

export type SupportTrendDay = {
  key: string;
  label: string;
  chatsOpened: number;
  chatsClosed: number;
  ticketsOpened: number;
  ticketsResolved: number;
};

export type SupportDashboard = {
  period: ReturnType<typeof adminDashboardPeriods>;
  chat: {
    open: number;
    unassigned: number;
    mine: number;
    unread: number;
    awaitingReply: number;
    stale: number;
    resolvedToday: number;
    avgFirstResponseMin: number | null;
  };
  tickets: {
    open: number;
    unassigned: number;
    mine: number;
    escalated: number;
    urgent: number;
    waiting: number;
    resolvedToday: number;
    avgFirstResponseMin: number | null;
  };
  ops: {
    returnsRequested: number;
    paymentReview: number;
  };
  trend: SupportTrendDay[];
};

function average(values: number[]): number | null {
  if (!values.length) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function bucketCounts(
  dates: { key: string; label: string }[],
  samples: Date[][],
): SupportTrendDay[] {
  const [chatsOpened, chatsClosed, ticketsOpened, ticketsResolved] = samples.map((rows) => {
    const counts = new Map<string, number>();
    for (const value of rows) {
      const key = bdDayKey(value);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  });
  return dates.map((date) => ({
    key: date.key,
    label: date.label,
    chatsOpened: chatsOpened.get(date.key) ?? 0,
    chatsClosed: chatsClosed.get(date.key) ?? 0,
    ticketsOpened: ticketsOpened.get(date.key) ?? 0,
    ticketsResolved: ticketsResolved.get(date.key) ?? 0,
  }));
}

// Support portal overview: live chat health, ticket workload, the operations
// counts an agent needs when answering "why is my order late?", and a daily
// trend. Day boundaries follow Bangladesh midnight; every query runs in one
// parallel batch so the dashboard stays a single round trip.
export async function getSupportDashboard(
  agentId: string,
  range?: string,
  now = new Date(),
): Promise<SupportDashboard> {
  const period = adminDashboardPeriods(range, now);
  const todayStart = bdStartOfDay(now);
  const openTicketWhere = { status: { in: [...OPEN_TICKET_STATUSES] } };

  const [
    openConversations,
    unreadRows,
    chatResolvedToday,
    todayChatRows,
    chatFirstReplies,
    ticketsOpen,
    ticketsUnassigned,
    ticketsMine,
    ticketsEscalated,
    ticketsUrgent,
    ticketsWaiting,
    ticketsResolvedToday,
    ticketFirstResponses,
    returnsRequested,
    paymentReview,
    openedChatDates,
    closedChatDates,
    openedTicketDates,
    resolvedTicketDates,
  ] = await Promise.all([
    db.chatConversation.findMany({
      where: { status: ChatConversationStatuses.Open },
      select: {
        id: true,
        customerServiceId: true,
        lastMessageAt: true,
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { senderRole: true, createdAt: true },
        },
      },
    }),
    db.chatMessage.groupBy({
      by: ["conversationId"],
      where: {
        senderRole: Roles.Customer,
        readAt: null,
        conversation: {
          status: ChatConversationStatuses.Open,
          OR: [{ customerServiceId: null }, { customerServiceId: agentId }],
        },
      },
      _count: { _all: true },
    }),
    db.chatConversation.count({
      where: { status: ChatConversationStatuses.Closed, closedAt: { gte: todayStart } },
    }),
    db.chatConversation.findMany({
      where: { createdAt: { gte: todayStart } },
      select: { id: true, createdAt: true },
    }),
    db.chatMessage.groupBy({
      by: ["conversationId"],
      where: { senderRole: Roles.Support },
      _min: { createdAt: true },
    }),
    db.supportTicket.count({ where: openTicketWhere }),
    db.supportTicket.count({ where: { ...openTicketWhere, assignedToId: null } }),
    db.supportTicket.count({ where: { ...openTicketWhere, assignedToId: agentId } }),
    db.supportTicket.count({ where: { ...openTicketWhere, escalatedAt: { not: null } } }),
    db.supportTicket.count({
      where: { ...openTicketWhere, priority: SupportTicketPriorities.Urgent },
    }),
    db.supportTicket.count({ where: { status: SupportTicketStatuses.Waiting } }),
    db.supportTicket.count({ where: { resolvedAt: { gte: todayStart } } }),
    db.supportTicket.findMany({
      where: { createdAt: { gte: todayStart }, firstResponseAt: { not: null } },
      select: { createdAt: true, firstResponseAt: true },
    }),
    db.afterSalesRequest.count({ where: { status: AfterSalesStatuses.Requested } }),
    db.paymentAttempt.count({ where: { status: PaymentAttemptStatuses.ReviewRequired } }),
    db.chatConversation.findMany({
      where: { createdAt: { gte: period.start, lte: period.end } },
      select: { createdAt: true },
    }),
    db.chatConversation.findMany({
      where: {
        status: ChatConversationStatuses.Closed,
        closedAt: { gte: period.start, lte: period.end },
      },
      select: { closedAt: true },
    }),
    db.supportTicket.findMany({
      where: { createdAt: { gte: period.start, lte: period.end } },
      select: { createdAt: true },
    }),
    db.supportTicket.findMany({
      where: { resolvedAt: { gte: period.start, lte: period.end } },
      select: { resolvedAt: true },
    }),
  ]);

  const openIds = openConversations.map((conversation) => conversation.id);
  const unread = unreadRows
    .filter((row) => openIds.includes(row.conversationId))
    .reduce((sum, row) => sum + row._count._all, 0);

  let unassigned = 0;
  let mine = 0;
  let awaitingReply = 0;
  let stale = 0;
  for (const conversation of openConversations) {
    const isUnassigned = conversation.customerServiceId === null;
    if (isUnassigned) unassigned += 1;
    if (conversation.customerServiceId === agentId) mine += 1;
    const last = conversation.messages[0];
    const waitingOnUs = !last || last.senderRole === Roles.Customer;
    if (!waitingOnUs) continue;
    awaitingReply += 1;
    const lastAt = last?.createdAt ?? conversation.lastMessageAt;
    if (now.getTime() - lastAt.getTime() > STALE_AFTER_MS) stale += 1;
  }

  const firstReplyByConversation = new Map(
    chatFirstReplies.map((row): [string, Date] => [row.conversationId, row._min.createdAt!]),
  );
  const chatFirstResponse = average(
    todayChatRows
      .map((row) => {
        const firstReply = firstReplyByConversation.get(row.id);
        if (!firstReply) return null;
        return (firstReply.getTime() - row.createdAt.getTime()) / 60000;
      })
      .filter((minutes): minutes is number => minutes !== null && minutes >= 0),
  );

  const ticketFirstResponse = average(
    ticketFirstResponses.map(
      (row) => (row.firstResponseAt!.getTime() - row.createdAt.getTime()) / 60000,
    ),
  );

  return {
    period,
    chat: {
      open: openConversations.length,
      unassigned,
      mine,
      unread,
      awaitingReply,
      stale,
      resolvedToday: chatResolvedToday,
      avgFirstResponseMin: chatFirstResponse,
    },
    tickets: {
      open: ticketsOpen,
      unassigned: ticketsUnassigned,
      mine: ticketsMine,
      escalated: ticketsEscalated,
      urgent: ticketsUrgent,
      waiting: ticketsWaiting,
      resolvedToday: ticketsResolvedToday,
      avgFirstResponseMin: ticketFirstResponse,
    },
    ops: { returnsRequested, paymentReview },
    trend: bucketCounts(period.dates, [
      openedChatDates.map((row) => row.createdAt),
      closedChatDates.map((row) => row.closedAt!),
      openedTicketDates.map((row) => row.createdAt),
      resolvedTicketDates.map((row) => row.resolvedAt!),
    ]),
  };
}
