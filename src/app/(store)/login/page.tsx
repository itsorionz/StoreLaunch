import { Suspense } from "react";
import Link from "next/link";
import { getStoreSettings } from "@backend/lib/settings";
import { getDict } from "@frontend/i18n/dict";
import { LoginTabs, type LoginRole } from "@frontend/components/auth/auth-forms";
import { StoreLogo } from "@frontend/components/layout/store-logo";
import { cookies } from "next/headers";
import { LOGIN_ROLE_COOKIE, pendingLoginProof } from "@backend/lib/login";

export const metadata = { title: "Sign in" };

async function LoginContent({ searchParams }: { searchParams: Promise<{ callbackUrl?: string }> }) {
  const { callbackUrl } = await searchParams;
  const [settings, dict] = await Promise.all([getStoreSettings(), getDict()]);
  const proof = await pendingLoginProof((await cookies()).get(LOGIN_ROLE_COOKIE)?.value);

  return (
    <div className="w-full max-w-md animate-fade-up">
      <Link href="/" className="mb-8 flex items-center justify-center gap-2">
        <StoreLogo
          logoUrl={settings.logoUrl}
          storeName={settings.storeName}
          className="h-9 w-9 text-sm"
        />
        <span className="text-lg font-bold tracking-tight">{settings.storeName}</span>
      </Link>
      <div className="card p-6 shadow-md sm:p-8">
        <h1 className="text-xl font-bold tracking-tight">{dict.auth.signIn}</h1>
        <p className="mb-4 mt-1 text-sm text-muted">{dict.auth.welcomeBack}</p>
        <LoginTabs
          key={proof?.ticket ?? "login"}
          callbackUrl={callbackUrl}
          pendingProof={proof as { ticket: string; roles: LoginRole[] } | null}
        />
      </div>
    </div>
  );
}

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <Suspense fallback={<div className="skeleton h-[480px] w-full max-w-md rounded-2xl" />}>
        <LoginContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
