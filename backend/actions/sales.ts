"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "../lib/db";
import { createSalesOrder } from "../lib/sales-orders";
import { requireSalesPage } from "../lib/session";
import { canonicalPhone } from "../lib/otp";
import { phoneNumber, personName } from "../lib/form-validation";
import { logger } from "../lib/logger";

const log = logger.child({ scope: "action:sales" });

export type SalesActionResult = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  orderNumber?: string;
  customerId?: string;
};

export type ProductSearchHit = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  priceCents: number;
  salePriceCents: number | null;
  stock: number;
  imageUrl: string | null;
};

/**
 * Quick product search for the POS by SKU, barcode, or name.
 * Always allowed for the sales role — no pricing/settings exposure.
 */
export async function searchSaleProducts(query: string): Promise<ProductSearchHit[]> {
  await requireSalesPage();
  const term = String(query || "")
    .trim()
    .slice(0, 200);
  if (!term) return [];
  const products = await db.product.findMany({
    where: {
      active: true,
      OR: [
        { sku: { contains: term, mode: "insensitive" } },
        { barcode: { contains: term, mode: "insensitive" } },
        { name: { contains: term, mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      name: true,
      sku: true,
      barcode: true,
      priceCents: true,
      salePriceCents: true,
      stock: true,
      images: true,
    },
    orderBy: { name: "asc" },
    take: 20,
  });
  return products.map((product) => ({
    id: product.id,
    name: product.name,
    sku: product.sku,
    barcode: product.barcode,
    priceCents: product.priceCents,
    salePriceCents: product.salePriceCents,
    stock: product.stock,
    imageUrl: product.images[0] ?? null,
  }));
}

/** Customer lookup by phone so repeat walk-ins reuse their profile. */

export type SaleLookupResult = {
  found: boolean;
  name?: string | null;
  phone?: string | null;
  orderCount?: number;
};

export async function findSaleCustomerByPhone(phoneValue: string): Promise<SaleLookupResult> {
  await requireSalesPage();
  const phone = canonicalPhone(String(phoneValue || ""));
  if (!phone) return { found: false };
  const customer = await db.user.findFirst({
    where: { phone },
    select: {
      name: true,
      phone: true,
      _count: { select: { orders: true } },
    },
  });
  if (!customer) return { found: false };
  return {
    found: true,
    name: customer.name,
    phone: customer.phone,
    orderCount: customer._count.orders,
  };
}

const lineSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().min(1).max(99),
});

export async function createSalesOrderAction(
  _prev: SalesActionResult | null,
  formData: FormData,
): Promise<SalesActionResult> {
  const actor = await requireSalesPage();

  const baseParsed = z.object({ customerName: personName, customerPhone: phoneNumber }).safeParse({
    customerName: String(formData.get("customerName") || ""),
    customerPhone: String(formData.get("customerPhone") || ""),
  });
  if (!baseParsed.success)
    return {
      ok: false,
      fieldErrors: Object.fromEntries(
        Object.entries(baseParsed.error.flatten().fieldErrors).map(([key, messages]) => [
          key,
          messages ?? [],
        ]),
      ),
    };

  let lines: Array<{ productId: string; quantity: number }>;
  try {
    const parsed = z
      .array(lineSchema)
      .min(1)
      .parse(JSON.parse(String(formData.get("lines") || "[]")));
    lines = parsed;
  } catch (error) {
    // Malformed payload (client bug) is worth seeing; an empty sale is not.
    log.debug("createSalesOrderAction lines rejected", { error });
    return { ok: false, error: "Add at least one product to the sale" };
  }

  const payment = String(formData.get("payment") || "COD") === "CASH" ? "CASH" : "COD";
  const shippingCentsRaw = Number(formData.get("shippingCents") || "0");
  const shippingCents = Number.isFinite(shippingCentsRaw)
    ? Math.max(0, Math.round(shippingCentsRaw))
    : 0;
  const zoneId = String(formData.get("zoneId") || "").trim() || undefined;
  const note = String(formData.get("note") || "").trim() || undefined;

  const result = await createSalesOrder({
    customerName: baseParsed.data.customerName,
    customerPhone: baseParsed.data.customerPhone,
    lines,
    payment,
    shippingCents,
    zoneId,
    note,
    actor,
  });
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/sales");
  revalidatePath("/sales/list");
  revalidatePath("/warehouse/pick");
  return { ok: true, orderNumber: result.orderNumber, customerId: result.customerId };
}
