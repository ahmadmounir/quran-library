import { describe, expect, it } from "vitest";
import { matchesSearch, normalizeArabic, surahMatches } from "@/lib/arabicSearch";

describe("Arabic search normalization", () => {
  it("treats every alef and hamza the same", () => {
    expect(normalizeArabic("الإنسان")).toBe(normalizeArabic("الانسان"));
    expect(normalizeArabic("أنزلناه")).toBe(normalizeArabic("انزلناه"));
    expect(normalizeArabic("القرآن")).toBe(normalizeArabic("القران"));
    expect(normalizeArabic("ٱلْحَمْدُ")).toBe("الحمد");
    expect(normalizeArabic("ملائكة")).toBe(normalizeArabic("ملايكه"));
    expect(normalizeArabic("المؤمنون")).toBe(normalizeArabic("المومنون"));
    expect(normalizeArabic("السماء")).toBe(normalizeArabic("السما"));
    expect(normalizeArabic("النبإ")).toBe(normalizeArabic("النبأ"));
  });

  it("ignores harakat, Quranic marks, tatweel, ى / ي, ة / ه and Persian keyboard letters", () => {
    expect(normalizeArabic("يَٰٓأَيُّهَا")).toBe(normalizeArabic("يايها"));
    expect(normalizeArabic("هـدى")).toBe(normalizeArabic("هدي"));
    expect(normalizeArabic("رحمة")).toBe(normalizeArabic("رحمه"));
    expect(normalizeArabic("کتاب علی")).toBe(normalizeArabic("كتاب علي"));
    expect(normalizeArabic("ﻻ")).toBe("لا");
  });

  it("finds every word typed, in any order", () => {
    expect(matchesSearch("يا ايها الناس اعبدوا ربكم", "يأيها ربكم")).toBe(true);
    expect(matchesSearch("يا ايها الناس اعبدوا ربكم", "ربكم الناس")).toBe(true);
    expect(matchesSearch("يا ايها الناس اعبدوا ربكم", "ربكم الجن")).toBe(false);
  });
});

describe("surah search", () => {
  const insan = { id: 76, name_arabic: "الإنسان", name_simple: "Al-Insan" };
  const baqarah = { id: 2, name_arabic: "البقرة", name_simple: "Al-Baqarah" };
  const naba = { id: 78, name_arabic: "النبإ", name_simple: "An-Naba" };

  it("matches the Arabic name with or without hamza, and without ال", () => {
    expect(surahMatches(insan, "الانسان")).toBe(true);
    expect(surahMatches(insan, "الإنسان")).toBe(true);
    expect(surahMatches(insan, "انسان")).toBe(true);
    expect(surahMatches(insan, "سورة الانسان")).toBe(true);
    expect(surahMatches(naba, "النبأ")).toBe(true);
    expect(surahMatches(baqarah, "البقره")).toBe(true);
    expect(surahMatches(baqarah, "الانسان")).toBe(false);
  });

  it("matches the English name and the exact number", () => {
    expect(surahMatches(insan, "insan")).toBe(true);
    expect(surahMatches(insan, "Al Insan")).toBe(true);
    expect(surahMatches(baqarah, "2")).toBe(true);
    expect(surahMatches({ id: 12, name_arabic: "يوسف", name_simple: "Yusuf" }, "2")).toBe(false);
  });
});

describe("the mushaf's ayah search over the real text", async () => {
  const { readFileSync } = await import("node:fs");
  const { matchesPrepared, prepareQuery, toSearchable } = await import("@/lib/arabicSearch");
  const verses = JSON.parse(readFileSync("../data/mushaf/search_text.json", "utf8")) as { verse_key: string; text_plain: string }[];
  const searchable = verses.map((v) => toSearchable(v.text_plain));
  const find = (query: string) => {
    const prepared = prepareQuery(query);
    return verses.filter((_, i) => matchesPrepared(searchable[i], prepared)).map((v) => v.verse_key);
  };

  it("finds the same ayat with or without hamza and harakat", () => {
    expect(find("الإنسان")).toEqual(find("الانسان"));
    expect(find("الإنسان")).toContain("76:1");
    expect(find("يَا أَيُّهَا النَّاسُ")).toContain("2:21");
    expect(find("يأيها الناس")).toContain("2:21");
    expect(find("الملائكة")).toEqual(find("الملايكه"));
    expect(find("تساءلون")).toContain("4:1");
    expect(find("تسالون")).toContain("4:1");
  });

  it("is fast enough to run on every key press", () => {
    const start = performance.now();
    for (const query of ["ال", "الر", "الرح", "الرحم", "الرحمن"]) find(query);
    expect((performance.now() - start) / 5).toBeLessThan(50);
  });
});
