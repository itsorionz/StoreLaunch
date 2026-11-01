import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { runPaymentRecoveryBatch } from "@backend/lib/payment-recovery";
import { revalidatePath, revalidateTag } from "next/cache";

export const maxDuration = 300;
export async function POST(request: NextRequest) {
  const secret = process.env.PAYMENT_RECOVERY_SECRET;
  if (!secret || secret.length < 32)
    return NextResponse.json({ error: "Recovery job is not configured" }, { status: 503 });
  const supplied = request.headers.get("authorization") ?? "";
  const digest = (value: string) => createHash("sha256").update(value).digest();
  if (!timingSafeEqual(digest(supplied), digest(`Bearer ${secret}`)))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const results = await runPaymentRecoveryBatch();
  revalidateTag("wallet", "max");
  revalidateTag("products", "max");
  revalidatePath("/admin/payments");
  revalidatePath("/admin/orders");
  revalidatePath("/account/orders");
  return NextResponse.json(
    { processed: results.length, results },
    { headers: { "Cache-Control": "no-store" } },
  );
}
