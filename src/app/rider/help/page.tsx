import Link from "next/link";
import { redirect } from "next/navigation";
import { getRider } from "@backend/lib/session";
import { getStoreSettings } from "@backend/lib/settings";

export default async function RiderHelpPage() {
  if (!(await getRider())) redirect("/login?callbackUrl=/rider/help");
  const store = await getStoreSettings();
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Delivery help</h1>
      <section className="card space-y-3 p-5">
        <h2 className="font-bold">Contact the store</h2>
        <p>{store.storeName}</p>
        {store.contactPhone && (
          <a className="btn-primary inline-flex" href={`tel:${store.contactPhone}`}>
            Call dispatch: {store.contactPhone}
          </a>
        )}
        {store.contactEmail && (
          <a className="block text-sm text-primary" href={`mailto:${store.contactEmail}`}>
            {store.contactEmail}
          </a>
        )}
        {!store.contactPhone && !store.contactEmail && (
          <p className="text-sm text-muted">
            Ask your dispatcher for the store contact number before starting deliveries.
          </p>
        )}
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        {[
          [
            "1. Collect and check",
            "Open the delivery details, check the parcel items and cash due, then mark shipped when the parcel is in your possession.",
          ],
          [
            "2. Find and contact",
            "Use My route for the next stop. Open the address in Maps and call the customer to confirm the entrance or a landmark. Map results are suggestions; confirm the actual address.",
          ],
          [
            "3. Complete handover",
            "Record the receiver name and relationship in Proof of delivery. Add a parcel photo if useful, confirm handover and collect the full COD amount shown before completing.",
          ],
          [
            "4. If delivery fails",
            "Record an attempt with the reason and useful notes. Agree a retry time where possible. Keep the parcel safe and contact dispatch for refusal, damage or returns; a failed attempt does not cancel an order.",
          ],
          [
            "5. Hand cash to the store",
            "Check Cash & handover for unremitted cash. Obtain a receipt and ask the admin to record it. Never mark money received on behalf of the store.",
          ],
          [
            "6. Protect customer information",
            "Use customer details only for this delivery. Avoid faces and identity documents in photos. Stop safely before using the app or contacting the customer.",
          ],
        ].map(([title, body]) => (
          <section key={title} className="card p-5">
            <h2 className="font-bold">{title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
          </section>
        ))}
      </div>
      <Link href="/rider/route" className="btn-primary inline-flex">
        Open my route
      </Link>
    </div>
  );
}
