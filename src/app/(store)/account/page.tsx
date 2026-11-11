import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@backend/lib/session";
import { getAccountProfile } from "@backend/lib/account-queries";
import { ProfileForm } from "@frontend/components/account/profile-form";

export const metadata = { title: "My Account" };

async function ProfileContent() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?callbackUrl=/account");

  const profile = await getAccountProfile(user.id);
  if (!profile) redirect("/login");

  return (
    <div className="card p-6">
      <ProfileForm profile={profile} />
    </div>
  );
}

export default function AccountPage() {
  return (
    <Suspense fallback={<div className="skeleton h-96 w-full rounded-2xl" />}>
      <ProfileContent />
    </Suspense>
  );
}
