import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@backend/lib/db";
import { validateSslcommerzPayment } from "@backend/lib/sslcommerz";
import { fulfillPaidOrder } from "@backend/lib/fulfillment";

export async function POST(request: NextRequest) {
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
  const order = await db.order.findUnique({ where: { number: validation.tranId } });
  if (!order) {
    return NextResponse.json({ status: "failed", message: "Order not found" }, { status: 404 });
  }

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
}
