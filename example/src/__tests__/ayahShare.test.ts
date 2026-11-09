import { describe, expect, it } from "vitest";
import type { MushafPageData, MushafWord } from "@/mushaf/types";
import {
  arabicDigits,
  ayahImageName,
  ayahText,
  ayahWords,
  breakLines,
  continuesAfter,
  continuesFromBefore,
  lineWidth,
  quotedAyah,
} from "@/mushaf/utils/ayahShare";

let nextId = 1;
const word = (surah: number, ayah: number, pos: number, text: string, end: 0 | 1 = 0): MushafWord => ({
  id: nextId++,
  surah,
  ayah,
  pos,
  text,
  end,
  g: String.fromCharCode(0xfb51 + pos),
});

const page = (number: number, ...lines: MushafWord[][]): MushafPageData => ({
  page: number,
  script: "qcf-v2",
  lines: lines.map((words, i) => ({ line: i + 1, type: "words" as const, words })),
});

// 2:5 ends page 2's last line; 2:6 runs from page 2 onto page 3
const p2 = page(
  2,
  [word(2, 5, 1, "أُو۟لَٰٓئِكَ"), word(2, 5, 2, "عَلَىٰ"), word(2, 5, 3, "٥", 1)],
  [word(2, 6, 1, "إِنَّ"), word(2, 6, 2, "ٱلَّذِينَ")],
);
const p3 = page(3, [word(2, 6, 3, "كَفَرُوا۟"), word(2, 6, 4, "٦", 1), word(2, 7, 1, "خَتَمَ")]);

describe("which pages an ayah is printed on", () => {
  it("sees an ayah that goes on onto the next page", () => {
    expect(continuesAfter(p2, { surah: 2, ayah: 6 })).toBe(true);
    expect(continuesAfter(p2, { surah: 2, ayah: 5 })).toBe(false);
    expect(continuesAfter(p3, { surah: 2, ayah: 7 })).toBe(true);
  });

  it("sees an ayah that began on the page before", () => {
    expect(continuesFromBefore(p3, { surah: 2, ayah: 6 })).toBe(true);
    expect(continuesFromBefore(p2, { surah: 2, ayah: 5 })).toBe(false);
  });

  it("collects the ayah's words from both pages, in reading order, number included", () => {
    const words = ayahWords(
      [
        { page: 3, data: p3 },
        { page: 2, data: p2 },
      ],
      { surah: 2, ayah: 6 },
    );
    expect(words.map((w) => [w.page, w.word.pos])).toEqual([
      [2, 1],
      [2, 2],
      [3, 3],
      [3, 4],
    ]);
  });
});

describe("line breaking for the picture", () => {
  it("fills a line, then starts the next", () => {
    expect(breakLines([40, 40, 40, 40], 100, 10)).toEqual([[0, 1], [2, 3]]);
    expect(breakLines([30, 30, 30], 110, 10)).toEqual([[0, 1, 2]]);
  });

  it("gives a word wider than the line a line of its own", () => {
    expect(breakLines([50, 300, 50], 100, 10)).toEqual([[0], [1], [2]]);
  });

  it("measures a line with its gaps", () => {
    expect(lineWidth([40, 40, 40], 10)).toBe(140);
    expect(lineWidth([], 10)).toBe(0);
  });
});

describe("the text that goes with the picture", () => {
  const words = ayahWords([{ page: 2, data: p2 }, { page: 3, data: p3 }], { surah: 2, ayah: 6 }).map((w) => w.word);

  it("joins the words without the number", () => {
    expect(ayahText(words)).toBe("إِنَّ ٱلَّذِينَ كَفَرُوا۟");
  });

  it("quotes the ayah the usual way", () => {
    expect(quotedAyah(words, "البقرة", { surah: 2, ayah: 6 })).toBe("﴿إِنَّ ٱلَّذِينَ كَفَرُوا۟﴾ [البقرة: ٦]");
  });

  it("writes ayah numbers in Arabic-Indic digits and names the file", () => {
    expect(arabicDigits(255)).toBe("٢٥٥");
    expect(ayahImageName({ surah: 2, ayah: 255 })).toBe("quran-2-255.png");
  });
});
