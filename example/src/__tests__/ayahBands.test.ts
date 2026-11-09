import { describe, expect, it } from "vitest";
import { ayahBands } from "@/mushaf/audio/ayahBands";

describe("the band of the ayah being read", () => {
  it("covers a line from its first word to its last, gaps between words included", () => {
    const [band] = ayahBands([
      { index: 3, top: 100, bottom: 140, words: [{ left: 200, right: 260 }, { left: 20, right: 70 }, { left: 120, right: 180 }] },
    ]);
    expect(band).toEqual({ index: 3, start: 20, end: 260, up: 0, down: 0 });
  });

  it("joins two lines that follow each other halfway into the space between them", () => {
    const bands = ayahBands([
      { index: 5, top: 210, bottom: 250, words: [{ left: 0, right: 150 }] },
      { index: 4, top: 150, bottom: 190, words: [{ left: 0, right: 300 }] },
    ]);
    expect(bands.map((b) => b.index)).toEqual([4, 5]);
    expect(bands[0]).toMatchObject({ up: 0, down: 10 });
    expect(bands[1]).toMatchObject({ up: 10, down: 0 });
  });

  it("does not reach towards a line that is not the next one (a surah header in between)", () => {
    const bands = ayahBands([
      { index: 1, top: 0, bottom: 40, words: [{ left: 0, right: 100 }] },
      { index: 3, top: 120, bottom: 160, words: [{ left: 0, right: 100 }] },
    ]);
    expect(bands.every((b) => b.up === 0 && b.down === 0)).toBe(true);
  });

  it("ignores a line without words", () => {
    expect(ayahBands([{ index: 0, top: 0, bottom: 10, words: [] }])).toEqual([]);
  });
});
