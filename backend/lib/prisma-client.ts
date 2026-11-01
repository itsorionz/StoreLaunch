import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@backend/generated/prisma/client";

export function createPrismaClient(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) throw new Error("DATABASE_URL is required to connect to PostgreSQL.");
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
      max: 10,
    }),
  });
}
