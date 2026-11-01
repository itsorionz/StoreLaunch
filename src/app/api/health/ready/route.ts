import { productionConfigIssues } from "../../../../../scripts/runtime-config.mjs";
import { db } from "@backend/lib/db";

export async function GET() {
  if (process.env.NODE_ENV === "production" && productionConfigIssues().length) {
    return Response.json(
      { status: "not_ready" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    await db.$queryRaw`SELECT 1`;
    return Response.json({ status: "ready" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json(
      { status: "not_ready" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
