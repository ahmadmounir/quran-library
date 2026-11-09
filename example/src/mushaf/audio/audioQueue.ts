import type { MushafIndex } from "../types";

/**
 * A reciter's `index.json` (built with the audio): one MP3 per mushaf page and, for each page, where every ayah
 * starts inside that page's file. Ayah 0 is the basmala read before ayah 1 of a surah (not before 1 and 9).
 */
export interface ReciterIndex {
  v: number;
  rate: number;
  kbps: number;
  pages: Record<string, { ms: number; bytes: number; ayat: [surah: number, ayah: number, startMs: number][] }>;
}

export interface AyahRef {
  surah: number;
  ayah: number;
}

/** Inclusive, in reading order (`from` never after `to`). */
export interface AudioRange {
  from: AyahRef;
  to: AyahRef;
}

/** One ayah (or basmala, ayah 0) to play: which page file, and where in it. */
export interface AudioItem {
  /** The recording's page file — the page of the print the audio was cut by, not necessarily the one on screen */
  page: number;
  surah: number;
  ayah: number;
  startMs: number;
  endMs: number;
}

const compare = (a: AyahRef, b: AyahRef) => a.surah - b.surah || a.ayah - b.ayah;

/** The mushaf page an ayah is printed on (the basmala, ayah 0, goes with ayah 1) in the print being shown. */
export const pageOfAyah = (mushaf: MushafIndex, ref: AyahRef): number | null => {
  const pages = mushaf.ayahPages[String(ref.surah)];
  return pages?.[Math.max(ref.ayah, 1) - 1] ?? null;
};

const fileOfAyah = new WeakMap<ReciterIndex, Map<string, number>>();

/**
 * The page FILE holding an ayah. The recordings are cut by the pages of the print they were built for, which need not
 * be the print on screen (the 1405H and 1421H prints put 56 ayat on a neighbouring page), so the reciter's own index
 * decides — never the viewer's.
 */
const audioFileOf = (index: ReciterIndex, ref: AyahRef): number | null => {
  let files = fileOfAyah.get(index);
  if (!files) {
    files = new Map();
    for (const [page, info] of Object.entries(index.pages)) {
      for (const [surah, ayah] of info.ayat) files.set(`${surah}:${ayah}`, Number(page));
    }
    fileOfAyah.set(index, files);
  }
  return files.get(`${ref.surah}:${ref.ayah}`) ?? null;
};

/** The ayat of a range as a play list, file by file, with the basmala before ayah 1 where the reciter reads one. */
export const buildQueue = (index: ReciterIndex, range: AudioRange): AudioItem[] => {
  const firstPage = audioFileOf(index, range.from);
  const lastPage = audioFileOf(index, range.to);
  if (firstPage === null || lastPage === null || compare(range.from, range.to) > 0) return [];

  const items: AudioItem[] = [];
  for (let page = firstPage; page <= lastPage; page++) {
    const info = index.pages[String(page)];
    if (!info) continue;
    info.ayat.forEach(([surah, ayah, startMs], i) => {
      // The basmala belongs to ayah 1 of its surah: it plays when that ayah does.
      const ref = { surah, ayah: Math.max(ayah, 1) };
      if (compare(ref, range.from) < 0 || compare(ref, range.to) > 0) return;
      const endMs = info.ayat[i + 1]?.[2] ?? info.ms;
      items.push({ page, surah, ayah, startMs, endMs });
    });
  }
  return items;
};

let boundsCache: { mushaf: MushafIndex; bounds: Map<number, AudioRange> } | null = null;

/** First and last ayah printed on each page. */
export const pageBounds = (mushaf: MushafIndex): Map<number, AudioRange> => {
  if (boundsCache?.mushaf === mushaf) return boundsCache.bounds;
  const bounds = new Map<number, AudioRange>();
  for (let surah = 1; surah <= 114; surah++) {
    (mushaf.ayahPages[String(surah)] ?? []).forEach((page, i) => {
      const ref = { surah, ayah: i + 1 };
      const current = bounds.get(page);
      if (!current) bounds.set(page, { from: ref, to: ref });
      else current.to = ref;
    });
  }
  boundsCache = { mushaf, bounds };
  return bounds;
};

/** The ayat from the first page's first ayah to the last page's last ayah. */
export const rangeOfPages = (mushaf: MushafIndex, firstPage: number, lastPage: number): AudioRange | null => {
  const bounds = pageBounds(mushaf);
  const first = bounds.get(Math.min(firstPage, lastPage));
  const last = bounds.get(Math.max(firstPage, lastPage));
  return first && last ? { from: first.from, to: last.to } : null;
};
