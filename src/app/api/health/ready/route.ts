import { productionConfigIssues } from "../../../../../scripts/runtime-config.mjs";
import { isDatabaseReady } from "@backend/lib/health";
import { withRoute } from "@backend/lib/route-logger";

export const GET = withRoute("health.ready", async () => {
  if (process.env.NODE_ENV === "production" && productionConfigIssues().length) {
    return Response.json(
      { status: "not_ready" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const ready = await isDatabaseReady();
  return Response.json(
    { status: ready ? "ready" : "not_ready" },
    {
      status: ready ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
});
