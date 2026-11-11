"use client";

import { useEffect, useState } from "react";
import { getLicenseStats } from "@backend/actions/license";

export function LicenseStats() {
  const [stats, setStats] = useState<{
    totalStores: number;
    activeLicenses: number;
    expiredLicenses: number;
    revokedLicenses: number;
    trialLicenses: number;
    storesWithoutLicense: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getLicenseStats().then(setStats, (e) => {
      setError("Could not load license stats");
      console.error(e);
    });
  }, []);

  if (error) {
    return (
      <section className="card p-5 sm:p-6 border border-accent/40 bg-accent/10">
        <h2 className="font-bold text-accent">License stats unavailable</h2>
        <p className="mt-1 text-xs text-accent">{error}</p>
      </section>
    );
  }

  if (!stats) return null;

  return (
    <section className="card p-5 sm:p-6" aria-label="License statistics">
      <h2 className="font-bold">License statistics</h2>
      <p className="mt-1 text-xs text-muted">
        Stores, active licenses, and license usage across all instances.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <StatCard title="Total stores" value={stats.totalStores} tone="text-primary" />
        <StatCard
          title="Active licenses"
          value={stats.activeLicenses}
          tone="text-emerald-600 dark:text-emerald-400"
        />
        <StatCard
          title="Stores without license"
          value={stats.storesWithoutLicense}
          tone={stats.storesWithoutLicense > 0 ? "text-accent" : "text-emerald-600 dark:text-emerald-400"}
        />
        <StatCard title="Expired licenses" value={stats.expiredLicenses} tone="text-accent" />
        <StatCard title="Revoked licenses" value={stats.revokedLicenses} tone="text-muted" />
        <StatCard title="Trial licenses" value={stats.trialLicenses} tone="text-amber-600 dark:text-amber-400" />
      </div>
    </section>
  );
}

function StatCard({
  title,
  value,
  tone,
}: {
  title: string;
  value: number;
  tone: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface-2 p-4">
      <dt className="text-xs text-muted">{title}</dt>
      <dd className={`mt-1 text-lg font-bold ${tone}`}>{value}</dd>
    </div>
  );
}
