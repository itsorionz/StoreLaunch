import { Suspense } from "react";
import { getDict } from "@frontend/i18n/dict";
import { getStoreSettings } from "@backend/lib/settings";

export const metadata = { title: "Return & Refund Policy" };

async function ReturnsContent() {
  const [dict, settings] = await Promise.all([getDict(), getStoreSettings()]);

  return (
    <div className="w-full  space-y-5 py-8">
      <h1 className="text-3xl font-bold">{dict.info.returns.title}</h1>
      <p className="text-sm text-muted">
        {settings.returnWindowDays > 0
          ? `Submit a return or replacement request from your delivered order within ${settings.returnWindowDays} days. The store reviews requests and inspects returned items before issuing any refund or adding stock.`
          : "Return and replacement requests are currently disabled. Contact the store about a damaged or incorrect delivery."}
      </p>
      <ul className="card space-y-3 p-6">
        {dict.info.returns.items.map((item) => (
          <li key={item} className="flex gap-3 text-sm text-muted">
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function ReturnsPage() {
  return (
    <Suspense fallback={<div className="skeleton h-96 w-full rounded-2xl" />}>
      <ReturnsContent />
    </Suspense>
  );
}
