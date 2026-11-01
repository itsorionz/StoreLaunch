"use client";

import { useEffect, useState, useActionState } from "react";
import Link from "next/link";
import {
  createSalesOrderAction,
  findSaleCustomerByPhone,
  searchSaleProducts,
  type ProductSearchHit,
  type SalesActionResult,
} from "@backend/actions/sales";

type CartLine = { product: ProductSearchHit; quantity: number };

export function SalePos({
  zones,
}: {
  zones: Array<{ id: string; name: string; rateCents: number }>;
}) {
  const [state, formAction, pending] = useActionState<SalesActionResult | null, FormData>(
    createSalesOrderAction,
    null,
  );

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerNote, setCustomerNote] = useState("");
  const [customerFound, setCustomerFound] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<ProductSearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [payment, setPayment] = useState<"CASH" | "COD">("CASH");
  const [zoneId, setZoneId] = useState("");
  const [shippingCents, setShippingCents] = useState(0);
  const [localError, setLocalError] = useState<string | null>(null);
  const trimmedQuery = query.trim();

  useEffect(() => {
    if (!trimmedQuery) return;
    let stale = false;
    const timer = setTimeout(async () => {
      try {
        const results = await searchSaleProducts(trimmedQuery);
        if (!stale) setHits(results);
      } finally {
        if (!stale) setSearching(false);
      }
    }, 250);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [trimmedQuery]);

  // A successful sale replaces this view with the confirmation panel, and
  // "New sale" performs a full reload, so no state reset effect is needed.

  async function lookupCustomer() {
    setLocalError(null);
    const result = await findSaleCustomerByPhone(customerPhone);
    if (result.found) {
      setCustomerFound(`${result.name} — ${result.orderCount ?? 0} previous orders`);
      if (result.name) setCustomerName(result.name);
    } else {
      setCustomerFound(null);
      setLocalError("No customer with this phone yet — they will be created as a walk-in customer");
    }
  }

  function addToCart(product: ProductSearchHit) {
    setLocalError(null);
    if (product.stock < 1) return;
    setCart((lines) => {
      const existing = lines.find((line) => line.product.id === product.id);
      if (existing) {
        if (existing.quantity >= product.stock) return lines;
        return lines.map((line) =>
          line.product.id === product.id ? { ...line, quantity: line.quantity + 1 } : line,
        );
      }
      return [...lines, { product, quantity: 1 }];
    });
    setQuery("");
    setHits([]);
  }

  function setQuantity(productId: string, quantity: number) {
    setCart((lines) =>
      quantity < 1
        ? lines.filter((line) => line.product.id !== productId)
        : lines.map((line) =>
            line.product.id === productId
              ? { ...line, quantity: Math.min(quantity, line.product.stock) }
              : line,
          ),
    );
  }

  const subtotalCents = cart.reduce(
    (sum, line) => sum + (line.product.salePriceCents ?? line.product.priceCents) * line.quantity,
    0,
  );
  const totalCents = subtotalCents + shippingCents;
  const shownHits = trimmedQuery ? hits : [];

  if (state?.ok && state.orderNumber)
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-border bg-surface p-8 text-center">
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
          Sale complete
        </p>
        <p className="mt-3 font-mono text-lg font-bold">{state.orderNumber}</p>
        <div className="mt-6 flex justify-center gap-3">
          <Link
            href={`/sales/invoice/${state.orderNumber}`}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90"
          >
            Print invoice
          </Link>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-surface-2"
          >
            New sale
          </button>
        </div>
      </div>
    );

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-6">
        <section className="rounded-xl border border-border bg-surface p-4">
          <h2 className="text-sm font-bold">Customer</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-semibold text-muted">Name</span>
              <input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                placeholder="Customer name"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-muted">Phone</span>
              <span className="mt-1 flex gap-2">
                <input
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  onBlur={() => customerPhone.trim() && lookupCustomer()}
                  inputMode="tel"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  placeholder="01XXXXXXXXX"
                />
                <button
                  type="button"
                  onClick={lookupCustomer}
                  className="rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-surface-2"
                >
                  Find
                </button>
              </span>
            </label>
          </div>
          {customerFound && (
            <p className="mt-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              {customerFound}
            </p>
          )}
          <label className="mt-3 block">
            <span className="text-xs font-semibold text-muted">Note (optional)</span>
            <input
              value={customerNote}
              onChange={(e) => setCustomerNote(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              placeholder="Delivery note, size, colour…"
            />
          </label>
        </section>

        <section className="rounded-xl border border-border bg-surface p-4">
          <h2 className="text-sm font-bold">Products</h2>
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (e.target.value.trim()) setSearching(true);
            }}
            className="mt-3 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            placeholder="Search by SKU, barcode, or name"
            autoFocus
          />
          {searching && trimmedQuery && <p className="mt-2 text-xs text-muted">Searching…</p>}
          <ul className="mt-3 max-h-72 space-y-1 overflow-y-auto">
            {shownHits.map((product) => (
              <li key={product.id}>
                <button
                  type="button"
                  onClick={() => addToCart(product)}
                  disabled={product.stock < 1}
                  className="flex w-full items-center justify-between rounded-lg border border-border px-3 py-2 text-left text-sm transition-colors hover:bg-surface-2 disabled:opacity-50"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{product.name}</span>
                    <span className="block text-xs text-muted">
                      {product.sku ?? product.barcode ?? "no code"} · stock {product.stock}
                    </span>
                  </span>
                  <span className="ml-3 shrink-0 font-semibold">
                    ৳{(product.salePriceCents ?? product.priceCents).toLocaleString("en-BD")}
                  </span>
                </button>
              </li>
            ))}
            {!shownHits.length && trimmedQuery && !searching && (
              <li className="px-1 py-2 text-sm text-muted">No products match.</li>
            )}
          </ul>
        </section>
      </div>

      <section className="h-fit rounded-xl border border-border bg-surface p-4">
        <h2 className="text-sm font-bold">Cart</h2>
        {cart.length ? (
          <ul className="mt-3 space-y-2">
            {cart.map((line) => (
              <li key={line.product.id} className="rounded-lg border border-border p-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 text-sm font-semibold">{line.product.name}</p>
                  <button
                    type="button"
                    onClick={() => setQuantity(line.product.id, 0)}
                    className="text-xs font-semibold text-red-500 hover:underline"
                  >
                    Remove
                  </button>
                </div>
                <div className="mt-1 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setQuantity(line.product.id, line.quantity - 1)}
                      className="h-7 w-7 rounded border border-border text-sm font-bold"
                    >
                      −
                    </button>
                    <span className="w-8 text-center text-sm font-semibold">{line.quantity}</span>
                    <button
                      type="button"
                      onClick={() => setQuantity(line.product.id, line.quantity + 1)}
                      className="h-7 w-7 rounded border border-border text-sm font-bold"
                    >
                      +
                    </button>
                  </div>
                  <span className="text-sm font-semibold">
                    ৳
                    {(
                      (line.product.salePriceCents ?? line.product.priceCents) * line.quantity
                    ).toLocaleString("en-BD")}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted">Search and tap a product to add it.</p>
        )}

        {zones.length > 0 && (
          <label className="mt-4 block">
            <span className="text-xs font-semibold text-muted">
              Delivery zone (for delivery sales)
            </span>
            <select
              value={zoneId}
              onChange={(e) => {
                setZoneId(e.target.value);
                const zone = zones.find((z) => z.id === e.target.value);
                setShippingCents(zone?.rateCents ?? 0);
              }}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="">Counter sale (no delivery)</option>
              {zones.map((zone) => (
                <option key={zone.id} value={zone.id}>
                  {zone.name} — ৳{(zone.rateCents / 100).toLocaleString("en-BD")}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="mt-4 block">
          <span className="text-xs font-semibold text-muted">Shipping (taka)</span>
          <input
            type="number"
            min={0}
            value={(shippingCents / 100).toString()}
            onChange={(e) =>
              setShippingCents(Math.max(0, Math.round(Number(e.target.value) * 100) || 0))
            }
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
        </label>

        <fieldset className="mt-4">
          <legend className="text-xs font-semibold text-muted">Payment</legend>
          <div className="mt-1 flex gap-2">
            {(["CASH", "COD"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setPayment(option)}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
                  payment === option
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border hover:bg-surface-2"
                }`}
              >
                {option === "CASH" ? "Cash paid now" : "Pay on delivery"}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
          <span className="text-sm font-semibold text-muted">Total</span>
          <span className="text-lg font-black">৳{totalCents.toLocaleString("en-BD")}</span>
        </div>

        {(localError || state?.error) && (
          <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-600 dark:text-red-400">
            {state?.error ?? localError}
          </p>
        )}
        {state?.fieldErrors &&
          Object.entries(state.fieldErrors).map(([field, messages]) => (
            <p key={field} className="mt-2 text-xs font-semibold text-red-500">
              {messages.join(" ")}
            </p>
          ))}

        <form action={formAction} className="mt-4">
          <input type="hidden" name="customerName" value={customerName} />
          <input type="hidden" name="customerPhone" value={customerPhone} />
          <input type="hidden" name="note" value={customerNote} />
          <input type="hidden" name="payment" value={payment} />
          <input type="hidden" name="zoneId" value={zoneId} />
          <input type="hidden" name="shippingCents" value={shippingCents} />
          <input
            type="hidden"
            name="lines"
            value={JSON.stringify(
              cart.map((line) => ({ productId: line.product.id, quantity: line.quantity })),
            )}
          />
          <button
            type="submit"
            disabled={pending || !cart.length}
            className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {pending ? "Saving sale…" : `Charge ৳${totalCents.toLocaleString("en-BD")}`}
          </button>
        </form>
      </section>
    </div>
  );
}
