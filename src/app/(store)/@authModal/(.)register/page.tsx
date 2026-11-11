import { Suspense } from "react";
import Link from "next/link";
import { getStoreSettings } from "@backend/lib/settings";
import { getDict } from "@frontend/i18n/dict";
import { RegisterForm } from "@frontend/components/auth/auth-forms";
import { AuthRouteModal } from "@frontend/components/auth/auth-route-modal";
import { StoreLogo } from "@frontend/components/layout/store-logo";

async function RegisterModalContent({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const params = await searchParams;
  const referralCode = typeof params.ref === "string" ? params.ref.slice(0, 32) : "";
  const [settings, dict] = await Promise.all([getStoreSettings(), getDict()]);

  return (
    <AuthRouteModal title={dict.auth.createAccount}>
      <Link href="/" className="mb-6 flex items-center justify-center gap-2">
        <StoreLogo
          logoUrl={settings.logoUrl}
          storeName={settings.storeName}
          className="h-8 w-8 text-sm"
        />
        <span className="text-base font-bold tracking-tight">{settings.storeName}</span>
      </Link>
      <p className="mb-4 text-sm text-muted">{dict.auth.joinStore}</p>
      <RegisterForm referralCode={referralCode} />
    </AuthRouteModal>
  );
}

export default function InterceptedRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  return (
    <Suspense fallback={null}>
      <RegisterModalContent searchParams={searchParams} />
    </Suspense>
  );
}
