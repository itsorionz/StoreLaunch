import { Suspense } from "react";
import { getDict } from "@frontend/i18n/dict";

export const metadata = { title: "Privacy Policy" };

async function PrivacyContent() {
  const dict = await getDict();

  return (
    <div className="w-full  space-y-5 py-8">
      <h1 className="text-3xl font-bold">{dict.info.privacy.title}</h1>
      <p className="text-sm text-muted">{dict.info.privacy.intro}</p>
      <ul className="card space-y-3 p-6">
        {dict.info.privacy.items.map((item) => (
          <li key={item} className="flex gap-3 text-sm text-muted">
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function PrivacyPage() {
  return (
    <Suspense fallback={<div className="skeleton h-96 w-full rounded-2xl" />}>
      <PrivacyContent />
    </Suspense>
  );
}
