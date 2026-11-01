import { requireAdmin } from "@backend/lib/session";
import { db } from "@backend/lib/db";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const document = await db.employeeDocument.findUnique({
    where: { id },
    select: { bytes: true, fileName: true, mimeType: true },
  });
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
}
