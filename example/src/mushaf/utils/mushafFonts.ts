import { FILES_BASE } from "@/config";
import { TOTAL_PAGES } from "@/lib/quranData";

/**
 * The mushaf is drawn with the King Fahd Complex page fonts of the 1421H Madinah print (QCF V2), as on Quran.com and
 * Tarteel: one font per page, and every word of `data/mushaf/pages` carries its glyph code (`g`) in its page's font.
 * The fonts are `data/fonts/pages/pN.woff2` and `data/fonts/surah-header.woff2` (never modify them: the Complex's
 * terms), served from FILES_BASE (src/config.ts).
 */
const FONTS_BASE = `${FILES_BASE}/fonts`;

/** Where this device keeps the page fonts: public/sw.js and the offline download use the same cache. */
export const FONTS_CACHE = "quran-libary-fonts-v1";

/**
 * A font kept on this device, read straight from its cache: no request at all, online or not, even when the service
 * worker does not control the page (the first visit, a hard reload, a worker update). Once the mushaf is on a device
 * its fonts never cost the files Worker anything again; only the reciters' audio does.
 */
async function keptFont(url: string): Promise<ArrayBuffer | null> {
  try {
    if (typeof caches === "undefined") return null;
    const kept = await caches.match(url, { cacheName: FONTS_CACHE, ignoreVary: true });
    return kept ? await kept.arrayBuffer() : null;
  } catch {
    return null;
  }
}

/** CSS family of one page's font */
export const pageFontFamily = (page: number): string => `qcf-v2-p${page}`;

export const SURAH_HEADER_FAMILY = "qcf-surah-header";

/**
 * Loaded page fonts, oldest first. A page font is ~160 KB on the wire and several times that once decoded, so only
 * the most recent ones stay registered.
 */
const MAX_PAGE_FONTS = 24;
const fonts = new Map<string, Promise<string>>();
const faces = new Map<string, FontFace>();

/**
 * Fonts wait here and load nearest-to-the-reader first, at most two at a time. The views keep a page or two more
 * mounted on each side; their fonts wait until the reader is next to them, so opening the mushaf downloads the
 * current page's font and its neighbours' only.
 */
interface QueuedFont {
  family: string;
  /** The pages waiting for this font (page 1's font and the surah names serve many) */
  pages: number[];
  start: () => void;
}
const queue: QueuedFont[] = [];
const FONT_CONCURRENCY = 2;
/** How far from the reader fonts load at once: 1 for one page on a phone, 3 for the open book (both spreads around it) */
let focusRadius = 1;
let running = 0;
let focusPage = 1;

const distance = (item: QueuedFont) =>
  Math.min(...item.pages.map((page) => Math.abs(page - focusPage)));

const pump = () => {
  queue.sort((a, b) => distance(a) - distance(b));
  while (
    running < FONT_CONCURRENCY &&
    queue.length > 0 &&
    distance(queue[0]) <= focusRadius
  ) {
    const next = queue.shift()!;
    running++;
    next.start();
  }
};

/** The page the reader is on: fonts closest to it load first, far ones wait. */
export const setFontFocus = (page: number, radius = 1): void => {
  focusPage = page;
  focusRadius = radius;
  pump();
};

const evictOldFonts = () => {
  while (fonts.size > MAX_PAGE_FONTS) {
    const oldest = fonts.keys().next().value;
    if (oldest === undefined) break;
    fonts.delete(oldest);
    const waiting = queue.findIndex((item) => item.family === oldest);
    if (waiting >= 0) queue.splice(waiting, 1);
    const face = faces.get(oldest);
    if (face) {
      document.fonts.delete(face);
      faces.delete(oldest);
    }
  }
};

const loadFont = (family: string, url: string, order: number): Promise<string> => {
  const cached = fonts.get(family);
  if (cached) {
    // Refresh its place: a font in use is never the oldest
    fonts.delete(family);
    fonts.set(family, cached);
    // Still waiting in the queue: this page may be nearer to the reader
    const waiting = queue.find((item) => item.family === family);
    if (waiting && !waiting.pages.includes(order)) {
      waiting.pages.push(order);
      pump();
    }
    return cached;
  }

  const promise = new Promise<string>((resolve, reject) => {
    queue.push({
      family,
      pages: [order],
      start: () => {
        keptFont(url)
          .then((kept) => new FontFace(family, kept ?? `url(${url}) format("woff2")`, { display: "block" }).load())
          .then((face) => {
            document.fonts.add(face);
            faces.set(family, face);
            resolve(family);
          })
          .catch((err) => {
            fonts.delete(family);
            reject(err);
          })
          .finally(() => {
            running--;
            pump();
          });
      },
    });
    pump();
  });
  fonts.set(family, promise);
  evictOldFonts();
  return promise;
};

/** True when a font is loaded and registered, so text can be drawn with it right away. */
export const isFontReady = (family: string): boolean => faces.has(family);

/**
 * Loads (once) the font one page's glyphs are drawn with; resolves to its family. `forPage` is the page that needs
 * it (page 1's font draws every page's basmala), for the queue order.
 */
export const loadPageFont = (page: number, forPage = page): Promise<string> =>
  loadFont(pageFontFamily(page), pageFontUrl(page), forPage);

/** The surah headers: the print's ornamental frame with «سورة …» inside, one glyph per surah (one font for all 114). */
export const loadSurahHeaderFont = (page: number): Promise<string> =>
  loadFont(SURAH_HEADER_FAMILY, SURAH_HEADER_FONT_URL, page);

/** The font files' addresses (also what the offline download keeps: mushaf/offline) */
export function pageFontUrl(page: number): string {
  return `${FONTS_BASE}/pages/p${page}.woff2`;
}
export const SURAH_HEADER_FONT_URL = `${FONTS_BASE}/surah-header.woff2`;

/** Code point of each surah's header glyph (QUL "Surah header font", surah 1 first). */
const SURAH_HEADER_CODES = [
  0xfc45, 0xfc46, 0xfc47, 0xfc4a, 0xfc4b, 0xfc4e, 0xfc4f, 0xfc51, 0xfc52, 0xfc53, 0xfc55, 0xfc56, 0xfc58, 0xfc5a,
  0xfc5b, 0xfc5c, 0xfc5d, 0xfc5e, 0xfc61, 0xfc62, 0xfc64, 0xfb51, 0xfb52, 0xfb54, 0xfb55, 0xfb57, 0xfb58, 0xfb5a,
  0xfb5b, 0xfb5d, 0xfb5e, 0xfb60, 0xfb61, 0xfb63, 0xfb64, 0xfb66, 0xfb67, 0xfb69, 0xfb6a, 0xfb6c, 0xfb6d, 0xfb6f,
  0xfb70, 0xfb72, 0xfb73, 0xfb75, 0xfb76, 0xfb78, 0xfb79, 0xfb7b, 0xfb7c, 0xfb7e, 0xfb7f, 0xfb81, 0xfb82, 0xfb84,
  0xfb85, 0xfb87, 0xfb88, 0xfb8a, 0xfb8b, 0xfb8d, 0xfb8e, 0xfb90, 0xfb91, 0xfb93, 0xfb94, 0xfb96, 0xfb97, 0xfb99,
  0xfb9a, 0xfb9c, 0xfb9d, 0xfb9f, 0xfba0, 0xfba2, 0xfba3, 0xfba5, 0xfba6, 0xfba8, 0xfba9, 0xfbab, 0xfbac, 0xfbae,
  0xfbaf, 0xfbb1, 0xfbb2, 0xfbb4, 0xfbb5, 0xfbb7, 0xfbb8, 0xfbba, 0xfbbb, 0xfbbd, 0xfbbe, 0xfbc0, 0xfbc1, 0xfbd3,
  0xfbd4, 0xfbd6, 0xfbd7, 0xfbd9, 0xfbda, 0xfbdc, 0xfbdd, 0xfbdf, 0xfbe0, 0xfbe2, 0xfbe3, 0xfbe5, 0xfbe6, 0xfbe8,
  0xfbe9, 0xfbeb,
];

/** The header glyph of a surah (1-114) in the surah-header font. */
export const surahHeaderGlyph = (surah: number): string =>
  String.fromCodePoint(SURAH_HEADER_CODES[surah - 1] ?? SURAH_HEADER_CODES[0]);

/** Fire-and-forget warm-up of the fonts of the pages next to the active one. */
export const prefetchFontsAround = (page: number, radius = 1): void => {
  setFontFocus(page, radius);
  for (let offset = -radius; offset <= radius; offset++) {
    const target = page + offset;
    if (target >= 1 && target <= TOTAL_PAGES) {
      loadPageFont(target).catch(() => {
        // The visible page retries on its own
      });
    }
  }
};
