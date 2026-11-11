import { requireAdmin } from "@backend/lib/session";
import { getEmployeeDocumentBytes } from "@backend/lib/hrm-documents";
import { withRoute } from "@backend/lib/route-logger";

export const GET = withRoute(
  "admin.employee-documents",
  async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
    await requireAdmin();
    const { id } = await params;
    const document = await getEmployeeDocumentBytes(id);
    if (!document?.bytes || !document.fileName) return new Response("Not found", { status: 404 });

    const filename = document.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    return new Response(new Uint8Array(document.bytes), {
      headers: {
        "Content-Type": document.mimeType || "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(document.bytes.byteLength),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  },
);
