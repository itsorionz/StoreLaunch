import "server-only";
import { db } from "./db";

export async function getRiderOrderDetail(number: string, riderId: string) {
  const order = await db.order.findUnique({
    where: { number },
    include: {
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
      deliveryAttempts: {
        orderBy: { createdAt: "desc" },
      },
      codCollection: true,
      items: {
        include: {
          product: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  });
  return { order, riderId };
}

export async function getRiderOrderProof(number: string, riderId: string) {
  const order = await db.order.findFirst({ where: { number, riderId } });
  return { order, riderId };
}

export async function getRiderOrderAttempt(number: string, riderId: string) {
  const order = await db.order.findFirst({ where: { number, riderId } });
  return { order, riderId };
}

export async function getRiderOrderHistory(riderId: string) {
  const orders = await db.order.findMany({
    where: {
      riderId,
      status: { in: ["Delivered", "Cancelled"] as const },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      number: true,
      status: true,
      recipientName: true,
      line1: true,
      city: true,
      totalCents: true,
      currencyCode: true,
      currencySymbol: true,
      deliveredAt: true,
    },
  });
  return { orders, riderId };
}

export async function getRiderProfileInfo(riderId: string, userId: string) {
  const profile = await db.user.findUnique({
    where: { id: userId },
    select: {
      name: true,
      email: true,
      phone: true,
      gender: true,
      dateOfBirth: true,
      profilePhotoVersion: true,
    },
  });
  const stats = await db.order.aggregate({
    where: { riderId },
    _count: { id: true },
  });
  const delivered = await db.order.count({
    where: { riderId, status: "Delivered" as const },
  });
  return { profile, stats, delivered, riderId };
}

export async function getRiderActiveRoute(riderId: string) {
  const orders = await db.order.findMany({
    where: { riderId, status: "Shipped" as const },
    orderBy: [{ city: "asc" }, { shippedAt: "asc" }],
    include: { deliveryAttempts: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  return { orders, riderId };
}
