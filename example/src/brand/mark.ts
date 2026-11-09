/**
 * The identity «صوت المصحف» ("the voice of the mushaf"): nine bars of a reciting voice that draw an open mushaf; the
 * gold bar in the middle is its spine. Always two colours: the bars and the gold spine.
 *
 * The numbers are copied from the master geometry of the identity (generated from its source files, never edited by
 * hand): to change the mark, change the masters and copy these lines again.
 */

/** The mark's box: every bar is 24 wide with round ends, 40 apart */
export const MARK_W = 344;
export const MARK_H = 214;
/** [x, y, height] of the nine bars, left to right */
export const BARS: ReadonlyArray<readonly [number, number, number]> = [
  [0, 18, 154],
  [40, 0, 184],
  [80, 10, 186],
  [120, 36, 170],
  [160, 74, 140],
  [200, 36, 170],
  [240, 10, 186],
  [280, 0, 184],
  [320, 18, 154],
];
/** The gold bar: the mushaf's spine between its two pages */
export const SPINE_INDEX = 4;

export const BRAND_COLORS = {
  ink: "#0D3429",
  paper: "#F3ECDC",
  green: "#0F4A3A",
  gold: "#D4B061",
  goldDeep: "#B69445",
  white: "#FFFFFF",
} as const;

export type BrandTone = "onDark" | "onLight" | "onGold";
/** The two colours of the mark on each background */
export const BRAND_TONES: Record<BrandTone, { bars: string; spine: string }> = {
  onDark: { bars: "#F3ECDC", spine: "#D4B061" },
  onLight: { bars: "#0F4A3A", spine: "#B69445" },
  onGold: { bars: "#0D3429", spine: "#F3ECDC" },
};
