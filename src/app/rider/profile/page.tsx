import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getRider } from "@backend/lib/session";
import { getRiderProfileInfo } from "@backend/lib/rider-queries";
import { ProfileForm } from "@frontend/components/account/profile-form";

async function RiderProfile() {
  const ctx = await getRider();
  if (!ctx) redirect("/login?callbackUrl=/rider");
  const { profile, stats, delivered } = await getRiderProfileInfo(ctx.rider.id, ctx.user.id);
  if (!profile) redirect("/login");

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">Profile</h1>
      <section className="card p-5">
        <p className="mb-4 text-sm font-medium text-primary">Active delivery partner</p>
        <ProfileForm profile={{ ...profile, name: ctx.rider.name, phone: ctx.rider.phone }} />
      </section>

      <section className="grid grid-cols-2 gap-3">
        <div className="card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Total assigned</p>
          <p className="mt-1 text-2xl font-bold">{stats._count.id}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Delivered</p>
          <p className="mt-1 text-2xl font-bold">{delivered}</p>
        </div>
      </section>

      <Link href="/rider/help" className="btn-outline inline-flex">
        Delivery help & dispatch contact
      </Link>
    </div>
  );
}

export default function RiderProfilePage() {
  return (
    <Suspense fallback={<div className="skeleton h-64 w-full rounded-2xl" />}>
      <RiderProfile />
    </Suspense>
  );
}
