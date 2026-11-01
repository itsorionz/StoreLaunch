"use client";

import { usePathname } from "next/navigation";
import { Suspense } from "react";

export function StoreChrome({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <RouteChrome>{children}</RouteChrome>
    </Suspense>
  );
}

function RouteChrome({ children }: { children: React.ReactNode }) {
  return usePathname() === "/checkout" ? null : children;
}
