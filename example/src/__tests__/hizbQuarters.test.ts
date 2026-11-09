import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  QUARTER_COUNT,
  QUARTER_FRACTIONS,
  hizbPositionOfPage,
  quarterStart,
  quarterStartPages,
} from "@/mushaf/utils/hizbQuarters";
import type { MushafIndex, MushafPageData } from "@/mushaf/types";
import { TOTAL_PAGES } from "@/lib/quranData";

const readJson = <T>(path: string): T =>
  JSON.parse(readFileSync(new URL(`../../../data/mushaf/${path}`, import.meta.url), "utf8")) as T;

const index = readJson<MushafIndex>("mushaf_index.json");
const RUB_SIGN = "۞"; // ۞

/** Every ayah the 1421H page files mark with ۞, in reading order */
const markedAyat = (() => {
  const found: string[] = [];
  for (let page = 1; page <= TOTAL_PAGES; page++) {
    const data = readJson<MushafPageData>(`pages/page-${String(page).padStart(3, "0")}.json`);
    for (const line of data.lines) {
      if (line.type !== "words") continue;
      for (const word of line.words) if (word.text.includes(RUB_SIGN)) found.push(`${word.surah}:${word.ayah}`);
    }
  }
  return found;
})();

const quarters = Array.from({ length: QUARTER_COUNT }, (_, n) => quarterStart(n));

describe("the quarters of the hizbs", () => {
  it("has 240 quarters in reading order", () => {
    expect(QUARTER_COUNT).toBe(240);
    expect(quarters[0]).toEqual({ surah: 1, ayah: 1 });
    for (let n = 1; n < QUARTER_COUNT; n++) {
      const before = quarters[n - 1];
      const after = quarters[n];
      expect(after.surah > before.surah || (after.surah === before.surah && after.ayah > before.ayah)).toBe(true);
    }
  });

  it("agrees with every ۞ of the print, and the quarters without one begin a surah", () => {
    const starts = new Set(quarters.map((q) => `${q.surah}:${q.ayah}`));
    expect(markedAyat).toHaveLength(199);
    for (const ayah of markedAyat) expect(starts.has(ayah), ayah).toBe(true);
    const marked = new Set(markedAyat);
    const unmarked = quarters.filter((q) => !marked.has(`${q.surah}:${q.ayah}`));
    expect(unmarked).toHaveLength(41);
    for (const q of unmarked) expect(q.ayah, `${q.surah}:${q.ayah}`).toBe(1);
    // The Madinah print's quarter, not Tanzil's 15:50
    expect(starts.has("15:49")).toBe(true);
  });

  it("never starts two quarters on one page", () => {
    const pages = quarterStartPages(index);
    expect(new Set(pages).size).toBe(QUARTER_COUNT);
    for (let n = 1; n < pages.length; n++) expect(pages[n]).toBeGreaterThan(pages[n - 1]);
  });

  it("gives a page the last quarter begun by its end", () => {
    expect(hizbPositionOfPage(1, index)).toEqual({ hizb: 1, quarter: 0 });
    expect(hizbPositionOfPage(4, index)).toEqual({ hizb: 1, quarter: 0 });
    expect(hizbPositionOfPage(5, index)).toEqual({ hizb: 1, quarter: 1 }); // 2:26
    // Hizb 2 begins on line 11 of page 11 (2:75)
    expect(hizbPositionOfPage(10, index)).toEqual({ hizb: 1, quarter: 3 });
    expect(hizbPositionOfPage(11, index)).toEqual({ hizb: 2, quarter: 0 });
    // Al-Kahf: hizb 31 at 18:75 (page 302), its second quarter at 18:99 (page 304), like the Golden Mushaf shows
    expect(hizbPositionOfPage(301, index)).toEqual({ hizb: 30, quarter: 3 });
    expect(hizbPositionOfPage(302, index)).toEqual({ hizb: 31, quarter: 0 });
    expect(hizbPositionOfPage(304, index)).toEqual({ hizb: 31, quarter: 1 });
    expect(hizbPositionOfPage(TOTAL_PAGES, index)).toEqual({ hizb: 60, quarter: 3 });
  });

  it("stays in step with the hizb the mushaf index gives each page's first line", () => {
    for (let page = 1; page <= TOTAL_PAGES; page++) {
      const atTop = index.pageInfo[page - 1][2];
      const { hizb } = hizbPositionOfPage(page, index);
      // The same hizb, or the next one when it begins lower on that page
      expect([atTop, atTop + 1], `page ${page}`).toContain(hizb);
    }
  });

  it("writes the fractions like the mushaf apps", () => {
    expect(QUARTER_FRACTIONS).toEqual(["", "1/4", "1/2", "3/4"]);
  });
});
