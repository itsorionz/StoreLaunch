import "server-only";
import { db } from "./db";

export async function getOutstandingCodCollections(userId: string, riderRole: string) {
  return db.codCollection.findMany({
    where: { collectedById: userId, collectedByRole: riderRole, remittedAt: null },
    orderBy: { collectedAt: "asc" },
    include: {
      order: { select: { number: true } },
      settlementLines: { select: { appliedCents: true } },
    },
  });
}

export async function getRecentCodSettlementLines(userId: string, riderRole: string) {
  return db.codSettlementLine.findMany({
    where: {
      codCollection: { is: { collectedById: userId, collectedByRole: riderRole } },
    },
    orderBy: { settlement: { receivedAt: "desc" } },
    take: 30,
    include: {
      settlement: true,
      codCollection: { select: { order: { select: { number: true } } } },
    },
  });
}

export async function getRemittedCodCollections(userId: string, riderRole: string) {
  return db.codCollection.findMany({
    where: {
      collectedById: userId,
      collectedByRole: riderRole,
      remittedAt: { not: null },
      settlementLines: { none: {} },
    },
    orderBy: { remittedAt: "desc" },
    take: 30,
    include: { order: { select: { number: true } } },
  });
}
