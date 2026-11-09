import { describe, expect, it } from "vitest";
import {
  LAST_SPREAD,
  isFirstSpread,
  isLastSpread,
  leafAngles,
  leafEdge,
  leftPageOf,
  pagesAround,
  progressForEdge,
  spreadOf,
  stripLight,
  turnPages,
} from "@/mushaf/utils/bookSpreads";
import { TOTAL_PAGES } from "@/lib/quranData";

describe("spreads of the printed mushaf", () => {
  it("puts odd pages on the right and even pages on the left", () => {
    expect(spreadOf(1)).toBe(1);
    expect(spreadOf(2)).toBe(1);
    expect(spreadOf(3)).toBe(3);
    expect(spreadOf(4)).toBe(3);
    expect(spreadOf(603)).toBe(603);
    expect(spreadOf(604)).toBe(603);
    expect(leftPageOf(1)).toBe(2);
    expect(leftPageOf(603)).toBe(604);
  });

  it("snaps any page, also out of range, to its spread", () => {
    expect(spreadOf(0)).toBe(1);
    expect(spreadOf(-5)).toBe(1);
    expect(spreadOf(9999)).toBe(603);
    expect(spreadOf(250.4)).toBe(249);
  });

  it("knows the first and the last spread", () => {
    expect(isFirstSpread(1)).toBe(true);
    expect(isFirstSpread(3)).toBe(false);
    expect(LAST_SPREAD).toBe(TOTAL_PAGES - 1);
    expect(isLastSpread(603)).toBe(true);
    expect(isLastSpread(601)).toBe(false);
  });

  it("keeps the neighbouring spreads drawn, never a page outside the book", () => {
    expect(pagesAround(1)).toEqual([1, 2, 3, 4]);
    expect(pagesAround(5)).toEqual([3, 4, 5, 6, 7, 8]);
    expect(pagesAround(603)).toEqual([601, 602, 603, 604]);
  });

  it("turns forward like a right-to-left book: the left page goes over to the right, its back is the next right page", () => {
    // From 1|2 to 3|4: page 2 is lifted, page 3 is on its back, page 4 is revealed, page 1 is covered at the end
    expect(turnPages(1, 3)).toEqual({ front: 2, back: 3, right: 1, left: 4 });
    // A jump far ahead turns one sheet that shows the destination
    expect(turnPages(1, 101)).toEqual({ front: 2, back: 101, right: 1, left: 102 });
  });

  it("turns backward as the mirror: the right page goes over to the left", () => {
    expect(turnPages(5, 3)).toEqual({ front: 5, back: 4, right: 3, left: 6 });
    expect(turnPages(603, 1)).toEqual({ front: 603, back: 2, right: 1, left: 604 });
  });
});

describe("the turning sheet", () => {
  it("lies flat at the start and at the end", () => {
    expect(leafAngles(0).every((a) => a === 0)).toBe(true);
    expect(leafAngles(1).every((a) => a === 180)).toBe(true);
  });

  it("stays between the two sides at every moment", () => {
    for (let p = 0; p <= 1; p += 0.01) {
      for (const angle of leafAngles(p)) {
        expect(angle).toBeGreaterThanOrEqual(0);
        expect(angle).toBeLessThanOrEqual(180);
      }
    }
  });

  it("lifts at its outer edge first, and lets the edge trail on the way down", () => {
    const early = leafAngles(0.2);
    expect(early[early.length - 1]).toBeGreaterThan(early[0]);
    const late = leafAngles(0.8);
    expect(late[late.length - 1]).toBeLessThan(late[0]);
  });

  it("moves its edge steadily from one side to the other, so a drag can follow the finger", () => {
    let previous = Infinity;
    for (let p = 0; p <= 1.0001; p += 0.02) {
      const edge = leafEdge(leafAngles(p));
      expect(edge).toBeLessThanOrEqual(previous + 1e-9);
      previous = edge;
    }
    for (const edge of [0.9, 0.5, 0, -0.5, -0.9]) {
      expect(leafEdge(leafAngles(progressForEdge(edge)))).toBeCloseTo(edge, 3);
    }
  });

  it("is lit fully when it faces the reader and darker as it turns away", () => {
    expect(stripLight(0).shade).toBe(0);
    expect(stripLight(60).shade).toBeGreaterThan(stripLight(30).shade);
    expect(stripLight(90).shade).toBeCloseTo(0.5);
  });
});
