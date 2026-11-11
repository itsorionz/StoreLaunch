import { Roles } from "@backend/lib/enums.mjs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getDeliveryProofWithOrder } from "@backend/lib/delivery-photo";
import { getCurrentUser, getRider } from "@backend/lib/session";
import { logger } from "@backend/lib/logger";
import { withRoute } from "@backend/lib/route-logger";

const log = logger.child({ scope: "route:rider.proofs" });

export const GET = withRoute(
  "rider.proofs.photo",
  async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const user = await getCurrentUser();
    if (!user) return new Response("Not found", { status: 404 });
    const { id } = await params;
    const proof = await getDeliveryProofWithOrder(id);
    if (!proof?.photoKey || !/^[0-9a-f-]{36}$/.test(proof.photoKey))
      return new Response("Not found", { status: 404 });
    if (user.role !== Roles.Admin) {
      const ctx = await getRider();
      if (!ctx || proof.order.riderId !== ctx.rider.id || proof.riderId !== ctx.rider.id)
        return new Response("Not found", { status: 404 });
    }
    if (proof.photoData)
      return new Response(proof.photoData, {
        headers: {
          "Content-Type": proof.photoMime ?? "image/jpeg",
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    // Compatibility for proof images uploaded by versions that stored them on local disk.
    try {
      const bytes = await readFile(
        path.join(process.cwd(), "storage", "delivery-proofs", proof.photoKey),
      );
      return new Response(bytes, {
        headers: {
          "Content-Type": proof.photoMime ?? "image/jpeg",
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch (error) {
      // The record points at a photo that is no longer readable — an
      // integrity problem worth seeing, not just an ordinary 404.
      log.warn("delivery proof file unreadable", { error, proofId: id });
      return new Response("Not found", { status: 404 });
    }
  },
);
