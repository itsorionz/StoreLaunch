import { Suspense } from "react";
import Link from "next/link";
import { getStoreSettings } from "@backend/lib/settings";
import { getDict } from "@frontend/i18n/dict";
import { RegisterForm } from "@frontend/components/auth/auth-forms";
import { StoreLogo } from "@frontend/components/layout/store-logo";

export const metadata = { title: "Create account" };

async function RegisterContent({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const params = await searchParams;
  const referralCode = typeof params.ref === "string" ? params.ref.slice(0, 32) : "";
  const [settings, dict] = await Promise.all([getStoreSettings(), getDict()]);

  return (
    <div className="w-full animate-fade-up">
      <Link href="/" className="mb-8 flex items-center justify-center gap-2">
        <StoreLogo
          logoUrl={settings.logoUrl}
          storeName={settings.storeName}
          className="h-9 w-9 text-sm"
        />
        <span className="text-lg font-bold tracking-tight">{settings.storeName}</span>
      </Link>
      <div className="card p-8 shadow-md">
        <h1 className="text-xl font-bold tracking-tight">{dict.auth.createAccount}</h1>
        <p className="mb-6 mt-1 text-sm text-muted">{dict.auth.joinStore}</p>
        <RegisterForm referralCode={referralCode} />
      </div>
    </div>
  );
}

export default function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <Suspense fallback={<div className="skeleton h-[520px] w-full rounded-2xl" />}>
        <RegisterContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
