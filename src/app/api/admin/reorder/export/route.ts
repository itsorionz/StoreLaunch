import { getCurrentUser } from "@backend/lib/session";
import { Roles } from "@backend/lib/enums.mjs";
import { getReorderReport } from "@backend/lib/ops-intelligence";
import { reorderCsvFilename, reorderReportToCsv } from "@backend/lib/reorder-csv";
import { bdDayKey } from "@backend/lib/admin-dashboard-periods";

/**
 * CSV export of the reorder report (§10) — a plain GET so the admin page can
 * link straight to it. Session-checked instead of requireAdmin() because a
 * redirect to the login page makes no sense for a file download.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== Roles.Admin)
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });

  const csv = reorderReportToCsv(await getReorderReport());
  const filename = reorderCsvFilename(bdDayKey(new Date()));
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
