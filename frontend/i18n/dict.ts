import "server-only";
import { cookies } from "next/headers";
import { getStoreSettings } from "@backend/lib/settings";
import { en, type Dictionary } from "./en";
import { bn } from "./bn";
import { LANG_COOKIE, LANGS, type Lang } from "./constants";

export function isLang(v: string | undefined | null): v is Lang {
  return v === "en" || v === "bn";
}

function pickDict(lang: Lang): Dictionary {
  return lang === "bn" ? bn : en;
}

export async function getDict(): Promise<Dictionary> {
  const cookieStore = await cookies();
  const fromCookie = cookieStore.get(LANG_COOKIE)?.value;
  if (isLang(fromCookie)) return pickDict(fromCookie);
  const settings = await getStoreSettings();
  return pickDict(settings.language === "bn" ? "bn" : "en");
}

export { pickDict, en, bn };
export type { Dictionary };
export { LANG_COOKIE, LANGS };
export type { Lang };
export { fmt } from "./fmt";
