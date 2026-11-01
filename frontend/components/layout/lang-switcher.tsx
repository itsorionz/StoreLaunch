"use client";

import { usePathname, useRouter } from "next/navigation";
import { useLang } from "@frontend/i18n/provider";
import { LANG_COOKIE } from "@frontend/i18n/constants";

export function LangSwitcher({ className = "" }: { className?: string }) {
  const lang = useLang();
  const router = useRouter();
  const pathname = usePathname();

  function switchTo(next: "en" | "bn") {
    if (next === lang) return;
    document.cookie = `${LANG_COOKIE}=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    document.documentElement.lang = next;
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={() => switchTo(lang === "en" ? "bn" : "en")}
      aria-label={lang === "en" ? "বাংলায় দেখুন" : "View in English"}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold transition-colors hover:bg-white/15 ${className}`}
      data-pathname={pathname}
    >
      {lang === "en" ? "বাংলা" : "EN"}
    </button>
  );
}
