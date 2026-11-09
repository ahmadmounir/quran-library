import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type Ref,
} from "react";
import { TOTAL_PAGES } from "@/lib/quranData";
import {
  FIRST_SPREAD,
  LAST_SPREAD,
  LEAF_STRIPS,
  easeRelease,
  easeTurn,
  leafAngles,
  leafEdge,
  leftPageOf,
  pagesAround,
  pagesOfSpread,
  progressForEdge,
  spreadOf,
  stripLight,
  turnPages,
} from "../utils/bookSpreads";

export interface MushafBookHandle {
  /** Opens the spread the page is on (a turn when it is another spread) */
  goToPage: (page: number) => void;
  next: () => void;
  prev: () => void;
}

interface MushafBookViewProps {
  ref?: Ref<MushafBookHandle>;
  /** Read once on mount: the book opens at this page's spread */
  initialPage: number;
  /** A spread's right page after a turn, or the page asked for when it is already open */
  onPageChange: (page: number) => void;
  renderPage: (page: number) => ReactNode;
  /** No turning at all */
  disabled?: boolean;
  /** The 3D turn (the reader's setting); false swaps the spread at once, as with reduced motion */
  animated?: boolean;
}

/** One turn from one spread to another; `ready` once every page it shows is drawn */
interface Turn {
  from: number;
  to: number;
  ready: boolean;
}

const TURN_MS = 860;
/** A turn that was waiting behind another one runs a little quicker */
const QUEUED_TURN_MS = 620;
/** How long a turn waits for the far pages' fonts before it runs anyway */
const READY_TIMEOUT_MS = 1500;
/** Pixels a pointer moves sideways before a press becomes a drag */
const DRAG_START_PX = 10;
/** The finger's speed when it lets go is measured over this last stretch of time */
const RELEASE_WINDOW_MS = 90;

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The parts of the turning sheet that change on every frame */
interface LeafStrip {
  segment: HTMLElement;
  /** Front, then back */
  faces: HTMLElement[];
}

interface Leaf {
  strips: LeafStrip[];
  /** +1: turns clockwise seen from above (left page to the right), -1: the right page to the left */
  sign: 1 | -1;
}

const div = (className: string, parent: HTMLElement): HTMLElement => {
  const element = document.createElement("div");
  element.className = className;
  parent.appendChild(element);
  return element;
};

/**
 * Builds the turning sheet inside `host`: LEAF_STRIPS upright strips, each one a child of the strip nearer the spine
 * and hinged on it, so turning every strip a little further than the last bends the paper. Every strip shows its
 * slice of a copy of the front page and, on its back, of the page that lands on the other side. The copies are
 * plain DOM clones of pages already drawn (fonts in, lines fitted): nothing is laid out by React during a turn.
 */
const buildLeaf = (host: HTMLElement, forward: boolean, front: Element | null, back: Element | null): Leaf => {
  const strips: LeafStrip[] = [];
  let parent = host;
  // The left page's inner edge is its right side; the right page's is its left side.
  const sides = forward
    ? { front: "left", back: "right" }
    : { front: "right", back: "left" };

  for (let i = 0; i < LEAF_STRIPS; i++) {
    const segment = div("mushaf-leaf-seg", parent);
    const faces: LeafStrip["faces"] = [];
    for (const [which, source, side] of [
      ["front", front, sides.front],
      ["back", back, sides.back],
    ] as const) {
      const face = div("mushaf-leaf-face", segment);
      face.dataset.face = which;
      const content = div("mushaf-leaf-content", face);
      content.dataset.side = side;
      // A slice of the whole page: the left page is cut from its spine edge (its right side) outwards, the right
      // page from its left side. The face reaches 0.5px past each side of its strip.
      const offset = `calc(${-i} * (100% - 1px) + 0.5px)`;
      if (side === "left") content.style.right = offset;
      else content.style.left = offset;
      if (source) content.appendChild(source.cloneNode(true));
      faces.push(face);
    }
    strips.push({ segment, faces });
    parent = segment;
  }
  return { strips, sign: forward ? 1 : -1 };
};

/** Draws the sheet and the shadows it casts at one moment of the turn (transforms, opacities and brightness only). */
const drawLeaf = (leaf: Leaf, progress: number, reveal: HTMLElement | null, cast: HTMLElement | null) => {
  const angles = leafAngles(progress);
  let previous = 0;
  leaf.strips.forEach((strip, i) => {
    strip.segment.style.transform = `rotateY(${(leaf.sign * (angles[i] - previous)).toFixed(3)}deg)`;
    previous = angles[i];
    // Each strip is lit as one surface (a filter of its own, so neighbours that overlap never add up), darker
    // the further it turns from the reader, with a sheen where the curl catches the light
    strip.faces.forEach((face, f) => {
      const light = stripLight(f === 0 ? angles[i] : 180 - angles[i]);
      face.style.filter = `brightness(${((1 - light.shade) * (1 + light.gloss)).toFixed(3)})`;
    });
  });

  // Where the outer edge is: over the side it leaves (> 0) or the side it lands on (< 0)
  const edge = leafEdge(angles);
  if (reveal) {
    // The page coming into view lies in the sheet's shadow, darkest while the sheet stands over it
    // and a little past its edge
    reveal.style.opacity = edge > 0 ? (0.7 * (1 - edge) ** 0.8).toFixed(3) : "0";
    reveal.style.transform = `scaleX(${Math.min(1, Math.max(edge, 0) + 0.32).toFixed(3)})`;
  }
  if (cast) {
    // The sheet coming down casts a band of shadow on the page it covers, just past its edge
    const over = -edge;
    cast.style.opacity = over > 0 ? (0.8 * (1 - over) ** 0.7).toFixed(3) : "0";
    cast.style.setProperty("--cast-at", `${(Math.max(over, 0) * 100).toFixed(2)}%`);
  }
};

/**
 * The desktop mushaf: the open book, two pages at a time (1|2, 3|4 … 603|604), and a turn that lifts the sheet at
 * its outer edge and lays it over the spine in 3D, curled and shaded, with its back showing. Buttons, the arrow
 * keys and a drag of the page all turn one spread. Phones keep the one-page Swiper.
 */
export function MushafBookView({
  ref,
  initialPage,
  onPageChange,
  renderPage,
  disabled = false,
  animated = true,
}: MushafBookViewProps) {
  const animatedRef = useRef(animated);
  useEffect(() => {
    animatedRef.current = animated;
  }, [animated]);
  const [spread, setSpread] = useState(() => spreadOf(initialPage));
  const [turn, setTurn] = useState<Turn | null>(null);
  const spreadRef = useRef(spread);
  const turnRef = useRef<Turn | null>(null);
  /** The page last reported (either page of the open spread) */
  const focusedRef = useRef(initialPage);
  const queuedRef = useRef<number | null>(null);
  const progressRef = useRef(0);
  const frameRef = useRef<number | null>(null);
  const leafRef = useRef<Leaf | null>(null);
  const turnMsRef = useRef(TURN_MS);
  /** Runs the turn by itself once the sheet is built (false while a finger drives it) */
  const autoRunRef = useRef(false);

  const bookRef = useRef<HTMLDivElement>(null);
  const leafHostRef = useRef<HTMLDivElement>(null);
  const revealRef = useRef<HTMLDivElement>(null);
  const castRef = useRef<HTMLDivElement>(null);
  const slots = useRef(new Map<number, HTMLDivElement>());

  const onPageChangeRef = useRef(onPageChange);
  useEffect(() => {
    onPageChangeRef.current = onPageChange;
  }, [onPageChange]);

  /** A dragged turn: where the press started and how the finger moved */
  const dragRef = useRef<{
    pointerId: number;
    x0: number;
    y0: number;
    active: boolean;
    spine: number;
    width: number;
    startDistance: number;
    dir: 1 | -1;
    samples: { x: number; t: number }[];
  } | null>(null);
  /** When the last drag ended: the click a mouse sends right after it must not mark a word */
  const dragEndedAtRef = useRef(0);

  const setTurnState = (next: Turn | null) => {
    turnRef.current = next;
    setTurn(next);
  };

  const report = (page: number) => {
    focusedRef.current = page;
    onPageChangeRef.current(page);
  };

  const cardOf = (page: number | null): Element | null =>
    page === null ? null : (slots.current.get(page)?.querySelector(".mushaf-page-card") ?? null);

  const isDrawn = (page: number | null) => {
    if (page === null) return true;
    const state = (cardOf(page) as HTMLElement | null)?.dataset.state;
    return state === "ready" || state === "failed";
  };

  const turnIsReady = (from: number, to: number) => {
    const pages = turnPages(from, to);
    return [pages.front, pages.back, pages.left, pages.right].every(isDrawn);
  };

  const cancelFrame = () => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
  };

  const draw = (progress: number) => {
    progressRef.current = progress;
    if (leafRef.current) drawLeaf(leafRef.current, progress, revealRef.current, castRef.current);
  };

  // ------- Finishing a turn -------
  const settle = (done: boolean) => {
    const current = turnRef.current;
    cancelFrame();
    if (!current) return;
    if (done) {
      spreadRef.current = current.to;
      setSpread(current.to);
      report(current.to);
    }
    setTurnState(null);
    progressRef.current = 0;

    const queued = queuedRef.current;
    queuedRef.current = null;
    if (queued !== null && queued !== spreadRef.current) {
      // After the new spread is drawn, so its neighbours are mounted for the next sheet
      requestAnimationFrame(() => startTurn(queued, false, QUEUED_TURN_MS));
    }
  };

  const animateTo = (target: 0 | 1, ms: number, ease: (u: number) => number) => {
    cancelFrame();
    const from = progressRef.current;
    const duration = Math.max(160, ms * Math.abs(target - from));
    const start = performance.now();
    const step = (now: number) => {
      const u = Math.min(1, (now - start) / duration);
      draw(from + (target - from) * ease(u));
      if (u < 1) frameRef.current = requestAnimationFrame(step);
      else settle(target === 1);
    };
    frameRef.current = requestAnimationFrame(step);
  };

  // ------- Starting a turn -------
  const waitUntilDrawn = (from: number, to: number) => {
    const started = performance.now();
    const check = () => {
      const current = turnRef.current;
      if (!current || current.from !== from || current.to !== to || current.ready) return;
      if (turnIsReady(from, to) || performance.now() - started > READY_TIMEOUT_MS) {
        setTurnState({ ...current, ready: true });
      } else {
        frameRef.current = requestAnimationFrame(check);
      }
    };
    frameRef.current = requestAnimationFrame(check);
  };

  /** Turns to the spread `to`. A drag drives the sheet itself; otherwise it runs on its own. */
  function startTurn(to: number, byDrag: boolean, ms = TURN_MS) {
    const from = spreadRef.current;
    const target = Math.min(LAST_SPREAD, Math.max(FIRST_SPREAD, spreadOf(to)));
    if (target === from) return;
    if (prefersReducedMotion() || !animatedRef.current) {
      // No motion: the next spread simply replaces this one
      spreadRef.current = target;
      setSpread(target);
      report(target);
      return;
    }
    turnMsRef.current = ms;
    progressRef.current = 0;
    autoRunRef.current = !byDrag;
    const ready = turnIsReady(from, target);
    setTurnState({ from, to: target, ready });
    if (!ready) waitUntilDrawn(from, target);
  }

  const requestSpread = (to: number) => {
    if (disabled) return;
    const target = Math.min(LAST_SPREAD, Math.max(FIRST_SPREAD, spreadOf(to)));
    if (turnRef.current || dragRef.current?.active) {
      // One turn at a time: the newest wish runs right after the current one
      queuedRef.current = target;
      return;
    }
    startTurn(target, false);
  };

  // Build the sheet as soon as the turn's pages are drawn, before the browser paints the first frame of it
  useLayoutEffect(() => {
    if (!turn?.ready) return;
    const host = leafHostRef.current;
    if (!host) return;
    const forward = turn.to > turn.from;
    const pages = turnPages(turn.from, turn.to);
    leafRef.current = buildLeaf(host, forward, cardOf(pages.front), cardOf(pages.back));
    draw(progressRef.current);
    if (autoRunRef.current) animateTo(1, turnMsRef.current, easeTurn);
    return () => {
      leafRef.current = null;
      host.replaceChildren();
    };
    // Built once per turn; the helpers only read refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn]);

  useEffect(() => () => cancelFrame(), []);

  // ------- Buttons, keys and the page-reached hook (audio, search, index) -------
  const next = useCallback(() => {
    const base = queuedRef.current ?? turnRef.current?.to ?? spreadRef.current;
    if (base + 2 <= LAST_SPREAD) requestSpread(base + 2);
    // requestSpread only reads refs and `disabled`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled]);

  const prev = useCallback(() => {
    const base = queuedRef.current ?? turnRef.current?.to ?? spreadRef.current;
    if (base - 2 >= FIRST_SPREAD) requestSpread(base - 2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled]);

  useImperativeHandle(
    ref,
    () => ({
      goToPage: (page: number) => {
        const target = spreadOf(page);
        const settled = queuedRef.current ?? turnRef.current?.to ?? spreadRef.current;
        if (target === settled) {
          // Already open (e.g. the reciter moved from the right page to the left one): no turn
          if (!turnRef.current && page !== focusedRef.current) report(page);
          return;
        }
        if (turnRef.current || dragRef.current?.active) {
          queuedRef.current = target;
          return;
        }
        startTurn(target, false);
      },
      next,
      prev,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [next, prev],
  );

  useEffect(() => {
    if (disabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable], [role='slider'], [role='menu'], [role='listbox']")) return;
      // A sheet or dialog open over the mushaf keeps its own keys
      if (document.querySelector("[role='dialog']")) return;
      e.preventDefault();
      // The mushaf is right-to-left: the next spread is to the left
      if (e.key === "ArrowLeft") next();
      else prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [disabled, next, prev]);

  // ------- Dragging the page -------
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled || turnRef.current || (e.pointerType === "mouse" && e.button !== 0)) return;
    dragRef.current = {
      pointerId: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      active: false,
      spine: 0,
      width: 0,
      startDistance: 0,
      dir: 1,
      samples: [{ x: e.clientX, t: e.timeStamp }],
    };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const dx = e.clientX - drag.x0;
    const dy = e.clientY - drag.y0;

    if (!drag.active) {
      if (Math.abs(dx) < DRAG_START_PX || Math.abs(dx) < Math.abs(dy) * 1.2) {
        if (Math.hypot(dx, dy) > 40) dragRef.current = null; // an up/down gesture, not a turn
        return;
      }
      // Pulling to the right turns forward (the left page comes over), to the left turns back
      const dir: 1 | -1 = dx > 0 ? 1 : -1;
      const to = spreadRef.current + 2 * dir;
      const book = bookRef.current;
      if (to < FIRST_SPREAD || to > LAST_SPREAD || !book) {
        dragRef.current = null;
        return;
      }
      const rect = book.getBoundingClientRect();
      drag.active = true;
      drag.dir = dir;
      drag.spine = rect.left + rect.width / 2;
      drag.width = rect.width / 2;
      // Distance of the press from the spine, on the side the sheet leaves
      drag.startDistance = dir > 0 ? drag.spine - drag.x0 : drag.x0 - drag.spine;
      try {
        book.setPointerCapture(e.pointerId);
      } catch {
        // The pointer is already gone: the drag still follows the events that come
      }
      startTurn(to, true);
      if (!turnRef.current) {
        // No motion wanted: the spread already changed
        dragRef.current = null;
        dragEndedAtRef.current = performance.now();
        return;
      }
    }

    drag.samples.push({ x: e.clientX, t: e.timeStamp });
    if (drag.samples.length > 20) drag.samples.shift();
    // The sheet's edge follows the finger: from where the press started to the far edge of the book
    const distance = drag.dir > 0 ? drag.spine - e.clientX : e.clientX - drag.spine;
    const reach = Math.min(3, Math.max(1, (2 * drag.width) / Math.max(1, drag.startDistance + drag.width)));
    const edge = (drag.width - (drag.startDistance - distance) * reach) / drag.width;
    draw(progressForEdge(edge));
  };

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    dragRef.current = null;
    if (!drag.active) return;
    dragEndedAtRef.current = performance.now();
    bookRef.current?.releasePointerCapture?.(e.pointerId);

    // Speed of the last moment only: a finger that stopped before letting go has no speed
    const last = { x: e.clientX, t: e.timeStamp };
    const first = drag.samples.find((sample) => sample.t >= last.t - RELEASE_WINDOW_MS) ?? last;
    const velocity = last.t > first.t ? ((last.x - first.x) / (last.t - first.t)) * drag.dir : 0; // px/ms, + = onwards
    const progress = progressRef.current;
    const complete = !cancelled && (velocity > 0.35 || (progress > 0.45 && velocity > -0.2));
    if (!turnRef.current?.ready) {
      // The far pages were still loading: decide now, the sheet runs when they are in
      if (complete) autoRunRef.current = true;
      else setTurnState(null);
      return;
    }
    animateTo(complete ? 1 : 0, turnMsRef.current * 0.8, easeRelease);
  };

  // ------- Drawing -------
  const forward = turn ? turn.to > turn.from : true;
  const shown = turn?.ready ? turnPages(turn.from, turn.to) : null;
  const visibleRight = shown ? shown.right : spread;
  const visibleLeft = shown ? shown.left : leftPageOf(spread);

  const mounted = new Set(pagesAround(spread));
  if (turn) for (const page of pagesOfSpread(turn.to)) mounted.add(page);
  const pages = [...mounted].sort((a, b) => a - b);

  // The paper edges show how much of the book lies on each side (read pages pile up on the right)
  const edgeStyle = {
    "--book-edge-right": `${(1 + (5 * (spread - 1)) / TOTAL_PAGES).toFixed(2)}px`,
    "--book-edge-left": `${(1 + (5 * (TOTAL_PAGES - spread - 1)) / TOTAL_PAGES).toFixed(2)}px`,
  } as CSSProperties;

  return (
    <div className="mushaf-book-stage">
      <div
        ref={bookRef}
        dir="ltr"
        className="mushaf-book"
        style={edgeStyle}
        data-turning={turn ? "" : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => endDrag(e, false)}
        onPointerCancel={(e) => endDrag(e, true)}
        onLostPointerCapture={(e) => endDrag(e, false)}
        onClickCapture={(e) => {
          // The click that ends a drag must not mark a word
          if (performance.now() - dragEndedAtRef.current < 400) {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
      >
        <div className="mushaf-book-edge" data-side="right" aria-hidden="true" />
        <div className="mushaf-book-edge" data-side="left" aria-hidden="true" />

        {pages.map((page) => {
          const visible = page === visibleRight || page === visibleLeft;
          return (
            <div
              key={page}
              ref={(element) => {
                if (element) slots.current.set(page, element);
                else slots.current.delete(page);
              }}
              className="mushaf-book-slot"
              data-side={page % 2 === 1 ? "right" : "left"}
              data-shown={visible ? "true" : "false"}
              aria-hidden={visible ? undefined : true}
              inert={!visible}
            >
              {renderPage(page)}
            </div>
          );
        })}

        {turn?.ready && (
          <>
            <div className="mushaf-book-shades" data-side={forward ? "left" : "right"} aria-hidden="true">
              <div ref={revealRef} className="mushaf-book-reveal" />
            </div>
            <div className="mushaf-book-shades" data-side={forward ? "right" : "left"} aria-hidden="true">
              <div ref={castRef} className="mushaf-book-cast" />
            </div>
            <div
              ref={leafHostRef}
              className="mushaf-book-leaf"
              data-from={forward ? "left" : "right"}
              style={{ "--leaf-strips": LEAF_STRIPS } as CSSProperties}
              aria-hidden="true"
            />
          </>
        )}
      </div>
    </div>
  );
}
