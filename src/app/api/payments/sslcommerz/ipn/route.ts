import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { validateSslcommerzPayment } from "@backend/lib/sslcommerz";
import { fulfillPaidOrder, getOrderByNumber } from "@backend/lib/fulfillment";
import { withRoute } from "@backend/lib/route-logger";

// **ENHANCED**: Added amount and currency verification before fulfillment
// Every rejection below answers "why was this payment not fulfilled?" — the
// withRoute wrapper records the status and response body for each of them.
export const POST = withRoute("payments.sslcommerz.ipn", async (request: NextRequest) => {
  const form = await request.formData().catch(() => null);
  const valId = form?.get("val_id")?.toString();
  const tranId = form?.get("tran_id")?.toString();

  if (!valId || !tranId) {
    return NextResponse.json(
      { status: "failed", message: "Missing val_id or tran_id" },
      { status: 400 },
    );
  }

  const validation = await validateSslcommerzPayment(valId);
  if (!validation || !validation.isValid) {
    return NextResponse.json({ status: "failed", message: "Validation failed" }, { status: 400 });
  }

  if (validation.tranId !== tranId)
    return NextResponse.json(
      { status: "failed", message: "Transaction mismatch" },
      { status: 400 },
    );
  const order = await getOrderByNumber(validation.tranId);
  if (!order) {
    return NextResponse.json({ status: "failed", message: "Order not found" }, { status: 404 });
  }

  // **ENHANCED**: Verify amount matches order total (minus wallet payment)
  const paymentTotalCents = order.totalCents - order.walletPaidCents;
  const validatedAmount = Number(validation.amount);
  if (!Number.isFinite(validatedAmount) || validatedAmount <= 0)
    return NextResponse.json(
      { status: "failed", message: "Payment amount is invalid" },
      { status: 400 },
    );
  if (Math.round(validatedAmount * 100) !== paymentTotalCents)
    return NextResponse.json(
      { status: "failed", message: "Payment amount mismatch with order total" },
      { status: 400 },
    );

  // **ENHANCED**: Verify currency matches order currency
  if (validation.currencyType !== order.currencyCode)
    return NextResponse.json(
      { status: "failed", message: "Payment currency mismatch with order currency" },
      { status: 400 },
    );

  const result = await fulfillPaidOrder(order.id, validation, valId);
  if (!result.ok) {
    return NextResponse.json({ status: "failed", message: result.error }, { status: 400 });
  }
  revalidatePath("/admin");
  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${order.number}`);
  revalidatePath(`/account/orders/${order.number}`);
  revalidatePath("/rider");
  return NextResponse.json({ status: "success" });
});
