import { getCurrentUser } from "@backend/lib/session";
import { getProfilePhoto } from "@backend/lib/profile-photo";
import { withRoute } from "@backend/lib/route-logger";

export const GET = withRoute("account.photo", async () => {
  const user = await getCurrentUser();
  if (!user) return new Response("Not found", { status: 404 });
  const photo = await getProfilePhoto(user.id);
  if (!photo) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(photo), {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
