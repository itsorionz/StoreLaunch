import "server-only";
import { db } from "./db";

// Liveness/readiness probe: verifies the database connection is usable without
// touching any business table. Used by the /api/health/ready route handler.
export async function isDatabaseReady(): Promise<boolean> {
  try {
    await db.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
