import { TOTAL_PAGES } from "@/lib/quranData";

/*
 * The open mushaf on a wide screen: two pages side by side, like the printed book. The print lays odd pages on the
 * right and even pages on the left, so the spreads are 1|2, 3|4 … 603|604 and a spread is named by its right page.
 * It is a right-to-left book: going forward, the left page is lifted at its outer edge and turned over the spine to
 * the right; its back is the next spread's right page.
 */

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** The right (odd) page of the spread a page is on. */
export const spreadOf = (page: number): number => {
  const p = clamp(Math.round(page), 1, TOTAL_PAGES);
  return p % 2 === 1 ? p : p - 1;
};

/** The spread's left page, or null on a last spread that has only a right page. */
export const leftPageOf = (spread: number): number | null => (spread + 1 <= TOTAL_PAGES ? spread + 1 : null);

export const FIRST_SPREAD = 1;
export const LAST_SPREAD = spreadOf(TOTAL_PAGES);

export const isFirstSpread = (spread: number): boolean => spread <= FIRST_SPREAD;
export const isLastSpread = (spread: number): boolean => spread >= LAST_SPREAD;

/** Both pages of a spread that exist. */
export const pagesOfSpread = (spread: number): number[] => {
  const left = leftPageOf(spread);
  return left === null ? [spread] : [spread, left];
};

/**
 * The pages kept drawn around a spread, so a turn to either neighbour can start at once: the previous spread, this
 * one and the next one (the far side of a turn is drawn before the turn starts).
 */
export const pagesAround = (spread: number): number[] =>
  [spread - 2, spread, spread + 2]
    .filter((s) => s >= FIRST_SPREAD && s <= LAST_SPREAD)
    .flatMap(pagesOfSpread);

/** Which page each part of the book shows while a turn from one spread to another runs. */
export interface TurnPages {
  /** The turning sheet's front: the page that is lifted */
  front: number | null;
  /** Its back: the page that lands on the other side */
  back: number | null;
  /** What lies under the sheet on the side it leaves, then on the side it lands on */
  right: number | null;
  left: number | null;
}

export const turnPages = (from: number, to: number): TurnPages =>
  to > from
    ? // Forward: the left page turns to the right. Under it, the new spread's left page; the right one stays until covered.
      { front: leftPageOf(from), back: to, right: from, left: leftPageOf(to) }
    : // Backward: the right page turns to the left. Under it, the earlier spread's right page.
      { front: from, back: leftPageOf(to), right: to, left: leftPageOf(from) };

/* ------------------------------------------------------------------ */
/* The turning sheet's shape                                            */
/* ------------------------------------------------------------------ */

/** The sheet is drawn as this many upright strips, each turned a little further than the one nearer the spine. */
export const LEAF_STRIPS = 14;
/** How far the outer edge leads (first half) or trails (second half) the part at the spine, in degrees */
const CURL_DEGREES = 42;

/**
 * The angle of each strip (spine first, outer edge last) when the turn is `progress` done: 0 = lying on its own side,
 * 180 = lying on the other side. In the first half the outer edge rises first, so the paper curls up from its edge;
 * past the middle the part at the spine falls first and the edge trails, as a real page does.
 */
export const leafAngles = (progress: number, strips = LEAF_STRIPS): number[] => {
  const t = clamp(progress, 0, 1);
  const base = 180 * t;
  const curl = CURL_DEGREES * Math.sin(2 * Math.PI * t) * (t < 0.5 ? 1 : 0.8);
  return Array.from({ length: strips }, (_, i) => {
    const s = strips === 1 ? 1 : i / (strips - 1);
    return clamp(base + curl * s ** 1.3, 0, 180);
  });
};

const radians = (degrees: number) => (degrees * Math.PI) / 180;

/**
 * Where the sheet's outer edge is, seen from the front, as a share of the page width from the spine: 1 = the outer
 * edge of the side it leaves, 0 = straight up, -1 = the outer edge of the side it lands on.
 */
export const leafEdge = (angles: number[]): number =>
  angles.reduce((sum, angle) => sum + Math.cos(radians(angle)), 0) / angles.length;

/** The progress at which the sheet's outer edge is at `edge` (see leafEdge) — so a dragged edge follows the finger. */
export const progressForEdge = (edge: number, strips = LEAF_STRIPS): number => {
  const goal = clamp(edge, -1, 1);
  let low = 0;
  let high = 1;
  for (let i = 0; i < 18; i++) {
    const mid = (low + high) / 2;
    if (leafEdge(leafAngles(mid, strips)) > goal) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
};

/**
 * Light on a strip turned `angle` degrees away from the reader (0 = facing them, 90 = edge on): how dark it is drawn
 * (0–1) and a soft sheen where the curl catches the light.
 */
export const stripLight = (angle: number): { shade: number; gloss: number } => {
  const a = clamp(angle, 0, 90);
  return {
    shade: 0.5 * (1 - Math.cos(radians(a))),
    gloss: 0.16 * Math.exp(-(((a - 40) / 16) ** 2)),
  };
};

/** Ease used for a whole turn: lifts gently, falls, settles. */
export const easeTurn = (u: number): number => 0.5 - 0.5 * Math.cos(Math.PI * clamp(u, 0, 1));
/** Ease used to finish (or undo) a turn the reader let go of. */
export const easeRelease = (u: number): number => 1 - (1 - clamp(u, 0, 1)) ** 3;
