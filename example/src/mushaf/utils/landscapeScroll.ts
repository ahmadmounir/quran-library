import type { MushafIndex } from "../types";
import { quarterStart, quarterStartPages } from "./hizbQuarters";

/**
 * The mushaf on a phone turned sideways (MushafLandscapeView): every page drawn at the screen's full width, one under
 * the other, read by scrolling. Every page takes the same height (CSS, from the width), so where a page starts is
 * plain arithmetic and only the pages near the screen are drawn. The pure parts live here (unit-tested).
 */

/**
 * The page that fills most of the screen: with pages of `itemHeight` stacked from 0, the one whose part between
 * `scrollTop` and `scrollTop + viewportHeight` is the tallest (the earlier page on a tie). The very bottom of the list
 * is always the last page.
 */
export const pageMostInView = (
  scrollTop: number,
  viewportHeight: number,
  itemHeight: number,
  totalPages: number,
): number => {
  if (!(itemHeight > 0) || totalPages < 1) return 1;
  const top = Math.max(0, scrollTop);
  const bottom = top + Math.max(0, viewportHeight);
  if (bottom >= totalPages * itemHeight - 1) return totalPages;

  const first = Math.min(totalPages, Math.floor(top / itemHeight) + 1);
  const last = Math.min(totalPages, Math.max(first, Math.ceil(bottom / itemHeight)));
  let best = first;
  let bestShown = -1;
  for (let page = first; page <= last; page++) {
    const shown = Math.min(bottom, page * itemHeight) - Math.max(top, (page - 1) * itemHeight);
    // Half a pixel of slack, so rounding never makes the later page win a tie
    if (shown > bestShown + 0.5) {
      best = page;
      bestShown = shown;
    }
  }
  return best;
};

/** The pages drawn: `radius` on each side of the current one, inside the mushaf. */
export const pagesNear = (current: number, radius: number, totalPages: number): number[] => {
  const from = Math.max(1, current - radius);
  const to = Math.min(totalPages, current + radius);
  return Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i);
};

export interface ScrollBox {
  scrollTop: number;
  viewportHeight: number;
  /** The highest scrollTop the list allows */
  maxScrollTop: number;
  /** Covered at the top / bottom (the header, the player bar): what is under them is not "in view" */
  insetTop: number;
  insetBottom: number;
}

/**
 * Where to scroll so a stretch of text (`top` … `bottom`, in the list's own coordinates: an ayah, from its first line
 * to its last) can be read: `null` when it is in view already; otherwise its first line goes to the top of the free
 * part of the screen, `margin` below it (the reader then sees what follows). A stretch taller than the screen counts
 * as in view only when it starts right at the top.
 */
export const revealScrollTop = (
  stretch: { top: number; bottom: number },
  box: ScrollBox,
  margin = 0,
): number | null => {
  const zoneTop = box.scrollTop + box.insetTop;
  const zoneBottom = box.scrollTop + box.viewportHeight - box.insetBottom;
  const zoneHeight = Math.max(0, zoneBottom - zoneTop);
  const shownBottom = Math.min(stretch.bottom, stretch.top + zoneHeight);
  if (stretch.top >= zoneTop - 1 && shownBottom <= zoneBottom + 1) return null;
  const target = stretch.top - box.insetTop - margin;
  return Math.round(Math.min(Math.max(0, target), Math.max(0, box.maxScrollTop)));
};

export interface JuzStart {
  juz: number;
  page: number;
  surah: number;
  ayah: number;
}

const juzCache = new WeakMap<MushafIndex, JuzStart[]>();

/** Where each of the 30 juz begins: a juz is two hizbs, eight quarters (some begin in the middle of a page). */
export const juzStarts = (index: MushafIndex): JuzStart[] => {
  const cached = juzCache.get(index);
  if (cached) return cached;
  const pages = quarterStartPages(index);
  const starts = Array.from({ length: 30 }, (_, i) => ({ juz: i + 1, page: pages[i * 8], ...quarterStart(i * 8) }));
  juzCache.set(index, starts);
  return starts;
};
