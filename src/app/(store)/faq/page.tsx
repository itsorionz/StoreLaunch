import { Suspense } from "react";
import { getDict } from "@frontend/i18n/dict";

export const metadata = { title: "FAQ" };

async function FaqContent() {
  const dict = await getDict();

  return (
    <div className="w-full  space-y-5 py-8">
      <h1 className="text-3xl font-bold">{dict.info.faq.title}</h1>
      <div className="space-y-3">
        {dict.info.faq.items.map((item) => (
          <details key={item.q} className="card group p-5 open:border-primary/40">
            <summary className="cursor-pointer list-none text-sm font-semibold marker:hidden">
              <span className="flex items-center justify-between gap-3">
                {item.q}
                <span className="text-muted transition-transform group-open:rotate-90" aria-hidden>
                  ›
                </span>
              </span>
            </summary>
            <p className="mt-3 text-sm text-muted">{item.a}</p>
          </details>
        ))}
      </div>
    </div>
  );
}

export default function FaqPage() {
  return (
    <Suspense fallback={<div className="skeleton h-96 w-full rounded-2xl" />}>
      <FaqContent />
    </Suspense>
  );
}
