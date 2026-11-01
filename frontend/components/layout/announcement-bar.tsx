"use client";

import type { CSSProperties } from "react";

export function AnnouncementBar({
  children,
  backgroundColor = "#e6f4ec",
  direction = "left",
  speed = 24,
}: {
  children: React.ReactNode;
  backgroundColor?: string;
  direction?: string;
  speed?: number;
}) {
  return (
    <div
      className="text-foreground"
      style={{
        backgroundColor,
        color: readableTextColor(backgroundColor),
      }}
    >
      <div
        className="announcement-marquee relative flex min-h-12 items-center overflow-hidden py-3"
        data-direction={direction === "right" ? "right" : "left"}
        style={
          {
            "--announcement-duration": `${Math.min(90, Math.max(8, speed))}s`,
          } as CSSProperties & {
            "--announcement-duration": string;
          }
        }
      >
        <div className="announcement-track text-sm font-medium leading-snug">
          <span className="inline-flex shrink-0 items-center whitespace-nowrap px-8">
            {children}
          </span>
          <span
            aria-hidden="true"
            className="inline-flex shrink-0 items-center whitespace-nowrap px-8"
          >
            {children}
          </span>
        </div>
      </div>
    </div>
  );
}

function readableTextColor(hex: string): string {
  const channels = hex.match(/^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i);
  if (!channels) return "#17212b";
  const linear = channels.slice(1).map((part) => {
    const channel = Number.parseInt(part, 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  return luminance > 0.45 ? "#17212b" : "#ffffff";
}
