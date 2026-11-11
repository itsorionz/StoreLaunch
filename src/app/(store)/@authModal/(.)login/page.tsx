import { Suspense } from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import { LOGIN_ROLE_COOKIE, pendingLoginProof } from "@backend/lib/login";
import { getStoreSettings } from "@backend/lib/settings";
import { getDict } from "@frontend/i18n/dict";
import { LoginTabs, type LoginRole } from "@frontend/components/auth/auth-forms";
import { AuthRouteModal } from "@frontend/components/auth/auth-route-modal";
import { StoreLogo } from "@frontend/components/layout/store-logo";

async function LoginModalContent({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl } = await searchParams;
  const [settings, dict] = await Promise.all([getStoreSettings(), getDict()]);
  const proof = await pendingLoginProof((await cookies()).get(LOGIN_ROLE_COOKIE)?.value);

  return (
    <AuthRouteModal title={dict.auth.signIn}>
      <Link href="/" className="mb-6 flex items-center justify-center gap-2">
        <StoreLogo
          logoUrl={settings.logoUrl}
          storeName={settings.storeName}
          className="h-8 w-8 text-sm"
        />
        <span className="text-base font-bold tracking-tight">{settings.storeName}</span>
      </Link>
      <p className="mb-4 text-sm text-muted">{dict.auth.welcomeBack}</p>
      <LoginTabs
        key={proof?.ticket ?? "login"}
        callbackUrl={callbackUrl}
        pendingProof={proof as { ticket: string; roles: LoginRole[] } | null}
      />
    </AuthRouteModal>
  );
}

export default function InterceptedLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  return (
    <Suspense fallback={null}>
      <LoginModalContent searchParams={searchParams} />
    </Suspense>
  );
}
