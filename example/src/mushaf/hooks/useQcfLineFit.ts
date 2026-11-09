import { useLayoutEffect, type RefObject } from "react";

/**
 * QCF lines are drawn edge to edge (space-between), the way the print fills them; the short
 * lines the print centers come marked in the page file (`centered`). The rare line whose glyphs
 * are wider than the page at the current size is drawn a little smaller: after a page's glyphs
 * are drawn, each line is measured once. The ratio does not depend on the size, so it stays
 * right when the page is resized. The size is set on the line element directly — React never
 * sets a style on it.
 */
export function useQcfLineFit(
  bodyRef: RefObject<HTMLElement | null>,
  dataKey: unknown,
): void {
  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    for (const line of body.querySelectorAll<HTMLElement>(".mushaf-line")) {
      line.style.removeProperty("font-size");
      const available = line.getBoundingClientRect().width;
      if (!available) continue;
      // Centered lines keep a gap between words; full lines have none (space-between)
      const gap = parseFloat(getComputedStyle(line).columnGap) || 0;
      let natural = gap * Math.max(line.children.length - 1, 0);
      for (const word of line.children) natural += word.getBoundingClientRect().width;
      const ratio = natural / available;
      if (ratio > 1) {
        // "important" to win over the stylesheet's own important size
        line.style.setProperty(
          "font-size",
          `calc(${getComputedStyle(line).fontSize} * ${(0.99 / ratio).toFixed(3)})`,
          "important",
        );
      }
    }
  }, [bodyRef, dataKey]);
}
