import { useEffect, useState } from "react";
import type { MushafPageData } from "../types";
import { clampPage, pageDataUrl } from "../utils/mushafData";
import {
  isFontReady,
  loadPageFont,
  loadSurahHeaderFont,
  pageFontFamily,
  prefetchFontsAround,
  SURAH_HEADER_FAMILY,
} from "../utils/mushafFonts";
import { TOTAL_PAGES } from "@/lib/quranData";

// Module-level cache shared by all slides. Insertion order doubles as LRU order.
const cache = new Map<number, MushafPageData>();
const inflight = new Map<number, Promise<MushafPageData>>();
const MAX_CACHED_PAGES = 40;

/** Async page fetch (shares the module cache with the Mushaf viewer's own loads). */
export const fetchMushafPage = (page: number): Promise<MushafPageData> => {
  const cached = cache.get(page);
  if (cached) return Promise.resolve(cached);

  const pending = inflight.get(page);
  if (pending) return pending;

  const promise = fetch(pageDataUrl(page))
    .then((res) => {
      if (!res.ok) throw new Error(`Failed to load page ${page} (${res.status})`);
      return res.json() as Promise<MushafPageData>;
    })
    .then((data) => {
      // Refresh LRU position and trim the oldest entries
      cache.delete(page);
      cache.set(page, data);
      while (cache.size > MAX_CACHED_PAGES) {
        const oldest = cache.keys().next().value;
        if (oldest === undefined) break;
        cache.delete(oldest);
      }
      return data;
    })
    .finally(() => {
      inflight.delete(page);
    });

  inflight.set(page, promise);
  return promise;
};

/** Synchronous cache lookup — used by the evaluator to expand ayah-wide marks. */
export const getCachedPage = (page: number): MushafPageData | undefined =>
  cache.get(page);

/**
 * Fire-and-forget warm-up of the pages around the active one. The page fonts are much larger
 * than the page files, so only the next and previous page's fonts are warmed, after the active
 * page's own (see the queue in mushafFonts). The open book on a wide screen passes a font radius of 3: both
 * spreads around the one in view.
 */
export const prefetchAround = (page: number, radius = 2, fontRadius = 1): void => {
  prefetchFontsAround(page, fontRadius);
  for (let offset = -radius; offset <= radius; offset++) {
    const target = page + offset;
    if (target >= 1 && target <= TOTAL_PAGES && !cache.has(target)) {
      fetchMushafPage(target).catch(() => {
        // Prefetch failures are silent — the visible slide retries on its own
      });
    }
  }
};

/**
 * Everything a page needs before its glyphs can be drawn: its own font, page 1's font for
 * a basmala line (drawn with Al-Fatihah's glyphs) and the surah-header font for a header.
 * Without them the glyph codes would show as unrelated Arabic letters.
 */
const loadPageFonts = (data: MushafPageData): Promise<unknown> => {
  const loads: Promise<string>[] = [loadPageFont(data.page)];
  for (const line of data.lines) {
    if (line.type === "basmala" && line.fontPage) {
      loads.push(loadPageFont(line.fontPage, data.page));
    }
    if (line.type === "header") loads.push(loadSurahHeaderFont(data.page));
  }
  return Promise.all(loads);
};

/** A cached page that can be drawn at once: its fonts are in. */
const readyPage = (page: number): MushafPageData | null => {
  const data = cache.get(page);
  if (!data) return null;
  const ready = data.lines.every((line) =>
    line.type === "basmala"
      ? !line.fontPage || isFontReady(pageFontFamily(line.fontPage))
      : line.type === "header"
        ? isFontReady(SURAH_HEADER_FAMILY)
        : true,
  );
  return ready && isFontReady(pageFontFamily(page)) ? data : null;
};

interface PageState {
  data: MushafPageData | null;
  failed: boolean;
}

/** Loads one mushaf page (cached across slides) and its fonts. */
export const usePageData = (page: number): PageState & { retry: () => void } => {
  const safePage = clampPage(page);
  const [state, setState] = useState<PageState>(() => ({
    data: readyPage(safePage),
    failed: false,
  }));
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const ready = readyPage(safePage);
    if (ready) {
      setState({ data: ready, failed: false });
      return;
    }

    setState({ data: null, failed: false });
    fetchMushafPage(safePage)
      .then((data) => loadPageFonts(data).then(() => data))
      .then((data) => {
        if (!cancelled) setState({ data, failed: false });
      })
      .catch(() => {
        if (!cancelled) setState({ data: null, failed: true });
      });

    return () => {
      cancelled = true;
    };
  }, [safePage, attempt]);

  // A page that could not load without internet loads by itself when the network is back
  useEffect(() => {
    if (!state.failed) return;
    const retry = () => setAttempt((a) => a + 1);
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [state.failed]);

  return { ...state, retry: () => setAttempt((a) => a + 1) };
};
