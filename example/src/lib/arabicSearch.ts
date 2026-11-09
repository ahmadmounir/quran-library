/**
 * Search that forgives how Arabic is typed: with or without harakat, with or without hamza, any alef, ى or ي, ة or ه,
 * Persian-keyboard letters, ligature glyphs. The text searched and the query go through the same normalizeArabic, so
 * «الإنسان», «الانسان» and «الأنسان» all find the same thing, as do «ملائكة» / «ملايكة» and «السماء» / «السما».
 * A word typed as the Uthmani print joins it («يأيها») also finds the plain spelling («يا ايها»).
 * Latin text (English surah names) is matched without case, accents, hyphens or apostrophes.
 */

/** Harakat, Quranic annotation marks, the dagger alef and tatweel: never part of what someone types. */
const MARKS = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g;

export const normalizeArabic = (text: string): string =>
  text
    // Presentation forms (ﻻ, ﺍ …) from some keyboards become the plain letters
    .normalize("NFKC")
    .replace(MARKS, "")
    // Every alef: with hamza above / below, madda, wasla
    .replace(/[أإآٱٲٳ]/g, "ا")
    // Hamza on a carrier becomes the carrier, a hamza on its own disappears
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ء/g, "")
    .replace(/[ىی]/g, "ي")
    .replace(/ک/g, "ك")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .trim();

/** Without spaces, a doubled alef as one: «يا ايها» and «يأيها» meet as «يايها». */
const compactArabic = (normalized: string): string => normalized.replace(/ /g, "").replace(/ا+/g, "ا");

/** Latin: lower case, no accents, letters and digits only ("Al-Fātiĥah" → "alfatihah"). */
const normalizeLatin = (text: string): string =>
  text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

/** A text made ready to be searched many times (the 6,236 ayat are prepared once). */
export interface SearchableText {
  normalized: string;
  compact: string;
}

export const toSearchable = (text: string): SearchableText => {
  const arabic = normalizeArabic(text);
  const latin = normalizeLatin(text);
  const normalized = latin ? `${arabic} ${latin}` : arabic;
  return { normalized, compact: compactArabic(arabic) + latin };
};

/** What was typed, word by word. */
export type PreparedQuery = { normalized: string; compact: string }[];

export const prepareQuery = (query: string): PreparedQuery =>
  query
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      const arabic = normalizeArabic(word);
      const normalized = arabic || normalizeLatin(word);
      return { normalized, compact: arabic ? compactArabic(arabic) : normalized };
    })
    .filter((word) => word.normalized.length > 0);

/** Every word typed is found (in any order), as written or as the print joins it. */
export const matchesPrepared = (text: SearchableText, query: PreparedQuery): boolean =>
  query.length > 0 &&
  query.every((word) => text.normalized.includes(word.normalized) || text.compact.includes(word.compact));

/** Whether a text matches what was typed (every word typed must be found, in any order). */
export const matchesSearch = (text: string, query: string): boolean =>
  matchesPrepared(toSearchable(text), prepareQuery(query));

/** A surah as the searches need it. */
export interface SurahNames {
  id: number;
  name_arabic: string;
  name_simple: string;
}

/** «سورة الإنسان», "surah insan": the word "surah" says nothing about which one. */
const SURAH_WORD = /^\s*(سوره|سورة|surah|sura|sure|suresi)\s+/i;

/**
 * Whether a surah matches what was typed: its Arabic or English name (normalized, any part of it) or its number.
 * A number alone matches that surah exactly ("2" is Al-Baqarah, not every surah with a 2 in its number).
 */
export function surahMatches(surah: SurahNames, query: string): boolean {
  const cleaned = query.replace(SURAH_WORD, "").trim();
  if (!cleaned) return false;
  if (/^\d+$/.test(cleaned)) return surah.id === Number(cleaned);
  return matchesSearch(`${surah.name_arabic} ${surah.name_simple}`, cleaned);
}
