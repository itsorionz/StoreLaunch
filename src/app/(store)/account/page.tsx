import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@backend/lib/session";
import { db } from "@backend/lib/db";
import { ProfileForm } from "@frontend/components/account/profile-form";

export const metadata = { title: "My Account" };

async function ProfileContent() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?callbackUrl=/account");

  const profile = await db.user.findUnique({
    where: { id: user.id },
    select: {
      name: true,
      email: true,
      phone: true,
      gender: true,
      dateOfBirth: true,
      profilePhotoVersion: true,
    },
  });
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
