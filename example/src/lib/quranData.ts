import { FILES_BASE } from "@/config";

export const TOTAL_JUZ = 30;
export const TOTAL_SURAHS = 114;
export const TOTAL_PAGES = 604;

export const CHAPTERS_URL = `${FILES_BASE}/mushaf/chapters.json`;

/** Shape of data/mushaf/chapters.json entries (only the fields we use) */
export interface Chapter {
  id: number;
  name_simple: string;
  name_arabic: string;
  verses_count: number;
  pages: [number, number];
  /** Where it was revealed (chapters.json has it for all 114) */
  revelation_place?: "makkah" | "madinah";
}

let chaptersCache: Chapter[] | null = null;
let chaptersPromise: Promise<Chapter[]> | null = null;

/** Fetches and module-caches the chapters list (114 entries, ~42 KB). */
export const getChapters = (): Promise<Chapter[]> => {
  if (chaptersCache) return Promise.resolve(chaptersCache);
  if (!chaptersPromise) {
    chaptersPromise = fetch(CHAPTERS_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load chapters (${res.status})`);
        return res.json() as Promise<Chapter[]>;
      })
      .then((data) => {
        chaptersCache = data;
        return data;
      })
      .catch((err) => {
        chaptersPromise = null;
        throw err;
      });
  }
  return chaptersPromise;
};

/** A surah's name in the reader's language: Arabic in Arabic, the transliteration otherwise */
export const getChapterName = (chapters: Chapter[], id: number, language: string): string => {
  const chapter = chapters.find((c) => c.id === id);
  if (!chapter) return String(id);
  return language === "ar" ? chapter.name_arabic : chapter.name_simple;
};
