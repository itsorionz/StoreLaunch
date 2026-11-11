import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { runShipmentSyncBatch } from "@backend/lib/shipment-sync";
import { revalidatePath } from "next/cache";
import { withRoute } from "@backend/lib/route-logger";

export const maxDuration = 300;
export const POST = withRoute("jobs.shipment-sync", async (request: NextRequest) => {
  const secret = process.env.SHIPMENT_SYNC_SECRET;
  if (!secret || secret.length < 32)
    return NextResponse.json({ error: "Shipment sync job is not configured" }, { status: 503 });
  const supplied = request.headers.get("authorization") ?? "";
  const digest = (value: string) => createHash("sha256").update(value).digest();
  if (!timingSafeEqual(digest(supplied), digest(`Bearer ${secret}`)))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const outcomes = await runShipmentSyncBatch();
  revalidatePath("/admin/shipments");
  revalidatePath("/admin/orders");
  return NextResponse.json(
    {
      synced: outcomes.length,
      changed: outcomes.filter((outcome) => outcome.changed).length,
      failed: outcomes.filter((outcome) => !outcome.ok).length,
      results: outcomes,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
});
