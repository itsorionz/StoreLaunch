import { handlers } from "@backend/lib/auth";
import { withRoute } from "@backend/lib/route-logger";

// Wrapped so failed callbacks/CSRF rejections show up in the server log with
// the request they belong to instead of disappearing into NextAuth internals.
export const GET = withRoute("auth.nextauth", handlers.GET);
export const POST = withRoute("auth.nextauth", handlers.POST);
