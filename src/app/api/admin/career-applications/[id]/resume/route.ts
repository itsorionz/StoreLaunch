import { requireAdmin } from "@backend/lib/session";
import { getCareerResume } from "@backend/lib/career-documents";
import { withRoute } from "@backend/lib/route-logger";

export const GET = withRoute(
  "admin.career-applications.resume",
  async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
    await requireAdmin();
    const { id } = await params;
    const application = await getCareerResume(id);
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
  },
);
