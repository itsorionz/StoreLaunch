"use client";

import { createContext, useContext } from "react";
import type { Dictionary } from "./en";
import type { Lang } from "./constants";
import { fmt } from "./fmt";

const DictContext = createContext<{ dict: Dictionary; lang: Lang }>({
  dict: { lang: "en" } as unknown as Dictionary,
  lang: "en",
});

export function DictProvider({
  dict,
  lang,
  children,
}: {
  dict: Dictionary;
  lang: Lang;
  children: React.ReactNode;
}) {
  return <DictContext.Provider value={{ dict, lang }}>{children}</DictContext.Provider>;
}

export function useDict(): Dictionary {
  return useContext(DictContext).dict;
}

export function useLang(): Lang {
  return useContext(DictContext).lang;
}

export { fmt };
