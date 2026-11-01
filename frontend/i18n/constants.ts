export const LANG_COOKIE = "sl_lang";
export const LANGS = ["en", "bn"] as const;
export type Lang = (typeof LANGS)[number];
