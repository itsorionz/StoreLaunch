import { redirect } from "next/navigation";
import { getStoreSettings } from "@backend/lib/settings";
import { SetupWizard } from "@frontend/components/setup/setup-wizard";
import { StoreLogo } from "@frontend/components/layout/store-logo";
import { ThemeToggle } from "@frontend/components/layout/theme-provider";

export const metadata = { title: "Setup — StoreLaunch" };

export default async function SetupPage() {
  const settings = await getStoreSettings();
  if (settings.setupCompletedAt) redirect("/");

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="absolute right-4 top-4 text-muted">
        <ThemeToggle className="hover:bg-surface-2" />
      </div>
      <div className="w-full max-w-md animate-fade-up">
        <div className="mb-8 flex items-center justify-center gap-2">
          <StoreLogo
            logoUrl={settings.logoUrl}
            storeName={settings.storeName}
            className="h-9 w-9 text-sm"
          />
          <span className="text-lg font-bold tracking-tight">{settings.storeName}</span>
        </div>
        <div className="card p-6 shadow-md sm:p-8">
          <h1 className="text-xl font-bold tracking-tight">Set up your store</h1>
          <p className="mb-6 mt-1 text-sm text-muted">
            Enter your license key and store details to launch.
          </p>
          <SetupWizard />
        </div>
      </div>
    </main>
  );
}
