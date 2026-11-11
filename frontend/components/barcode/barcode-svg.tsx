import { encodeCode39 } from "@backend/lib/barcode";

const QUIET_MODULES = 10;
const MODULE_PX = 2;

/**
 * Renders `value` as a Code 39 barcode SVG. Bars sit on even element indices
 * (the encoder alternates bar/space starting with a bar).
 */
export function BarcodeSvg({
  value,
  height = 72,
  className = "h-[72px] w-full",
  modulePx = MODULE_PX,
}: {
  value: string;
  height?: number;
  className?: string;
  modulePx?: number;
}) {
  const encoding = encodeCode39(value);
  if (!encoding) return null;

  const widthModules = encoding.totalModules + QUIET_MODULES * 2;
  let cursor = QUIET_MODULES;
  const bars: { x: number; width: number }[] = [];
  encoding.widths.forEach((element, index) => {
    if (index % 2 === 0) bars.push({ x: cursor * modulePx, width: element * modulePx });
    cursor += element;
  });

  return (
    <svg
      role="img"
      aria-label={`Barcode ${encoding.text}`}
      viewBox={`0 0 ${widthModules * modulePx} ${height}`}
      className={className}
      preserveAspectRatio="xMidYMid meet"
    >
      <rect width={widthModules * modulePx} height={height} fill="white" />
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
