import { describe, expect, it } from "vitest";
import mushafIndexJson from "../../../data/mushaf/mushaf_index.json";
import chaptersJson from "../../../data/mushaf/chapters.json";
import {
  buildQueue,
  pageBounds,
  pageOfAyah,
  rangeOfPages,
  type ReciterIndex,
} from "@/mushaf/audio/audioQueue";
import type { MushafIndex } from "@/mushaf/types";
import type { Chapter } from "@/lib/quranData";

const mushaf = mushafIndexJson as unknown as MushafIndex;
const chapters = chaptersJson as unknown as (Chapter & { bismillah_pre: boolean })[];

/** A reciter index shaped like the real one: every ayah (and basmala) one second long. */
const fakeReciter = (): ReciterIndex => {
  const pages: ReciterIndex["pages"] = {};
  for (const c of chapters) {
    mushaf.ayahPages[String(c.id)].forEach((page, i) => {
      const entry = (pages[String(page)] ??= { ms: 0, bytes: 0, ayat: [] });
      if (i === 0 && c.bismillah_pre) {
        entry.ayat.push([c.id, 0, entry.ms]);
        entry.ms += 1000;
      }
      entry.ayat.push([c.id, i + 1, entry.ms]);
      entry.ms += 1000;
    });
  }
  return { v: 1, rate: 22050, kbps: 64, pages };
};
const reciter = fakeReciter();
const keys = (items: { surah: number; ayah: number }[]) => items.map((x) => `${x.surah}:${x.ayah}`);

describe("audio play list", () => {
  it("puts the basmala before ayah 1 and keeps the ayat in reading order", () => {
    const items = buildQueue(reciter, { from: { surah: 2, ayah: 1 }, to: { surah: 2, ayah: 5 } });
    expect(keys(items)).toEqual(["2:0", "2:1", "2:2", "2:3", "2:4", "2:5"]);
    expect(items.every((x) => x.page === 2)).toBe(true);
    // Each item ends where the next one starts: one page plays straight through.
    items.slice(0, -1).forEach((x, i) => expect(x.endMs).toBe(items[i + 1].startMs));
  });

  it("has no basmala item for al-Fatiha and at-Tawba, nor when the range starts after ayah 1", () => {
    expect(keys(buildQueue(reciter, { from: { surah: 1, ayah: 1 }, to: { surah: 1, ayah: 2 } }))).toEqual(["1:1", "1:2"]);
    expect(keys(buildQueue(reciter, { from: { surah: 9, ayah: 1 }, to: { surah: 9, ayah: 1 } }))).toEqual(["9:1"]);
    expect(keys(buildQueue(reciter, { from: { surah: 2, ayah: 2 }, to: { surah: 2, ayah: 2 } }))).toEqual(["2:2"]);
  });

  it("crosses pages and surahs", () => {
    const items = buildQueue(reciter, { from: { surah: 113, ayah: 4 }, to: { surah: 114, ayah: 2 } });
    expect(keys(items)).toEqual(["113:4", "113:5", "114:0", "114:1", "114:2"]);
    expect(items[0].page).toBe(604);
    const pageSpan = buildQueue(reciter, rangeOfPages(mushaf, 2, 3)!);
    expect(new Set(pageSpan.map((x) => x.page))).toEqual(new Set([2, 3]));
  });

  it("gives nothing for a range that runs backwards or does not exist", () => {
    expect(buildQueue(reciter, { from: { surah: 2, ayah: 5 }, to: { surah: 2, ayah: 1 } })).toEqual([]);
    expect(buildQueue(reciter, { from: { surah: 2, ayah: 999 }, to: { surah: 2, ayah: 1000 } })).toEqual([]);
  });

  it("takes each ayah from the recording's own page file when the mushaf on screen is another print", () => {
    // Another print moves 5:77 from page 121 to page 120 (like 1405H → 1421H); the files stay cut the old way.
    const filePage = mushaf.ayahPages["5"][76];
    const otherPrint: MushafIndex = {
      ...mushaf,
      ayahPages: { ...mushaf.ayahPages, "5": mushaf.ayahPages["5"].map((p, i) => (i === 76 ? p - 1 : p)) },
    };
    const items = buildQueue(reciter, { from: { surah: 5, ayah: 76 }, to: { surah: 5, ayah: 78 } });
    expect(keys(items)).toEqual(["5:76", "5:77", "5:78"]);
    expect(items.find((x) => x.ayah === 77)?.page).toBe(filePage);
    // The mushaf still turns to where the ayah is printed in the print being read.
    expect(pageOfAyah(otherPrint, { surah: 5, ayah: 77 })).toBe(filePage - 1);
    expect(pageOfAyah(mushaf, { surah: 2, ayah: 0 })).toBe(2); // the basmala goes with ayah 1
  });
});

describe("ranges of pages", () => {
  it("knows the first and last ayah of every page", () => {
    const bounds = pageBounds(mushaf);
    expect(bounds.size).toBe(604);
    expect(bounds.get(1)).toEqual({ from: { surah: 1, ayah: 1 }, to: { surah: 1, ayah: 7 } });
    expect(bounds.get(604)?.to).toEqual({ surah: 114, ayah: 6 });
  });

  it("spans pages in either order", () => {
    expect(rangeOfPages(mushaf, 1, 1)).toEqual({ from: { surah: 1, ayah: 1 }, to: { surah: 1, ayah: 7 } });
    expect(rangeOfPages(mushaf, 604, 582)?.to).toEqual({ surah: 114, ayah: 6 });
  });
});
