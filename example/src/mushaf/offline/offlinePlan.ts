/**
 * The mushaf on the device — what the download keeps and where (no browser access here, so it can be unit-tested).
 * The service worker (`public/sw.js`) keeps every page that is read in the same caches; it never keeps audio.
 */
import { CHAPTERS_URL, TOTAL_PAGES } from "@/lib/quranData";
import { MUSHAF_INDEX_URL, SEARCH_TEXT_URL, pageDataUrl } from "../utils/mushafData";
import { FONTS_CACHE, SURAH_HEADER_FONT_URL, pageFontUrl } from "../utils/mushafFonts";

export { FONTS_CACHE };

// The service worker's caches: public/sw.js names them the same way (a unit test checks it).
export const APP_CACHE = "quran-libary-app";
export const DATA_CACHE = "quran-libary-data-v1";

// Average sizes as kept on the device (the 605 fonts are 93 MB, the 604 page files 8.7 MB)
const FONT_BYTES = 154_000;
const PAGE_BYTES = 14_500;
const SEARCH_BYTES = 1_200_000;
const SMALL_BYTES = 40_000;

export interface OfflineFile {
  url: string;
  cache: string;
  /** Expected size, for "about … MB" */
  bytes: number;
  /** The mushaf page it belongs to (its data or its font) */
  page?: number;
}

/** The two files of one mushaf page: its words and its font. */
export const mushafPageFiles = (page: number): OfflineFile[] => [
  { url: pageDataUrl(page), cache: DATA_CACHE, bytes: PAGE_BYTES, page },
  { url: pageFontUrl(page), cache: FONTS_CACHE, bytes: FONT_BYTES, page },
];

/** Everything the mushaf needs offline, page by page (so a stopped download leaves whole pages, from the start). */
export function offlinePlan(): OfflineFile[] {
  const files: OfflineFile[] = [
    { url: MUSHAF_INDEX_URL, cache: DATA_CACHE, bytes: SMALL_BYTES },
    { url: CHAPTERS_URL, cache: DATA_CACHE, bytes: SMALL_BYTES },
    { url: SURAH_HEADER_FONT_URL, cache: FONTS_CACHE, bytes: SMALL_BYTES },
  ];
  for (let page = 1; page <= TOTAL_PAGES; page++) files.push(...mushafPageFiles(page));
  files.push({ url: SEARCH_TEXT_URL, cache: DATA_CACHE, bytes: SEARCH_BYTES });
  return files;
}

export const totalBytes = (files: OfflineFile[]): number => files.reduce((sum, file) => sum + file.bytes, 0);

/** Pages all of whose files are on the device. */
export function countStoredPages(files: OfflineFile[], isStored: (file: OfflineFile) => boolean): number {
  const parts = new Map<number, { all: number; stored: number }>();
  for (const file of files) {
    if (file.page === undefined) continue;
    const page = parts.get(file.page) ?? { all: 0, stored: 0 };
    page.all++;
    if (isStored(file)) page.stored++;
    parts.set(file.page, page);
  }
  let pages = 0;
  for (const page of parts.values()) if (page.stored === page.all) pages++;
  return pages;
}

/** Megabytes for people: "105". */
export const megabytes = (bytes: number): number => Math.max(1, Math.round(bytes / 1_000_000));
