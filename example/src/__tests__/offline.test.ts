import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { APP_CACHE, DATA_CACHE, FONTS_CACHE, countStoredPages, offlinePlan } from "@/mushaf/offline/offlinePlan";
import { networkAllows, parseUpdateEvery, updateDue } from "@/mushaf/offline/offlineRules";

const worker = readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8");
const constant = (name: string) => worker.match(new RegExp(`const ${name} = "([^"]+)"`))?.[1];
const pattern = (name: string) => {
  const source = worker.match(new RegExp(`const ${name} = /(.+)/;`))?.[1];
  return source ? new RegExp(source) : null;
};

describe("the service worker and the download share their caches", () => {
  it("names the same caches", () => {
    expect(constant("APP_CACHE")).toBe(APP_CACHE);
    expect(constant("DATA_CACHE")).toBe(DATA_CACHE);
    expect(constant("FONTS_CACHE")).toBe(FONTS_CACHE);
  });

  it("keeps every file of the whole-mushaf download in the cache the download puts it in", () => {
    const dataFile = pattern("DATA_FILE")!;
    const fontFile = pattern("FONT_FILE")!;
    const plan = offlinePlan();
    // index + chapters + surah frames + 604 × (page + font) + search text
    expect(plan.length).toBe(3 + 604 * 2 + 1);
    for (const file of plan) {
      const path = new URL(file.url, "https://example.org").pathname;
      if (file.cache === DATA_CACHE) expect(dataFile.test(path), path).toBe(true);
      else expect(fontFile.test(path), path).toBe(true);
    }
  });

  it("counts a page as kept only when its words and its font are", () => {
    const plan = offlinePlan();
    const kept = new Set(plan.filter((f) => f.page === 1 || (f.page === 2 && f.cache === DATA_CACHE)).map((f) => f.url));
    expect(countStoredPages(plan, (f) => kept.has(f.url))).toBe(1);
  });
});

describe("the update of a downloaded mushaf", () => {
  const DAY = 24 * 60 * 60 * 1000;
  it("runs only when the reader downloaded it and chose a period that has passed", () => {
    expect(updateDue({ every: "once", wanted: true, checkedAt: null, now: 0 })).toBe(false);
    expect(updateDue({ every: "monthly", wanted: false, checkedAt: null, now: 0 })).toBe(false);
    expect(updateDue({ every: "biweekly", wanted: true, checkedAt: null, now: 0 })).toBe(true);
    expect(updateDue({ every: "biweekly", wanted: true, checkedAt: 0, now: 13 * DAY })).toBe(false);
    expect(updateDue({ every: "biweekly", wanted: true, checkedAt: 0, now: 14 * DAY })).toBe(true);
    expect(parseUpdateEvery("weekly")).toBe("once");
  });

  it("never uses a mobile network the browser can see, nor Data Saver", () => {
    expect(networkAllows({ type: "cellular" }, true)).toBe(false);
    expect(networkAllows({ type: "wifi", saveData: true }, true)).toBe(false);
    expect(networkAllows({ type: "wifi" }, false)).toBe(false);
    expect(networkAllows(undefined, true)).toBe(true);
  });
});
