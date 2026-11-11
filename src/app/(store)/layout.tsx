import type { ReactNode } from "react";
import { Suspense } from "react";
import { StoreHeader } from "@frontend/components/layout/header";
import { StoreFooter } from "@frontend/components/layout/footer";
import { StoreChrome } from "@frontend/components/layout/store-chrome";

async function RiderLock() {
  const { connection } = await import("next/server");
  const { getCurrentUser } = await import("@backend/lib/session");
  const { Roles } = await import("@backend/lib/enums.mjs");
  const { redirect } = await import("next/navigation");
  await connection();
  const user = await getCurrentUser();
  if (user?.role === Roles.Rider) redirect("/rider");
  return null;
}

async function ServiceLock() {
  const { connection } = await import("next/server");
  const { getCurrentUser } = await import("@backend/lib/session");
  const { Roles } = await import("@backend/lib/enums.mjs");
  const { redirect } = await import("next/navigation");
  await connection();
  const user = await getCurrentUser();
  if (user?.role === Roles.Support) redirect("/support");
  return null;
}

export default function StoreLayout({
  children,
  authModal,
}: {
  children: ReactNode;
  authModal: ReactNode;
}) {
  return (
    <>
      <Suspense fallback={null}>
        <RiderLock />
      </Suspense>
      <Suspense fallback={null}>
        <ServiceLock />
      </Suspense>
      <StoreChrome>
        <Suspense
          fallback={
            <header className="sticky top-0 z-50">
              <div className="h-7 bg-primary-dark" />
              <div className="h-[105px] border-b border-border bg-surface" />
            </header>
          }
        >
          <StoreHeader />
        </Suspense>
      </StoreChrome>
      <main className="flex-1">{children}</main>
      <StoreChrome>
        <Suspense fallback={<footer className="mt-16 h-64 border-t border-border bg-surface" />}>
          <StoreFooter />
        </Suspense>
      </StoreChrome>
      {authModal}
    </>
  );
}
