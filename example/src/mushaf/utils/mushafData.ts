import type { MushafIndex } from "../types";
import { FILES_BASE } from "@/config";
import { TOTAL_PAGES } from "@/lib/quranData";
import {
  matchesPrepared,
  normalizeArabic,
  prepareQuery,
  toSearchable,
  type SearchableText,
} from "@/lib/arabicSearch";

/** The data files' addresses (also what the offline download keeps: mushaf/offline). A changed file is published in a
 * new version folder (v2/ …), never over the old one, so the addresses never need a version number. */
export const pageDataUrl = (page: number): string =>
  `${FILES_BASE}/mushaf/pages/page-${String(page).padStart(3, "0")}.json`;
export const MUSHAF_INDEX_URL = `${FILES_BASE}/mushaf/mushaf_index.json`;
export const SEARCH_TEXT_URL = `${FILES_BASE}/mushaf/search_text.json`;

let indexCache: MushafIndex | null = null;
let indexPromise: Promise<MushafIndex> | null = null;

/** Fetches and module-caches mushaf_index.json (~30 KB). */
export const getMushafIndex = (): Promise<MushafIndex> => {
  if (indexCache) return Promise.resolve(indexCache);
  if (!indexPromise) {
    indexPromise = fetch(MUSHAF_INDEX_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load mushaf index (${res.status})`);
        return res.json() as Promise<MushafIndex>;
      })
      .then((data) => {
        indexCache = data;
        return data;
      })
      .catch((err) => {
        indexPromise = null;
        throw err;
      });
  }
  return indexPromise;
};

export const clampPage = (page: number): number =>
  Math.min(Math.max(Math.round(page) || 1, 1), TOTAL_PAGES);

// ---------------- Search (search_text.json) ----------------

export interface SearchVerse {
  id: number;
  verse_key: string;
  text_plain: string;
}

interface SearchCorpus {
  verses: SearchVerse[];
  /** Each verse made ready for searching (shared/utils/arabicSearch), same index as verses */
  searchable: SearchableText[];
}

let searchCache: SearchCorpus | null = null;
let searchPromise: Promise<SearchCorpus> | null = null;

/** Harakat, hamza, alef, ى / ي, ة / ه insensitive — the one normalization of every search (shared/utils/arabicSearch). */
export { normalizeArabic };

/** Fetches and module-caches search_text.json (~1.1 MB, loaded on first search). */
export const getSearchCorpus = (): Promise<SearchCorpus> => {
  if (searchCache) return Promise.resolve(searchCache);
  if (!searchPromise) {
    searchPromise = fetch(SEARCH_TEXT_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load search text (${res.status})`);
        return res.json() as Promise<SearchVerse[]>;
      })
      .then((verses) => {
        searchCache = {
          verses,
          searchable: verses.map((v) => toSearchable(v.text_plain)),
        };
        return searchCache;
      })
      .catch((err) => {
        searchPromise = null;
        throw err;
      });
  }
  return searchPromise;
};

export interface SearchResult {
  surah: number;
  ayah: number;
  text: string;
}

/**
 * The ayat whose text holds every word typed (any order; with or without harakat and hamza, any alef, ى / ي,
 * ة / ه). Returns the first `limit` in mushaf order and how many there are in all.
 */
export const searchVerses = (
  corpus: SearchCorpus,
  query: string,
  limit = 50,
): { results: SearchResult[]; total: number } => {
  const prepared = prepareQuery(query);
  if (prepared.reduce((length, word) => length + word.normalized.length, 0) < 2) return { results: [], total: 0 };

  const results: SearchResult[] = [];
  let total = 0;
  for (let i = 0; i < corpus.searchable.length; i++) {
    if (matchesPrepared(corpus.searchable[i], prepared)) {
      total++;
      if (results.length < limit) {
        const [surah, ayah] = corpus.verses[i].verse_key.split(":").map(Number);
        results.push({ surah, ayah, text: corpus.verses[i].text_plain });
      }
    }
  }
  return { results, total };
};

/**
 * Resolves the initial page from deep-link query params, priority:
 * explicit page → surah+ayah → surah start → 1.
 */
export const resolveTargetPage = (
  index: MushafIndex,
  params: { page?: string | null; surah?: string | null; ayah?: string | null },
): number => {
  if (params.page) {
    return clampPage(Number(params.page));
  }

  if (params.surah) {
    const pages = index.ayahPages[params.surah];
    if (pages && pages.length > 0) {
      const ayah = params.ayah ? Number(params.ayah) : 1;
      const pageOfAyah = pages[Math.min(Math.max(ayah, 1), pages.length) - 1];
      return clampPage(pageOfAyah);
    }
  }

  return 1;
};
