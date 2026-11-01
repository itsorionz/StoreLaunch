import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@backend/lib/db";
import { fulfillPaidOrder } from "@backend/lib/fulfillment";
import { validateSslcommerzPayment } from "@backend/lib/sslcommerz";

/** Gateway browser returns are POSTs; redirect to an authenticated, read-only page. */
export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  const tranId = form?.get("tran_id")?.toString() || request.nextUrl.searchParams.get("tran_id");
  const valId = form?.get("val_id")?.toString();
  if (!tranId) return NextResponse.redirect(new URL("/account/orders", request.url), 303);
  const order = await db.order.findUnique({ where: { number: tranId } });
  if (!order) return NextResponse.redirect(new URL("/account/orders", request.url), 303);
  if (valId) {
    const validation = await validateSslcommerzPayment(valId);
    if (validation?.isValid && validation.tranId === order.number) {
      const result = await fulfillPaidOrder(order.id, validation, valId);
      if (result.ok) {
        revalidatePath("/admin");
        revalidatePath("/admin/orders");
        revalidatePath(`/admin/orders/${order.number}`);
        revalidatePath(`/account/orders/${order.number}`);
        revalidatePath("/rider");
      }
    }
  }
  // A failed/cancelled browser return is not proof the provider did not collect money.
  return NextResponse.redirect(
    new URL(`/order/${encodeURIComponent(order.number)}/result`, request.url),
    303,
  );
}

export async function GET(request: NextRequest) {
  const number = request.nextUrl.searchParams.get("tran_id");
  return NextResponse.redirect(
    new URL(
      number ? `/order/${encodeURIComponent(number)}/result` : "/account/orders",
      request.url,
    ),
    303,
  );
}
