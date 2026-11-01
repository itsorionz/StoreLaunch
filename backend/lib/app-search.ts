import "server-only";
import { db } from "./db";
import { Roles } from "./enums.mjs";
import { SearchLimits, SearchKinds } from "./search-config.mjs";
import { literalSearchTerm, orderTextWhere, productTextWhere, searchTerms } from "./search-filters";

export async function searchAdmin(query: string) {
  const take = SearchLimits.resultCount;
  const matches = searchTerms(query).map((term) => ({
    contains: literalSearchTerm(term),
    mode: "insensitive" as const,
  }));
  const [products, orders, customers, riders, brands, categories] = await Promise.all([
    db.product.findMany({
      where: productTextWhere(query),
      select: { id: true, name: true, slug: true, sku: true, active: true },
      orderBy: { name: "asc" },
      take,
    }),
    db.order.findMany({
      where: orderTextWhere(query),
      select: { number: true, recipientName: true, status: true },
      orderBy: { createdAt: "desc" },
      take,
    }),
    db.user.findMany({
      where: {
        roles: { has: Roles.Customer },
        AND: matches.map((match) => ({
          OR: [{ name: match }, { email: match }, { phone: match }],
        })),
      },
      select: { id: true, name: true, email: true },
      take,
    }),
    db.rider.findMany({
      where: { AND: matches.map((match) => ({ OR: [{ name: match }, { phone: match }] })) },
      select: { id: true, name: true, phone: true },
      take,
    }),
    db.brand.findMany({
      where: { AND: matches.map((match) => ({ OR: [{ name: match }, { slug: match }] })) },
      select: { id: true, name: true, slug: true },
      take,
    }),
    db.category.findMany({
      where: { AND: matches.map((match) => ({ OR: [{ name: match }, { slug: match }] })) },
      select: { id: true, name: true, slug: true },
      take,
    }),
  ]);
  return [
    {
      kind: SearchKinds.products,
      rows: products.map((product) => ({
        id: product.id,
        title: product.name,
        detail: product.sku ? `${product.sku} · ${product.slug}` : product.slug,
        href: `/admin/products/${product.id}`,
      })),
    },
    {
      kind: SearchKinds.orders,
      rows: orders.map((order) => ({
        id: order.number,
        title: order.number,
        detail: `${order.recipientName} · ${order.status}`,
        href: `/admin/orders/${order.number}`,
      })),
    },
    {
      kind: SearchKinds.customers,
      rows: customers.map((customer) => ({
        id: customer.id,
        title: customer.name,
        detail: customer.email,
        href: "/admin/customers",
      })),
    },
    {
      kind: SearchKinds.riders,
      rows: riders.map((rider) => ({
        id: rider.id,
        title: rider.name,
        detail: rider.phone,
        href: "/admin/riders",
      })),
    },
    {
      kind: SearchKinds.brands,
      rows: brands.map((brand) => ({
        id: brand.id,
        title: brand.name,
        detail: brand.slug,
        href: "/admin/brands",
      })),
    },
    {
      kind: SearchKinds.categories,
      rows: categories.map((category) => ({
        id: category.id,
        title: category.name,
        detail: category.slug,
        href: "/admin/categories",
      })),
    },
  ];
}

export async function searchRider(riderId: string, query: string) {
  const orders = await db.order.findMany({
    where: { riderId, ...orderTextWhere(query) },
    select: { number: true, recipientName: true, city: true, status: true },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  return [
    {
      kind: SearchKinds.orders,
      rows: orders.map((order) => ({
        id: order.number,
        title: order.number,
        detail: `${order.recipientName} · ${order.city} · ${order.status}`,
        href: `/rider/orders/${order.number}`,
      })),
    },
  ];
}

// Support-portal search: orders, customers, tickets and live conversations in
// one pass — the "find anything about this shopper" tool an agent needs.
export async function searchSupport(query: string) {
  const take = SearchLimits.resultCount;
  const matches = searchTerms(query).map((term) => ({
    contains: literalSearchTerm(term),
    mode: "insensitive" as const,
  }));
  const [orders, customers, tickets, conversations] = await Promise.all([
    db.order.findMany({
      where: orderTextWhere(query),
      select: { number: true, recipientName: true, status: true },
      orderBy: { createdAt: "desc" },
      take,
    }),
    db.user.findMany({
      where: {
        roles: { has: Roles.Customer },
        AND: matches.map((match) => ({
          OR: [{ name: match }, { email: match }, { phone: match }],
        })),
      },
      select: { id: true, name: true, email: true, phone: true },
      take,
    }),
    db.supportTicket.findMany({
      where: {
        AND: matches.map((match) => ({
          OR: [
            { number: match },
            { subject: match },
            { customer: { name: match } },
            { customer: { email: match } },
          ],
        })),
      },
      select: {
        number: true,
        subject: true,
        status: true,
        priority: true,
        customer: { select: { name: true } },
      },
      orderBy: { lastActivityAt: "desc" },
      take,
    }),
    db.chatConversation.findMany({
      where: {
        OR: [
          ...matches.map((match) => ({ subject: match })),
          {
            customer: {
              OR: matches.flatMap((match) => [{ name: match }, { email: match }, { phone: match }]),
            },
          },
        ],
      },
      select: { id: true, subject: true, status: true, customer: { select: { name: true } } },
      orderBy: { lastMessageAt: "desc" },
      take,
    }),
  ]);
  return [
    {
      kind: SearchKinds.orders,
      rows: orders.map((order) => ({
        id: order.number,
        title: order.number,
        detail: `${order.recipientName} · ${order.status}`,
        href: `/support/orders/${order.number}`,
      })),
    },
    {
      kind: SearchKinds.customers,
      rows: customers.map((customer) => ({
        id: customer.id,
        title: customer.name,
        detail: [customer.email, customer.phone].filter(Boolean).join(" · "),
        href: `/support/customers/${customer.id}`,
      })),
    },
    {
      kind: SearchKinds.tickets,
      rows: tickets.map((ticket) => ({
        id: ticket.number,
        title: `${ticket.number} · ${ticket.subject}`,
        detail: `${ticket.customer.name} · ${ticket.priority} · ${ticket.status}`,
        href: `/support/tickets/${ticket.number}`,
      })),
    },
    {
      kind: SearchKinds.conversations,
      rows: conversations.map((conversation) => ({
        id: conversation.id,
        title: conversation.subject || conversation.customer.name,
        detail: `${conversation.customer.name} · ${conversation.status}`,
        href: `/support/conversation/${conversation.id}`,
      })),
    },
  ];
}
