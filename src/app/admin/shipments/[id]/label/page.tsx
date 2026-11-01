import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@backend/lib/db";
import { getStoreSettings } from "@backend/lib/settings";
import { encodeCode39 } from "@backend/lib/barcode";
import { encodeQr } from "@backend/lib/qr";
import { PrintButton } from "@frontend/components/sales/print-button";

export const metadata = { title: "Shipment label" };

const QUIET_MODULES = 10;
const MODULE_PX = 2;

/**
 * Renders `value` as a Code 39 barcode SVG (§5.4). Bars sit on even element
 * indices (the encoder alternates bar/space starting with a bar).
 */
function BarcodeSvg({ value, height = 72 }: { value: string; height?: number }) {
  const encoding = encodeCode39(value);
  if (!encoding) return null;

  const quiet = QUIET_MODULES;
  const widthModules = encoding.totalModules + quiet * 2;
  let cursor = quiet;
  const bars: { x: number; width: number }[] = [];
  encoding.widths.forEach((element, index) => {
    if (index % 2 === 0) bars.push({ x: cursor * MODULE_PX, width: element * MODULE_PX });
    cursor += element;
  });

  return (
    <svg
      role="img"
      aria-label={`Barcode ${encoding.text}`}
      viewBox={`0 0 ${widthModules * MODULE_PX} ${height}`}
      className="h-[72px] w-full"
      preserveAspectRatio="xMidYMid meet"
    >
      <rect width={widthModules * MODULE_PX} height={height} fill="white" />
      {bars.map((bar) => (
        <rect
          key={`${bar.x}-${bar.width}`}
          x={bar.x}
          y={0}
          width={bar.width}
          height={height}
          fill="black"
        />
      ))}
    </svg>
  );
}

/**
 * Renders `value` as a QR code SVG (§5.4) with the spec's 4-module quiet
 * zone. Horizontal runs of dark modules merge into one rectangle each to
 * keep the SVG compact.
 */
function QrSvg({ value, sizePx = 88 }: { value: string; sizePx?: number }) {
  const qr = encodeQr(value);
  if (!qr) return null;

  const quiet = 4;
  const total = qr.size + quiet * 2;
  const rects: { x: number; y: number; width: number }[] = [];
  for (let y = 0; y < qr.size; y++) {
    let run = 0;
    for (let x = 0; x <= qr.size; x++) {
      if (x < qr.size && qr.isDark(x, y)) {
        run++;
        continue;
      }
      if (run > 0) {
        rects.push({ x: x - run + quiet, y: y + quiet, width: run });
        run = 0;
      }
    }
  }

  return (
    <svg
      role="img"
      aria-label={`QR code ${value}`}
      viewBox={`0 0 ${total} ${total}`}
      width={sizePx}
      height={sizePx}
      className="shrink-0"
      shapeRendering="crispEdges"
    >
      <rect width={total} height={total} fill="white" />
      {rects.map((rect) => (
        <rect
          key={`${rect.x}-${rect.y}`}
          x={rect.x}
          y={rect.y}
          width={rect.width}
          height={1}
          fill="black"
        />
      ))}
    </svg>
  );
}

export default async function ShipmentLabelPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ format?: string }>;
}) {
  const { id } = await params;
  const { format: formatParam } = await searchParams;
  const shipment = await db.shipment.findUnique({
    where: { id },
    include: {
      order: { include: { items: { select: { quantity: true } } } },
      deliveryCompany: true,
    },
  });
  if (!shipment) notFound();
  const settings = await getStoreSettings();

  // §5.4: the company's stored label format is the default; ?format= overrides
  // it per print run (thermal roll vs laser A4 sheet).
  const format =
    formatParam === "Thermal" || formatParam === "A4"
      ? formatParam
      : (shipment.deliveryCompany?.labelFormat ?? "A4");
  const thermal = format === "Thermal";

  const order = shipment.order;
  const barcodeValue = shipment.trackingNumber || order.number;
  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
  const codDueCents =
    order.paymentMethod === "COD" ? Math.max(order.totalCents - order.walletPaidCents, 0) : 0;

  return (
    <div className={thermal ? "mx-auto w-[4in] space-y-3" : "mx-auto max-w-2xl space-y-4"}>
      {thermal && <style>{`@media print { @page { size: 4in 6in; margin: 0.15in; } }`}</style>}
      <div className="flex items-center justify-between gap-2 print:hidden">
        <Link href="/admin/shipments" className="btn btn-outline">
          ← Shipments
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href={`/admin/shipments/${shipment.id}/label?format=${thermal ? "A4" : "Thermal"}`}
            className="btn btn-outline"
          >
            {thermal ? "A4 layout" : "Thermal layout"}
          </Link>
          <PrintButton label="Print label" />
        </div>
      </div>

      <div
        className={`border-2 border-black bg-white p-4 text-black ${thermal ? "" : "rounded-xl"}`}
      >
        <div className="flex items-start justify-between gap-4 border-b-2 border-black pb-3">
          <div>
            <p className="text-lg font-black uppercase tracking-tight">{settings.storeName}</p>
            {settings.address && <p className="text-xs">{settings.address}</p>}
          </div>
          <div className="text-right text-xs font-semibold uppercase">
            <p>{shipment.deliveryCompany?.name ?? "Own rider"}</p>
            <p>{shipment.providerMode === "Api" ? "API" : "Manual"} shipment</p>
          </div>
        </div>

        <div className={`mt-4 grid gap-4 text-sm ${thermal ? "grid-cols-1" : "grid-cols-2"}`}>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Ship to</p>
            <p className="mt-1 font-bold">{order.recipientName}</p>
            <p>{order.line1}</p>
            {order.line2 && <p>{order.line2}</p>}
            <p>{[order.city, order.region, order.postal].filter(Boolean).join(", ")}</p>
            <p className="mt-1 font-semibold">{order.phone}</p>
          </div>
          <div className={thermal ? "" : "text-right"}>
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Order</p>
            <p className="mt-1 font-mono font-bold">{order.number}</p>
            <p>
              {itemCount} item{itemCount === 1 ? "" : "s"}
            </p>
            <p className="font-semibold">
              {order.currencySymbol ?? "৳"}
              {order.totalCents.toLocaleString("en-BD")}
            </p>
            {codDueCents > 0 ? (
              <p className="mt-1 inline-block rounded border-2 border-black px-2 py-0.5 text-xs font-black uppercase">
                COD {order.currencySymbol ?? "৳"}
                {codDueCents.toLocaleString("en-BD")}
              </p>
            ) : (
              <p className="text-xs font-bold uppercase">Prepaid</p>
            )}
          </div>
        </div>

        <div className="mt-5 flex items-center gap-3 border-t-2 border-black pt-4">
          <QrSvg value={barcodeValue} sizePx={thermal ? 120 : 88} />
          <div className="min-w-0 flex-1">
            <BarcodeSvg value={barcodeValue} />
            <p className="mt-1 text-center font-mono text-sm font-bold tracking-[0.2em]">
              {barcodeValue}
            </p>
          </div>
        </div>
        <p className="mt-1 text-center text-[10px] uppercase tracking-wider text-gray-500">
          {shipment.deliveryCompany
            ? `Tracking ${shipment.deliveryCompany.name}`
            : "Internal tracking"}{" "}
          · QR repeats the tracking value
        </p>
      </div>

      <p className="text-center text-xs text-muted print:hidden">
        {thermal
          ? "Print on a 4×6 in thermal roll at 100% scale."
          : "Print on an A4 laser sheet at 100% scale."}{" "}
        The Code 39 barcode and the QR code both carry the tracking value.
      </p>
    </div>
  );
}
