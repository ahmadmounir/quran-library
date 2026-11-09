import { describe, expect, it } from "vitest";
import { translate } from "@/i18n";
import arCommon from "@/i18n/locales/ar/common.json";
import arMushaf from "@/i18n/locales/ar/mushaf.json";
import arSettings from "@/i18n/locales/ar/settings.json";
import enCommon from "@/i18n/locales/en/common.json";
import enMushaf from "@/i18n/locales/en/mushaf.json";
import enSettings from "@/i18n/locales/en/settings.json";
import trCommon from "@/i18n/locales/tr/common.json";
import trMushaf from "@/i18n/locales/tr/mushaf.json";
import trSettings from "@/i18n/locales/tr/settings.json";

type Tree = { [key: string]: string | Tree };
const keys = (tree: Tree, prefix = ""): string[] =>
  Object.entries(tree).flatMap(([key, value]) =>
    typeof value === "string" ? [prefix + key] : keys(value, `${prefix}${key}.`),
  );
// Plural forms differ by language (Arabic has six); compare the keys without them
const base = (list: string[]) => [...new Set(list.map((key) => key.replace(/_(zero|one|two|few|many|other)$/, "")))].sort();

describe("translations", () => {
  it("has every text in Arabic, English and Turkish", () => {
    for (const [ar, en, tr] of [
      [arCommon, enCommon, trCommon],
      [arMushaf, enMushaf, trMushaf],
      [arSettings, enSettings, trSettings],
    ] as Tree[][]) {
      expect(base(keys(ar))).toEqual(base(keys(en)));
      expect(base(keys(tr))).toEqual(base(keys(en)));
    }
  });

  it("fills in values and picks the plural form of the language", () => {
    expect(translate("en", "mushaf:audio.pageNumber", { page: 50 })).toBe("Page 50");
    expect(translate("ar", "mushaf:searchResultsCount", { count: 0 })).toBe("لا توجد آيات");
    expect(translate("ar", "mushaf:searchResultsCount", { count: 2 })).toBe("آيتان");
    expect(translate("ar", "mushaf:searchResultsCount", { count: 3 })).toBe("3 آيات");
    expect(translate("ar", "mushaf:searchResultsCount", { count: 11 })).toBe("11 آية");
    expect(translate("en", "mushaf:searchResultsCount", { count: 1 })).toMatch(/1|one/i);
  });

  it("reads the common namespace by default and falls back to the key's name", () => {
    expect(translate("tr", "close")).toBe("Kapat");
    expect(translate("en", "mushaf:nothing.here")).toBe("nothing.here");
  });
});
