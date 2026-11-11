import { withRoute } from "@backend/lib/route-logger";

export const GET = withRoute("health.live", () =>
  Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } }),
);
