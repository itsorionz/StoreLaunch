import { requireAdmin } from "@backend/lib/session";
import { db } from "@backend/lib/db";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const application = await db.careerApplication.findUnique({
    where: { id },
    select: { resumeFile: true, resumeFileName: true, resumeMimeType: true },
  });
  if (!application?.resumeFile || !application.resumeFileName)
    return new Response("Not found", { status: 404 });

  const filename = application.resumeFileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  return new Response(new Uint8Array(application.resumeFile), {
    headers: {
      "Content-Type": application.resumeMimeType || "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(application.resumeFile.byteLength),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
