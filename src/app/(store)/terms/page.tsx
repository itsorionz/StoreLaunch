import { Suspense } from "react";
import { getDict } from "@frontend/i18n/dict";

export const metadata = { title: "Terms & Conditions" };

async function TermsContent() {
  const dict = await getDict();

  return (
    <div className="w-full  space-y-5 py-8">
      <h1 className="text-3xl font-bold">{dict.info.terms.title}</h1>
      <p className="text-sm text-muted">{dict.info.terms.intro}</p>
      <ol className="card space-y-3 p-6">
        {dict.info.terms.items.map((item, i) => (
          <li key={item} className="flex gap-3 text-sm text-muted">
            <span className="font-bold text-primary">{i + 1}.</span>
            {item}
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function TermsPage() {
  return (
    <Suspense fallback={<div className="skeleton h-96 w-full rounded-2xl" />}>
      <TermsContent />
    </Suspense>
  );
}
