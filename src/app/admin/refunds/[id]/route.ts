import type { NextRequest } from "next/server";

export const revalidate = 0;

export function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id") || "unknown";

  const pdfContent = `Refund Record PDF - ID: ${id}`;

  return new Response(pdfContent, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="refund-${id}.pdf"`,
    },
  });
}