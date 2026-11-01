import { Suspense } from "react";
import { ResetPasswordForm } from "@frontend/components/auth/auth-forms";

export const metadata = { title: "Reset password", referrer: "no-referrer" as const };

async function ResetPasswordContent({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token = "" } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="card w-full max-w-md p-6 shadow-md sm:p-8">
        <h1 className="text-xl font-bold">Choose a new password</h1>
        <p className="mb-6 mt-1 text-sm text-muted">
          Use at least 8 characters. Reset links expire after 30 minutes.
        </p>
        <ResetPasswordForm token={token} />
      </div>
    </main>
  );
}

export default function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
          <div className="skeleton h-80 w-full max-w-md rounded-2xl" />
        </main>
      }
    >
      <ResetPasswordContent searchParams={searchParams} />
    </Suspense>
  );
}
