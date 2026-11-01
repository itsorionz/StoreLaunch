export function formatPrice(cents: number, symbol = "৳"): string {
  const value = cents / 100;
  return symbol + value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export function orderCurrencyLabel(order: {
  currencyCode: string | null;
  currencySymbol: string | null;
}): string {
  return (
    order.currencySymbol ||
    (order.currencyCode ? `${order.currencyCode} ` : "[currency unrecorded] ")
  );
}

export function discountPercent(priceCents: number, salePriceCents: number | null): number | null {
  if (!salePriceCents || salePriceCents >= priceCents) return null;
  return Math.round(((priceCents - salePriceCents) / priceCents) * 100);
}

export function effectivePriceCents(priceCents: number, salePriceCents: number | null): number {
  return salePriceCents && salePriceCents < priceCents ? salePriceCents : priceCents;
}
