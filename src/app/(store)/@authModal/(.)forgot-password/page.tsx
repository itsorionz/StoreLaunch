import { Suspense } from "react";
import Link from "next/link";
import { getStoreSettings } from "@backend/lib/settings";
import { ForgotPasswordForm } from "@frontend/components/auth/auth-forms";
import { AuthRouteModal } from "@frontend/components/auth/auth-route-modal";
import { StoreLogo } from "@frontend/components/layout/store-logo";

async function ForgotPasswordModalContent() {
  const settings = await getStoreSettings();

  return (
    <AuthRouteModal title="Recover your account">
      <Link href="/" className="mb-6 flex items-center justify-center gap-2">
        <StoreLogo
          logoUrl={settings.logoUrl}
          storeName={settings.storeName}
          className="h-8 w-8 text-sm"
        />
        <span className="text-base font-bold tracking-tight">{settings.storeName}</span>
      </Link>
      <p className="mb-4 text-sm text-muted">Reset your {settings.storeName} password securely.</p>
      <ForgotPasswordForm />
    </AuthRouteModal>
  );
}

export default function InterceptedForgotPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ForgotPasswordModalContent />
    </Suspense>
  );
}
