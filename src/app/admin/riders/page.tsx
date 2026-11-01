import { AccountStatusTargets, EntityStatuses } from "@backend/lib/enums.mjs";
import { AccountStatusToggle } from "@frontend/components/admin/account-status-toggle";
import { db } from "@backend/lib/db";
import {
  DeleteRiderButton,
  DeleteDeliveryCompanyButton,
} from "@frontend/components/admin/delete-buttons";
import {
  AddRiderModal,
  EditRiderModal,
  AddCompanyModal,
  EditCompanyModal,
} from "@frontend/components/admin/entity-modals";
import { PageHeader } from "@frontend/components/admin/admin-ui";

export const metadata = { title: "Delivery — Admin" };

export default async function AdminDeliveryPage() {
  const [riders, companies] = await Promise.all([
    db.rider.findMany({
      orderBy: { name: "asc" },
      include: {
        _count: { select: { orders: true } },
        user: { select: { email: true, active: true } },
      },
    }),
    db.deliveryCompany.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { orders: true } } },
    }),
  ]);

  return (
    <div className="animate-fade-up space-y-8">
      <PageHeader
        title="Delivery"
        subtitle={`${riders.length} partners · ${companies.length} companies`}
      />

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">Delivery partners</h2>
          <AddRiderModal />
        </div>
        <div className="card overflow-hidden">
          <ul className="divide-y divide-border">
            {riders.length === 0 && (
              <li className="px-5 py-8 text-center text-sm text-muted">
                No delivery partners yet. Add partners (with login accounts) to assign them to
                orders.
              </li>
            )}
            {riders.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-xs font-bold text-muted">
                    {r.name.charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{r.name}</p>
                    {r.user && !r.user.active && (
                      <p className="text-xs text-accent">
                        Linked account is inactive; login and assignments blocked.
                      </p>
                    )}
                    <p className="truncate text-xs text-muted">
                      {r.phone} · {r.user?.email ?? "no login"} · {r._count.orders} orders
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <span
                    className={`mr-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      r.active ? "bg-primary/15 text-primary" : "bg-muted text-muted"
                    }`}
                  >
                    {r.active ? EntityStatuses.Active : EntityStatuses.Inactive}
                  </span>
                  <AccountStatusToggle
                    key={String(r.active)}
                    id={r.id}
                    active={r.active}
                    target={AccountStatusTargets.Rider}
                  />
                  <EditRiderModal
                    rider={{
                      id: r.id,
                      name: r.name,
                      phone: r.phone,
                      active: r.active,
                      email: r.user?.email ?? null,
                    }}
                  />
                  <DeleteRiderButton id={r.id} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">Delivery companies</h2>
          <AddCompanyModal />
        </div>
        <div className="card overflow-hidden">
          <ul className="divide-y divide-border">
            {companies.length === 0 && (
              <li className="px-5 py-8 text-center text-sm text-muted">
                No delivery companies yet. Add external couriers (Steadfast, Pathao, RedX…) to
                assign orders to them.
              </li>
            )}
            {companies.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-xs font-bold text-muted">
                    {c.name.charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{c.name}</p>
                    <p className="truncate text-xs text-muted">
                      {c.phone ?? "no phone"} ·{" "}
                      {c.trackingUrl ? (
                        <span className="text-primary">{c.trackingUrl}</span>
                      ) : (
                        "no tracking"
                      )}{" "}
                      · {c.labelFormat === "Thermal" ? "Thermal (4×6)" : "Laser (A4)"}
                      {c.volumeDiscountBps > 0
                        ? ` · ${`${(c.volumeDiscountBps / 100).toFixed(2)}`.replace(/\.?0+$/, "")}% volume discount`
                        : ""}{" "}
                      · {c._count.orders} orders
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <span
                    className={`mr-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      c.active ? "bg-primary/15 text-primary" : "bg-muted text-muted"
                    }`}
                  >
                    {c.active ? EntityStatuses.Active : EntityStatuses.Inactive}
                  </span>
                  <EditCompanyModal
                    company={{
                      id: c.id,
                      name: c.name,
                      phone: c.phone,
                      trackingUrl: c.trackingUrl,
                      volumeDiscountBps: c.volumeDiscountBps,
                      volumeMinParcels: c.volumeMinParcels,
                      labelFormat: c.labelFormat as "A4" | "Thermal",
                      active: c.active,
                    }}
                  />
                  <DeleteDeliveryCompanyButton id={c.id} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
