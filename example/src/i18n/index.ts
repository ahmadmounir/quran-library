import { useCallback, useMemo } from "react";
import { useSettings, type Language } from "@/settings/store";
import arCommon from "./locales/ar/common.json";
import arMushaf from "./locales/ar/mushaf.json";
import arSettings from "./locales/ar/settings.json";
import enCommon from "./locales/en/common.json";
import enMushaf from "./locales/en/mushaf.json";
import enSettings from "./locales/en/settings.json";
import trCommon from "./locales/tr/common.json";
import trMushaf from "./locales/tr/mushaf.json";
import trSettings from "./locales/tr/settings.json";

/**
 * A very small translation helper with the calls of i18next (`t("mushaf:audio.play")`, `{{name}}` values, the
 * `_zero` / `_one` / `_two` / `_few` / `_many` / `_other` plural forms), so the mushaf code reads like the Hafiz app it
 * comes from, without the library. Three languages: ar, en, tr.
 */
type Tree = { [key: string]: string | Tree };
const RESOURCES: Record<Language, Record<string, Tree>> = {
  ar: { common: arCommon, mushaf: arMushaf, settings: arSettings },
  en: { common: enCommon, mushaf: enMushaf, settings: enSettings },
  tr: { common: trCommon, mushaf: trMushaf, settings: trSettings },
};

const lookup = (language: Language, namespace: string, path: string): string | undefined => {
  let node: string | Tree | undefined = RESOURCES[language][namespace];
  for (const part of path.split(".")) {
    if (!node || typeof node === "string") return undefined;
    node = node[part];
  }
  return typeof node === "string" ? node : undefined;
};

export type TValues = Record<string, string | number>;
export type TFunction = (key: string, values?: TValues) => string;

export const translate = (language: Language, key: string, values?: TValues): string => {
  const split = key.indexOf(":");
  const namespace = split >= 0 ? key.slice(0, split) : "common";
  const path = split >= 0 ? key.slice(split + 1) : key;
  const count = values?.count;
  const find = (lang: Language): string | undefined => {
    if (typeof count === "number") {
      const plural =
        (count === 0 ? lookup(lang, namespace, `${path}_zero`) : undefined) ??
        lookup(lang, namespace, `${path}_${new Intl.PluralRules(lang).select(count)}`) ??
        lookup(lang, namespace, `${path}_other`);
      if (plural) return plural;
    }
    return lookup(lang, namespace, path);
  };
  const text = find(language) ?? find("en") ?? path;
  return values ? text.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, name: string) => String(values[name] ?? match)) : text;
};

/** The translation function and the reader's language (from the settings) */
export const useI18n = () => {
  const { language } = useSettings();
  const t = useCallback<TFunction>((key, values) => translate(language, key, values), [language]);
  return useMemo(() => ({ t, language, isRTL: language === "ar" }), [t, language]);
};
