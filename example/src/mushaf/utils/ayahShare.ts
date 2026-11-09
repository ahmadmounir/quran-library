/**
 * The pure parts of "listen to / share this ayah" (long press in the mushaf): which words make the ayah, where its
 * lines break in the shared picture, and its text for the share message. Drawing the picture is `ayahImage.ts`.
 */
import type { MushafPageData, MushafWord } from "../types";

export interface AyahRef {
  surah: number;
  ayah: number;
}

/** A word of the ayah with the page it is printed on (its glyph is drawn with that page's font). */
export interface PlacedWord {
  word: MushafWord;
  page: number;
}

/** Every word of a page, in reading order (basmala and surah-header lines hold none). */
export const pageWords = (data: MushafPageData): MushafWord[] =>
  data.lines.flatMap((line) => (line.type === "words" ? line.words : []));

const isOf = (word: MushafWord | undefined, ref: AyahRef): boolean =>
  !!word && word.surah === ref.surah && word.ayah === ref.ayah;

/** The ayah started on the page before: the page opens in the middle of it. */
export const continuesFromBefore = (data: MushafPageData, ref: AyahRef): boolean => {
  const first = pageWords(data)[0];
  return isOf(first, ref) && first.pos > 1;
};

/** The ayah goes on onto the next page: the page ends inside it, before its number. */
export const continuesAfter = (data: MushafPageData, ref: AyahRef): boolean => {
  const words = pageWords(data);
  const last = words[words.length - 1];
  return isOf(last, ref) && last.end !== 1;
};

/** The ayah's words in reading order, number included, from the pages given (in page order). */
export const ayahWords = (pages: { page: number; data: MushafPageData }[], ref: AyahRef): PlacedWord[] =>
  [...pages]
    .sort((a, b) => a.page - b.page)
    .flatMap(({ page, data }) => pageWords(data).filter((word) => isOf(word, ref)).map((word) => ({ word, page })));

/**
 * Greedy line breaking for the picture: as many words as fit on a line, the next word starts the next line. A word
 * wider than the line gets a line of its own. Returns the words' indexes, line by line.
 */
export function breakLines(widths: number[], maxWidth: number, gap: number): number[][] {
  const lines: number[][] = [];
  let line: number[] = [];
  let width = 0;
  widths.forEach((w, i) => {
    const needed = line.length === 0 ? w : width + gap + w;
    if (line.length > 0 && needed > maxWidth) {
      lines.push(line);
      line = [i];
      width = w;
    } else {
      line.push(i);
      width = needed;
    }
  });
  if (line.length > 0) lines.push(line);
  return lines;
}

/** The width of one line of words with the gaps between them. */
export const lineWidth = (widths: number[], gap: number): number =>
  widths.length === 0 ? 0 : widths.reduce((sum, w) => sum + w, 0) + gap * (widths.length - 1);

/** Arabic-Indic digits, as the print writes ayah numbers. */
export const arabicDigits = (n: number): string => String(n).replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);

/** The ayah in Unicode (Uthmani), without its number entry: the text that goes with the shared picture. */
export const ayahText = (words: MushafWord[]): string =>
  words
    .filter((word) => word.end !== 1)
    .map((word) => word.text)
    .join(" ")
    .trim();

/** «﴿…﴾ [البقرة: ٢٥٥]» — how an ayah is quoted. */
export const quotedAyah = (words: MushafWord[], surahNameArabic: string, ref: AyahRef): string =>
  `﴿${ayahText(words)}﴾ [${surahNameArabic}: ${arabicDigits(ref.ayah)}]`;

export const ayahImageName = (ref: AyahRef): string => `quran-${ref.surah}-${ref.ayah}.png`;
