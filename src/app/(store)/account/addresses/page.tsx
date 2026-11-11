import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@backend/lib/session";
import { listAccountAddresses } from "@backend/lib/account-queries";
import { AddressManager } from "@frontend/components/account/address-manager";

export const metadata = { title: "Delivery Address" };

async function AddressContent() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?callbackUrl=/account/addresses");

  const addresses = await listAccountAddresses(user.id);

  return <AddressManager addresses={addresses} />;
}

export default function AddressesPage() {
  return (
    <Suspense fallback={<div className="skeleton h-96 w-full rounded-2xl" />}>
      <AddressContent />
    </Suspense>
  );
}
