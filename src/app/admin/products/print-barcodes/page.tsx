import { getProductsForBarcodePrint } from "@backend/lib/products-queries";
import { getStoreSettings } from "@backend/lib/settings";
import { effectivePriceCents, formatPrice } from "@backend/lib/money";
import { BarcodePrintBuilder } from "@frontend/components/admin/barcode-print-builder";

export const metadata = { title: "Print barcodes — Admin", robots: { index: false } };

// Print sheets are generated per request from live catalog data; blocking the
// navigation is fine for an authenticated, deliberate print action.
export const instant = false;

/**
 * Barcode label builder. `?ids=a,b` preselects those products; otherwise the
 * whole barcoded catalogue starts selected.
 */
export default async function PrintBarcodesPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string }>;
}) {
  const { ids } = await searchParams;
  const requestedIds = (ids ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const [products, settings] = await Promise.all([
    getProductsForBarcodePrint(),
    getStoreSettings(),
  ]);

  return (
    <BarcodePrintBuilder
      initialIds={requestedIds.length ? requestedIds : null}
      products={products.map((product) => ({
        id: product.id,
        name: product.name,
        nameBn: product.nameBn,
        barcode: product.barcode ?? "",
        sku: product.sku,
        stock: product.stock,
        categoryName: product.categoryName,
        priceLabel: formatPrice(
          effectivePriceCents(product.priceCents, product.salePriceCents),
          settings.currencySymbol,
        ),
      }))}
    />
  );
}
