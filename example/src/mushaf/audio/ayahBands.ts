/**
 * The ayah being read is marked as ONE flat band, not word by word: a line of the mushaf spreads its words edge to
 * edge (flex, space-between), so a background per word leaves holes between them. Instead each line that holds the
 * ayah gets one band from its first word to its last, and two lines of the same ayah that follow each other meet
 * halfway in the space between them, so the ayah reads as a single shape (like a text selection).
 */
import { useEffect } from "react";

/** One line of a page that holds words of the ayah, measured in the line's own (unscaled) pixels. */
export interface AyahLineBox {
  /** The line's position among the page's lines (0, 1, 2 …). */
  index: number;
  /** The line's top and bottom, in the page's coordinates. */
  top: number;
  bottom: number;
  /** The ayah's words on this line: their left and right edge, from the line's left edge. */
  words: { left: number; right: number }[];
}

export interface AyahBand {
  index: number;
  /** From the line's left edge. */
  start: number;
  end: number;
  /** How far the band reaches above / below the line to meet the band of the line before / after. */
  up: number;
  down: number;
}

/** The bands of one page: one per line, joined across the space between two lines that follow each other. */
export function ayahBands(lines: AyahLineBox[]): AyahBand[] {
  const sorted = lines.filter((line) => line.words.length > 0).sort((a, b) => a.index - b.index);
  return sorted.map((line, i) => {
    const before = sorted[i - 1];
    const after = sorted[i + 1];
    return {
      index: line.index,
      start: Math.min(...line.words.map((w) => w.left)),
      end: Math.max(...line.words.map((w) => w.right)),
      up: before && before.index === line.index - 1 ? Math.max(0, (line.top - before.bottom) / 2) : 0,
      down: after && after.index === line.index + 1 ? Math.max(0, (after.top - line.bottom) / 2) : 0,
    };
  });
}

/**
 * Two bands can be on a line at once, each with its own class and values: the ayah being read (`::before`) and the
 * ayah the reader picked with a long press (`::after`, see index.css).
 */
const BAND_KINDS = {
  reading: { className: "mushaf-line-reading", prefix: "--band" },
  selected: { className: "mushaf-line-selected", prefix: "--selected" },
} as const;
export type AyahBandKind = keyof typeof BAND_KINDS;

/**
 * Draws the band of an ayah on every page that shows it (both pages of the open book, the turning sheet's copies
 * included, since the band is the line's own class and style). It follows the pages: new pages, fonts that arrive, a
 * resized window.
 */
export function useAyahBand(surah: number | null, ayah: number | null, kind: AyahBandKind = "reading") {
  useEffect(() => {
    if (!surah || !ayah) return;
    const { className: bandClass, prefix } = BAND_KINDS[kind];
    const VARS = [`${prefix}-start`, `${prefix}-width`, `${prefix}-up`, `${prefix}-down`] as const;

    const marked = new Set<HTMLElement>();
    const watched = new ResizeObserver(() => schedule());
    let frame = 0;

    const clear = () => {
      for (const line of marked) {
        line.classList.remove(bandClass);
        for (const name of VARS) line.style.removeProperty(name);
      }
      marked.clear();
    };

    const apply = () => {
      frame = 0;
      clear();
      watched.disconnect();

      const words = document.querySelectorAll<HTMLElement>(`.mushaf-word[data-location^="${surah}:${ayah}:"]`);
      const byBody = new Map<HTMLElement, Map<HTMLElement, HTMLElement[]>>();
      for (const word of words) {
        const line = word.closest<HTMLElement>(".mushaf-line");
        const body = line?.parentElement;
        if (!line || !body) continue;
        const lines = byBody.get(body) ?? new Map<HTMLElement, HTMLElement[]>();
        byBody.set(body, lines);
        lines.set(line, [...(lines.get(line) ?? []), word]);
        watched.observe(word);
      }

      for (const [body, lines] of byBody) {
        const allLines = [...body.querySelectorAll<HTMLElement>(":scope > .mushaf-line")];
        const boxes: AyahLineBox[] = [];
        const elements = new Map<number, HTMLElement>();
        for (const [line, lineWords] of lines) {
          const rect = line.getBoundingClientRect();
          // The pages can be scaled (the book): measure in the line's own CSS pixels
          const scale = line.offsetWidth > 0 ? rect.width / line.offsetWidth : 1;
          if (!scale) continue;
          const index = allLines.indexOf(line);
          elements.set(index, line);
          boxes.push({
            index,
            top: rect.top / scale,
            bottom: rect.bottom / scale,
            words: lineWords.map((word) => {
              const box = word.getBoundingClientRect();
              return { left: (box.left - rect.left) / scale, right: (box.right - rect.left) / scale };
            }),
          });
        }

        for (const band of ayahBands(boxes)) {
          const line = elements.get(band.index);
          if (!line) continue;
          line.style.setProperty(VARS[0], `${band.start}px`);
          line.style.setProperty(VARS[1], `${band.end - band.start}px`);
          line.style.setProperty(VARS[2], `${band.up}px`);
          line.style.setProperty(VARS[3], `${band.down}px`);
          line.classList.add(bandClass);
          marked.add(line);
        }
      }
    };

    function schedule() {
      if (!frame) frame = requestAnimationFrame(apply);
    }

    // Pages come and go (swipe, book turns, a far jump): measure again when the mushaf's nodes change
    const pages = new MutationObserver(schedule);
    pages.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", schedule);
    schedule();

    return () => {
      if (frame) cancelAnimationFrame(frame);
      pages.disconnect();
      watched.disconnect();
      window.removeEventListener("resize", schedule);
      clear();
    };
  }, [surah, ayah, kind]);
}
