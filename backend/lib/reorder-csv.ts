/**
 * Supplier-ready CSV rendering for the reorder report (§10).
 *
 * Deliberately pure and framework-free so the export route, tests and any
 * future scheduler can share one implementation.
 */

export type ReorderCsvRow = {
  productName: string;
  sku: string | null;
  warehouseName: string;
  warehouseCode: string;
  currentStock: number;
  reorderPoint: number;
  suggestedQty: number;
  binCode: string | null;
};

const HEADERS = [
  "Product",
  "SKU",
  "Warehouse",
  "Warehouse Code",
  "Current Stock",
  "Reorder Point",
  "Suggested Qty",
  "Bin",
] as const;

/** RFC 4180 escaping: quote fields containing commas, quotes or line breaks. */
function escapeCsv(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/**
 * Renders reorder suggestions as CSV with a header row and CRLF line endings
 * (what Excel and other spreadsheet tools expect for supplier hand-offs).
 */
export function reorderReportToCsv(rows: ReorderCsvRow[]): string {
  const lines = [HEADERS.join(",")];
  for (const row of rows) {
    lines.push(
      [
        row.productName,
        row.sku ?? "",
        row.warehouseName,
        row.warehouseCode,
        row.currentStock,
        row.reorderPoint,
        row.suggestedQty,
        row.binCode ?? "",
      ]
        .map(escapeCsv)
        .join(","),
    );
  }
  return `${lines.join("\r\n")}\r\n`;
}

/** Download filename for the export, stamped with the Bangladesh day key. */
export function reorderCsvFilename(dayKey: string): string {
  return `reorder-${dayKey}.csv`;
}
