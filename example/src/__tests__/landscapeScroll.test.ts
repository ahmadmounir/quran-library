import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  juzStarts,
  pageMostInView,
  pagesNear,
  revealScrollTop,
  type ScrollBox,
} from "@/mushaf/utils/landscapeScroll";
import type { MushafIndex } from "@/mushaf/types";

const index = JSON.parse(
  readFileSync(new URL("../../../data/mushaf/mushaf_index.json", import.meta.url), "utf8"),
) as MushafIndex;

describe("the page most in view", () => {
  const H = 1800; // one page with its page break
  const V = 390; // a phone on its side

  it("is the page the screen is inside", () => {
    expect(pageMostInView(0, V, H, 604)).toBe(1);
    expect(pageMostInView(H * 5 + 200, V, H, 604)).toBe(6);
  });

  it("goes to the next page once that page fills more of the screen", () => {
    // 100 px of page 6 left, 290 px of page 7
    expect(pageMostInView(H * 6 - 100, V, H, 604)).toBe(7);
    // 300 px of page 6 left, 90 px of page 7
    expect(pageMostInView(H * 6 - 300, V, H, 604)).toBe(6);
  });

  it("keeps the earlier page on a tie", () => {
    expect(pageMostInView(H * 6 - V / 2, V, H, 604)).toBe(6);
  });

  it("is the last page at the very bottom, and stays inside the mushaf", () => {
    expect(pageMostInView(H * 604 - V, V, H, 604)).toBe(604);
    expect(pageMostInView(H * 700, V, H, 604)).toBe(604);
    expect(pageMostInView(-500, V, H, 604)).toBe(1);
  });

  it("works with a screen taller than a page", () => {
    // Pages of 300 px in a 700 px screen from 250: 50 px of page 1, 300 of page 2, 300 of page 3, 50 of page 4
    expect(pageMostInView(250, 700, 300, 604)).toBe(2);
  });

  it("answers page 1 before the pages are measured", () => {
    expect(pageMostInView(5000, V, 0, 604)).toBe(1);
  });
});

describe("the pages drawn", () => {
  it("are the current page and its neighbours, inside the mushaf", () => {
    expect(pagesNear(10, 2, 604)).toEqual([8, 9, 10, 11, 12]);
    expect(pagesNear(1, 2, 604)).toEqual([1, 2, 3]);
    expect(pagesNear(604, 2, 604)).toEqual([602, 603, 604]);
  });
});

describe("scrolling an ayah into view", () => {
  const box: ScrollBox = { scrollTop: 1000, viewportHeight: 390, maxScrollTop: 100000, insetTop: 44, insetBottom: 80 };
  // The free part of the screen is 1044 … 1310

  it("leaves an ayah alone when it can be read already", () => {
    expect(revealScrollTop({ top: 1100, bottom: 1250 }, box, 8)).toBeNull();
  });

  it("brings an ayah below the screen, or hidden under the player bar, to the top", () => {
    expect(revealScrollTop({ top: 1500, bottom: 1600 }, box, 8)).toBe(1500 - 44 - 8);
    expect(revealScrollTop({ top: 1200, bottom: 1340 }, box, 8)).toBe(1200 - 44 - 8);
  });

  it("brings an ayah above the screen, or under the header, down to the top", () => {
    expect(revealScrollTop({ top: 400, bottom: 520 }, box, 8)).toBe(400 - 44 - 8);
    expect(revealScrollTop({ top: 1020, bottom: 1120 }, box, 8)).toBe(1020 - 44 - 8);
  });

  it("puts a long ayah's first line at the top, and then leaves it there", () => {
    const long = { top: 1250, bottom: 2400 };
    const target = revealScrollTop(long, box, 0);
    expect(target).toBe(1250 - 44);
    expect(revealScrollTop(long, { ...box, scrollTop: target! }, 0)).toBeNull();
  });

  it("never scrolls outside the list", () => {
    expect(revealScrollTop({ top: 10, bottom: 50 }, { ...box, scrollTop: 600 }, 8)).toBe(0);
    expect(revealScrollTop({ top: 5000, bottom: 5100 }, { ...box, maxScrollTop: 4000 }, 8)).toBe(4000);
  });
});

describe("where each juz begins", () => {
  it("has the 30 juz of the 1421H print", () => {
    const starts = juzStarts(index);
    expect(starts).toHaveLength(30);
    expect(starts[0]).toEqual({ juz: 1, page: 1, surah: 1, ayah: 1 });
    expect(starts[1]).toEqual({ juz: 2, page: 22, surah: 2, ayah: 142 });
    // Juz 4 begins in the middle of page 62 (3:93)
    expect(starts[3]).toEqual({ juz: 4, page: 62, surah: 3, ayah: 93 });
    expect(starts[15]).toEqual({ juz: 16, page: 302, surah: 18, ayah: 75 });
    expect(starts[29]).toEqual({ juz: 30, page: 582, surah: 78, ayah: 1 });
  });
});
