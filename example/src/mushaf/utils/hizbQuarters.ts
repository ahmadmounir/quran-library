import type { MushafIndex } from "../types";

/**
 * Where each of the 240 quarters of a hizb (أرباع الأحزاب) begins: surah, ayah — four per hizb, one row per hizb.
 *
 * The 1421H Madinah print marks a quarter with ۞ before its first word; the page files carry that sign on 199 of them
 * (`text` of the word). The other 41 begin a surah, where the print leaves the sign out. The list is Tanzil's
 * (tanzil.net quran-data.js, CC BY 3.0) with one change, checked against the print's ۞: the second quarter of hizb 27
 * begins at 15:49 in the Madinah print, not 15:50. `__tests__/hizbQuarters.test.ts` checks every ۞ of the page files
 * against this list.
 */
// prettier-ignore
const QUARTER_STARTS: readonly number[] = [
  1, 1,  2, 26,  2, 44,  2, 60, // 1
  2, 75,  2, 92,  2, 106,  2, 124, // 2
  2, 142,  2, 158,  2, 177,  2, 189, // 3
  2, 203,  2, 219,  2, 233,  2, 243, // 4
  2, 253,  2, 263,  2, 272,  2, 283, // 5
  3, 15,  3, 33,  3, 52,  3, 75, // 6
  3, 93,  3, 113,  3, 133,  3, 153, // 7
  3, 171,  3, 186,  4, 1,  4, 12, // 8
  4, 24,  4, 36,  4, 58,  4, 74, // 9
  4, 88,  4, 100,  4, 114,  4, 135, // 10
  4, 148,  4, 163,  5, 1,  5, 12, // 11
  5, 27,  5, 41,  5, 51,  5, 67, // 12
  5, 82,  5, 97,  5, 109,  6, 13, // 13
  6, 36,  6, 59,  6, 74,  6, 95, // 14
  6, 111,  6, 127,  6, 141,  6, 151, // 15
  7, 1,  7, 31,  7, 47,  7, 65, // 16
  7, 88,  7, 117,  7, 142,  7, 156, // 17
  7, 171,  7, 189,  8, 1,  8, 22, // 18
  8, 41,  8, 61,  9, 1,  9, 19, // 19
  9, 34,  9, 46,  9, 60,  9, 75, // 20
  9, 93,  9, 111,  9, 122,  10, 11, // 21
  10, 26,  10, 53,  10, 71,  10, 90, // 22
  11, 6,  11, 24,  11, 41,  11, 61, // 23
  11, 84,  11, 108,  12, 7,  12, 30, // 24
  12, 53,  12, 77,  12, 101,  13, 5, // 25
  13, 19,  13, 35,  14, 10,  14, 28, // 26
  15, 1,  15, 49,  16, 1,  16, 30, // 27
  16, 51,  16, 75,  16, 90,  16, 111, // 28
  17, 1,  17, 23,  17, 50,  17, 70, // 29
  17, 99,  18, 17,  18, 32,  18, 51, // 30
  18, 75,  18, 99,  19, 22,  19, 59, // 31
  20, 1,  20, 55,  20, 83,  20, 111, // 32
  21, 1,  21, 29,  21, 51,  21, 83, // 33
  22, 1,  22, 19,  22, 38,  22, 60, // 34
  23, 1,  23, 36,  23, 75,  24, 1, // 35
  24, 21,  24, 35,  24, 53,  25, 1, // 36
  25, 21,  25, 53,  26, 1,  26, 52, // 37
  26, 111,  26, 181,  27, 1,  27, 27, // 38
  27, 56,  27, 82,  28, 12,  28, 29, // 39
  28, 51,  28, 76,  29, 1,  29, 26, // 40
  29, 46,  30, 1,  30, 31,  30, 54, // 41
  31, 22,  32, 11,  33, 1,  33, 18, // 42
  33, 31,  33, 51,  33, 60,  34, 10, // 43
  34, 24,  34, 46,  35, 15,  35, 41, // 44
  36, 28,  36, 60,  37, 22,  37, 83, // 45
  37, 145,  38, 21,  38, 52,  39, 8, // 46
  39, 32,  39, 53,  40, 1,  40, 21, // 47
  40, 41,  40, 66,  41, 9,  41, 25, // 48
  41, 47,  42, 13,  42, 27,  42, 51, // 49
  43, 24,  43, 57,  44, 17,  45, 12, // 50
  46, 1,  46, 21,  47, 10,  47, 33, // 51
  48, 18,  49, 1,  49, 14,  50, 27, // 52
  51, 31,  52, 24,  53, 26,  54, 9, // 53
  55, 1,  56, 1,  56, 75,  57, 16, // 54
  58, 1,  58, 14,  59, 11,  60, 7, // 55
  62, 1,  63, 4,  65, 1,  66, 1, // 56
  67, 1,  68, 1,  69, 1,  70, 19, // 57
  72, 1,  73, 20,  75, 1,  76, 19, // 58
  78, 1,  80, 1,  82, 1,  84, 1, // 59
  87, 1,  90, 1,  94, 1,  100, 9, // 60
];

export const QUARTER_COUNT = QUARTER_STARTS.length / 2;

/** The first ayah of quarter `n` (0 … 239). */
export const quarterStart = (n: number): { surah: number; ayah: number } => ({
  surah: QUARTER_STARTS[n * 2],
  ayah: QUARTER_STARTS[n * 2 + 1],
});

/** Where the reader is in the hizb: `quarter` 0 = the hizb's start, 1 = ¼ … 3 = ¾ of it read. */
export interface HizbPosition {
  /** 1 … 60 */
  hizb: number;
  quarter: 0 | 1 | 2 | 3;
}

const startPagesCache = new WeakMap<MushafIndex, number[]>();

/** The page each quarter begins on, in the print `index` describes. */
export const quarterStartPages = (index: MushafIndex): number[] => {
  const cached = startPagesCache.get(index);
  if (cached) return cached;
  const pages = Array.from({ length: QUARTER_COUNT }, (_, n) => {
    const { surah, ayah } = quarterStart(n);
    return index.ayahPages[String(surah)]?.[ayah - 1] ?? 1;
  });
  startPagesCache.set(index, pages);
  return pages;
};

/**
 * The quarter a page belongs to, as the mushaf apps show it under a page: the last quarter that has begun by the end
 * of that page (a quarter that starts in the middle of page 304 already counts for 304). No page of the 1421H print
 * holds two quarter starts.
 */
export const hizbPositionOfPage = (page: number, index: MushafIndex): HizbPosition => {
  const starts = quarterStartPages(index);
  // Last quarter whose start page is on or before `page` (binary search: the starts never go back)
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (starts[mid] <= page) low = mid;
    else high = mid - 1;
  }
  return { hizb: Math.floor(low / 4) + 1, quarter: (low % 4) as HizbPosition["quarter"] };
};

/** "¼" "½" "¾" written the way the mushaf apps do (1/4, 1/2, 3/4); nothing at a hizb's start. */
export const QUARTER_FRACTIONS = ["", "1/4", "1/2", "3/4"] as const;
