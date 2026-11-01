import { Suspense } from "react";
import Link from "next/link";
import { getDict } from "@frontend/i18n/dict";

async function NotFoundContent() {
  const dict = await getDict();
  return (
    <div className="w-full flex  flex-col items-center px-4 py-24 text-center">
      <p className="animate-fade-up text-7xl font-black tracking-tight text-primary-light">404</p>
      <h1 className="mt-3 text-2xl font-bold tracking-tight">{dict.notFound.title}</h1>
      <p className="mt-2 max-w-sm text-muted">{dict.notFound.hint}</p>
      <Link href="/" className="btn-primary btn-lg mt-8">
        {dict.notFound.backHome}
      </Link>
    </div>
  );
}

export default function NotFound() {
  return (
    <Suspense fallback={<div className="py-24 text-center text-muted">…</div>}>
      <NotFoundContent />
    </Suspense>
  );
}
