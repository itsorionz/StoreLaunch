import type { NextRequest } from "next/server";

export function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id") || "unknown";

  const pdfContent = `Delivery Hub Report PDF - ID: ${id}`;

  return new Response(pdfContent, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="delivery-hub-${id}.pdf"`,
    },
  });
}
