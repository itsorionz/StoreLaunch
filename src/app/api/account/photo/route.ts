import { getCurrentUser } from "@backend/lib/session";
import { db } from "@backend/lib/db";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response("Not found", { status: 404 });
  const account = await db.user.findUnique({
    where: { id: user.id },
    select: { profilePhoto: true },
  });
  if (!account?.profilePhoto) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(account.profilePhoto), {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
