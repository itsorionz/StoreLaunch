"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BarcodeSvg } from "@frontend/components/barcode/barcode-svg";
import { useToast } from "@frontend/components/ui/toast";

export type BarcodePrintProduct = {
  id: string;
  name: string;
  nameBn: string | null;
  barcode: string;
  sku: string | null;
  stock: number;
  categoryName: string;
  priceLabel: string;
};

const PAGE_SIZES = [
  { value: "A4 portrait", label: "A4 · portrait" },
  { value: "A4 landscape", label: "A4 · landscape" },
  { value: "Letter portrait", label: "Letter · portrait" },
  { value: "Letter landscape", label: "Letter · landscape" },
  { value: "4in 6in", label: "Thermal label · 4 × 6 in" },
];

const STOCK_FILTERS = [
  { value: "all", label: "Any stock" },
  { value: "in", label: "In stock" },
  { value: "low", label: "Low (1–5)" },
  { value: "out", label: "Out of stock" },
];

const MAX_COPIES = 50;

const ROWS_PER_PAGE_OPTIONS = [10, 20, 50];

/**
 * Interactive barcode sheet builder: filter the catalog, choose copies per
 * product, tune page/layout settings, then print or save the sheet as PDF.
 */
export function BarcodePrintBuilder({
  products,
  initialIds,
}: {
  products: BarcodePrintProduct[];
  initialIds: string[] | null;
}) {
  const toast = useToast();
  const [quantities, setQuantities] = useState<Record<string, number>>(() => {
    // Arriving from a row's print icon selects just that product; opening the
    // page directly starts with the whole catalogue, as before.
    const ids = initialIds ?? products.map((product) => product.id);
    const next: Record<string, number> = {};
    for (const id of ids) if (products.some((product) => product.id === id)) next[id] = 1;
    return next;
  });
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [stock, setStock] = useState("all");
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0].value);
  const [columns, setColumns] = useState(3);
  const [marginMm, setMarginMm] = useState(8);
  const [gapMm, setGapMm] = useState(4);
  const [rowsPerPage, setRowsPerPage] = useState(ROWS_PER_PAGE_OPTIONS[0]);
  const [page, setPage] = useState(1);

  const categories = useMemo(
    () => Array.from(new Set(products.map((product) => product.categoryName))).sort(),
    [products],
  );

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return products.filter((product) => {
      if (category !== "all" && product.categoryName !== category) return false;
      if (stock === "in" && product.stock === 0) return false;
      if (stock === "low" && !(product.stock > 0 && product.stock <= 5)) return false;
      if (stock === "out" && product.stock !== 0) return false;
      if (!needle) return true;
      return [product.name, product.nameBn ?? "", product.sku ?? "", product.barcode]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [products, category, stock, search]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / rowsPerPage));
  const currentPage = Math.min(page, pageCount);
  const pageStart = (currentPage - 1) * rowsPerPage;
  const pagedProducts = filtered.slice(pageStart, pageStart + rowsPerPage);

  const selectedProducts = useMemo(
    () => products.filter((product) => (quantities[product.id] ?? 0) > 0),
    [products, quantities],
  );

  const labels = useMemo(
    () =>
      selectedProducts.flatMap((product) =>
        Array.from({ length: quantities[product.id] ?? 0 }, (_, copy) => ({
          key: `${product.id}-${copy}`,
          product,
        })),
      ),
    [selectedProducts, quantities],
  );

  const setCopies = (id: string, value: number) => {
    const copies = Math.max(0, Math.min(MAX_COPIES, Math.trunc(value) || 0));
    setQuantities((previous) => {
      const next = { ...previous };
      if (copies === 0) delete next[id];
      else next[id] = copies;
      return next;
    });
  };

  const selectPage = () => {
    setQuantities((previous) => {
      const next = { ...previous };
      for (const product of pagedProducts) if (!next[product.id]) next[product.id] = 1;
      return next;
    });
  };

  const selectAllFiltered = () => {
    setQuantities((previous) => {
      const next = { ...previous };
      for (const product of filtered) if (!next[product.id]) next[product.id] = 1;
      return next;
    });
  };

  const print = () => window.print();

  const downloadPdf = () => {
    toast("Choose “Save as PDF” as the print destination to download the sheet.");
    // Let the toast paint before the blocking print dialog opens.
    requestAnimationFrame(() => window.print());
  };

  return (
    <div className="space-y-4">
      <style>{`
@media print {
  @page { size: ${pageSize}; margin: ${marginMm}mm; }
  .barcode-sheet {
    grid-template-columns: repeat(${columns}, minmax(0, 1fr)) !important;
    gap: ${gapMm}mm !important;
  }
  .barcode-label { break-inside: avoid; page-break-inside: avoid; }
  body { background: #fff !important; }
}
`}</style>

      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href="/admin/products" className="btn btn-outline">
          ← Products
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={downloadPdf}
            disabled={labels.length === 0}
            className="btn btn-outline"
          >
            Download PDF
          </button>
          <button
            type="button"
            onClick={print}
            disabled={labels.length === 0}
            className="btn-primary"
          >
            Print labels
          </button>
        </div>
      </div>
      <p className="-mt-2 text-xs text-muted print:hidden">
        To download a PDF, choose “Save as PDF” in the browser print dialog. Set the paper size,
        copies and filters below — the preview updates live.
      </p>

      <section className="card p-4 print:hidden" aria-label="Page setup">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Page size</span>
            <select
              className="input"
              value={pageSize}
              onChange={(event) => setPageSize(event.target.value)}
            >
              {PAGE_SIZES.map((size) => (
                <option key={size.value} value={size.value}>
                  {size.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Labels per row</span>
            <select
              className="input"
              value={columns}
              onChange={(event) => setColumns(Number(event.target.value))}
            >
              {[2, 3, 4, 5].map((value) => (
                <option key={value} value={value}>
                  {value} labels
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Page margin (mm)</span>
            <input
              type="number"
              min={0}
              max={25}
              className="input"
              value={marginMm}
              onChange={(event) =>
                setMarginMm(Math.max(0, Math.min(25, Number(event.target.value))))
              }
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Label gap (mm)</span>
            <input
              type="number"
              min={0}
              max={15}
              className="input"
              value={gapMm}
              onChange={(event) => setGapMm(Math.max(0, Math.min(15, Number(event.target.value))))}
            />
          </label>
        </div>
      </section>

      <section className="card print:hidden" aria-label="Choose products">
        <div className="flex flex-wrap items-end gap-3 border-b border-border p-4">
          <label className="block min-w-52 flex-1">
            <span className="mb-1 block text-sm font-medium">Search</span>
            <input
              type="search"
              className="input"
              placeholder="Name, SKU or barcode"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Category</span>
            <select
              className="input"
              value={category}
              onChange={(event) => {
                setCategory(event.target.value);
                setPage(1);
              }}
            >
              <option value="all">All categories</option>
              {categories.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Stock</span>
            <select
              className="input"
              value={stock}
              onChange={(event) => {
                setStock(event.target.value);
                setPage(1);
              }}
            >
              {STOCK_FILTERS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={selectPage} className="btn btn-outline">
              Select page
            </button>
            <button type="button" onClick={selectAllFiltered} className="btn btn-outline">
              Select all matching
            </button>
            <button type="button" onClick={() => setQuantities({})} className="btn btn-outline">
              Clear
            </button>
          </div>
        </div>

        <div className="max-h-96 overflow-y-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="sticky top-0 z-10 bg-surface text-xs font-semibold uppercase tracking-wider text-muted">
              <tr className="border-b border-border">
                <th className="w-12 px-4 py-2.5">
                  <span className="sr-only">Include</span>
                </th>
                <th className="px-3 py-2.5">Product</th>
                <th className="px-3 py-2.5">Category</th>
                <th className="px-3 py-2.5">Barcode</th>
                <th className="px-3 py-2.5">Stock</th>
                <th className="px-3 py-2.5 text-right">Copies</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {pagedProducts.map((product) => {
                const copies = quantities[product.id] ?? 0;
                return (
                  <tr key={product.id} className={copies > 0 ? "bg-primary/5" : undefined}>
                    <td className="px-4 py-2.5">
                      <input
                        type="checkbox"
                        checked={copies > 0}
                        onChange={(event) => setCopies(product.id, event.target.checked ? 1 : 0)}
                        aria-label={`Include ${product.name}`}
                        className="h-4 w-4 accent-primary"
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="font-semibold">{product.name}</p>
                      {product.nameBn && <p className="text-xs text-muted">{product.nameBn}</p>}
                    </td>
                    <td className="px-3 py-2.5 text-muted">{product.categoryName}</td>
                    <td className="px-3 py-2.5 font-mono text-xs">{product.barcode}</td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`badge ${
                          product.stock === 0
                            ? "bg-accent/15 text-accent"
                            : product.stock <= 5
                              ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                              : "badge-muted"
                        }`}
                      >
                        {product.stock}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => setCopies(product.id, copies - 1)}
                          disabled={copies === 0}
                          className="btn-icon h-7 w-7 disabled:opacity-30"
                          aria-label={`Remove one copy of ${product.name}`}
                        >
                          −
                        </button>
                        <input
                          type="number"
                          min={0}
                          max={MAX_COPIES}
                          value={copies}
                          onChange={(event) => setCopies(product.id, Number(event.target.value))}
                          aria-label={`Copies of ${product.name}`}
                          className="input w-14 px-1 py-1 text-center text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => setCopies(product.id, copies + 1)}
                          disabled={copies >= MAX_COPIES}
                          className="btn-icon h-7 w-7 disabled:opacity-30"
                          aria-label={`Add one copy of ${product.name}`}
                        >
                          +
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted">
                    No products match these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="space-y-2 border-t border-border px-4 py-3 text-sm text-muted">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              Showing {filtered.length === 0 ? 0 : pageStart + 1}–
              {Math.min(pageStart + rowsPerPage, filtered.length)} of {filtered.length} matching
              {filtered.length !== products.length ? ` (${products.length} total)` : ""}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1.5">
                <span>Rows</span>
                <select
                  className="input w-20 px-2 py-1 text-xs"
                  value={rowsPerPage}
                  onChange={(event) => {
                    setRowsPerPage(Number(event.target.value));
                    setPage(1);
                  }}
                  aria-label="Rows per page"
                >
                  {ROWS_PER_PAGE_OPTIONS.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() => setPage(Math.max(1, currentPage - 1))}
                disabled={currentPage <= 1}
                className="btn btn-outline !px-2.5 !py-1 text-xs disabled:opacity-40"
              >
                ← Prev
              </button>
              <span className="whitespace-nowrap">
                Page {currentPage} of {pageCount}
              </span>
              <button
                type="button"
                onClick={() => setPage(Math.min(pageCount, currentPage + 1))}
                disabled={currentPage >= pageCount}
                className="btn btn-outline !px-2.5 !py-1 text-xs disabled:opacity-40"
              >
                Next →
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              {selectedProducts.length} product{selectedProducts.length === 1 ? "" : "s"} selected
            </span>
            <span>
              <strong className="text-foreground">{labels.length} label(s)</strong> to print
            </span>
          </div>
        </div>
      </section>

      {labels.length === 0 ? (
        <div className="card p-6 text-sm text-muted print:hidden">
          <p className="font-semibold text-foreground">No labels selected</p>
          <p className="mt-1">
            Tick products above (or use “Select page” / “Select all matching”) to build the print
            sheet.
          </p>
        </div>
      ) : (
        <section className="space-y-2" aria-label="Label preview">
          <div className="flex items-center justify-between print:hidden">
            <h2 className="text-lg font-bold">Preview</h2>
            <p className="text-sm text-muted">
              {labels.length} label{labels.length === 1 ? "" : "s"}
            </p>
          </div>
          <div className="barcode-sheet grid grid-cols-2 gap-3 sm:grid-cols-3">
            {labels.map(({ key, product }) => (
              <div
                key={key}
                className="barcode-label break-inside-avoid rounded-lg border border-black bg-white p-3 text-center text-black"
              >
                <p className="line-clamp-2 text-xs font-bold leading-tight">{product.name}</p>
                {product.nameBn && (
                  <p className="line-clamp-1 text-[11px] leading-tight">{product.nameBn}</p>
                )}
                <p className="mt-1 text-sm font-bold">{product.priceLabel}</p>
                <BarcodeSvg value={product.barcode} height={56} className="mt-1.5 h-14 w-full" />
                <p className="font-mono text-[10px] tracking-[0.15em]">{product.barcode}</p>
                {product.sku && <p className="font-mono text-[9px] text-gray-600">{product.sku}</p>}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
