import Link from "next/link";
import { getStoreSettings } from "@backend/lib/settings";
import { ForgotPasswordForm } from "@frontend/components/auth/auth-forms";
import { StoreLogo } from "@frontend/components/layout/store-logo";

export const metadata = { title: "Recover account" };

export default async function ForgotPasswordPage() {
  const settings = await getStoreSettings();

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
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
          <h1 className="text-xl font-bold">Recover your account</h1>
          <p className="mb-6 mt-1 text-sm text-muted">
            Reset your {settings.storeName} password securely.
          </p>
          <ForgotPasswordForm />
          <p className="mt-5 text-center text-sm">
            <Link href="/login" className="font-semibold text-primary">
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
