import {
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from "react";
import { useI18n } from "@/i18n";
import { TOTAL_PAGES } from "@/lib/quranData";
import type { MushafIndex } from "../types";
import { hizbPositionOfPage, QUARTER_FRACTIONS } from "../utils/hizbQuarters";
import { pageMostInView, pagesNear, revealScrollTop } from "../utils/landscapeScroll";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";

const PAGES = Array.from({ length: TOTAL_PAGES }, (_, i) => i + 1);
/** Pages drawn on each side of the one in view (a page is several screens high here, so two are plenty) */
const RENDER_RADIUS = 2;
/** What the slim header covers when shown (LandscapeMushafChrome: 2.75rem) */
const HEADER_COVER_PX = 48;
/** What the reciter's player bar covers at the bottom while it is shown */
const PLAYER_COVER_PX = 84;
/** What the footer chip covers when the chrome is shown */
const FOOTER_COVER_PX = 40;
/** A scroll by the reader's own finger / wheel this far hides the header and footer */
const HIDE_CHROME_AFTER_PX = 48;
/** How long after the last touch / wheel / key a scroll still counts as the reader's own (a fling keeps going) */
const USER_SCROLL_MS = 1200;
/** A wanted ayah (search, reciter, deep link) whose page never draws is given up after this long */
const REVEAL_TIMEOUT_MS = 6000;

type AyahRef = { surah: number; ayah: number };

/** What to bring into view once its page is drawn */
type Reveal = { kind: "ayah"; ref: AyahRef; smooth: boolean; until: number };

export interface MushafLandscapeHandle {
  /** Jumps to the top of a page (the surah / juz index, a search result's page, a bookmark) */
  scrollToPage: (page: number) => void;
}

interface MushafLandscapeViewProps {
  ref?: Ref<MushafLandscapeHandle>;
  /** Read once on mount: the page to open at */
  initialPage: number;
  index: MushafIndex;
  onPageChange: (page: number) => void;
  /** The surah at the reading position (it changes in the middle of a page in the short surahs) */
  onSurahChange?: (surah: number) => void;
  renderPage: (page: number) => ReactNode;
  /** The ayah the reciter is reading: the view follows it */
  readingAyah?: AyahRef | null;
  /** An ayah to show (the searched ayah) */
  focusAyah?: AyahRef | null;
  /** The header and footer are shown (what they cover is not "in view") */
  chromeVisible: boolean;
  onChromeVisibleChange: (visible: boolean) => void;
}

/**
 * The mushaf on a phone turned sideways, like the mushaf apps: every page across the full width of the screen, one
 * under the other, read by scrolling (no swipe, no page turn), with a page break that shows the page number and the
 * quarter of the hizb. All pages have the same height (CSS: `.mushaf-landscape-*`, from the width), so far pages are
 * empty slots and only the pages near the screen are drawn; their fonts come through the font queue as the reader
 * reaches them (`onPageChange` → `prefetchAround`).
 */
export function MushafLandscapeView({
  ref,
  initialPage,
  index,
  onPageChange,
  onSurahChange,
  renderPage,
  readingAyah,
  focusAyah,
  chromeVisible,
  onChromeVisibleChange,
}: MushafLandscapeViewProps) {
  const reducedMotion = usePrefersReducedMotion();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState(initialPage);
  const currentRef = useRef(initialPage);
  const itemHeightRef = useRef(0);
  /** Where the screen's top is, in pages from the start (2.25 = a quarter into page 3): kept across a resize */
  const positionRef = useRef(initialPage - 1);
  const surahRef = useRef<number | null>(null);
  const revealRef = useRef<Reveal | null>(null);
  const frameRef = useRef(0);

  // Whatever the parent passes changes every render; the scroll machinery reads the latest through refs
  const latest = useRef({ onPageChange, onSurahChange, onChromeVisibleChange, chromeVisible, readingAyah, reducedMotion, index });
  useEffect(() => {
    latest.current = { onPageChange, onSurahChange, onChromeVisibleChange, chromeVisible, readingAyah, reducedMotion, index };
  });

  // The reader's own scrolling (not a jump or a follow): hides the header and footer
  // No input yet (0 would read as "a touch when the page loaded" and hide the chrome on the first jump)
  const lastInputAt = useRef(Number.NEGATIVE_INFINITY);
  const touching = useRef(false);
  const chromeAnchor = useRef(0);

  const measureItem = (): number =>
    scrollerRef.current?.firstElementChild?.getBoundingClientRect().height ?? 0;

  const itemHeight = () => {
    if (!itemHeightRef.current) itemHeightRef.current = measureItem();
    return itemHeightRef.current;
  };

  const setPage = (page: number) => {
    if (page === currentRef.current) return;
    currentRef.current = page;
    setCurrent(page);
    latest.current.onPageChange(page);
  };

  /** What the header / footer / player bar cover right now */
  const insets = () => {
    const { chromeVisible: shown, readingAyah: reading } = latest.current;
    return {
      insetTop: shown ? HEADER_COVER_PX : 0,
      insetBottom: reading ? PLAYER_COVER_PX : shown ? FOOTER_COVER_PX : 0,
    };
  };

  /** The surah of the line at the reading position: a quarter of the way down the free part of the screen */
  const findSurah = (scroller: HTMLDivElement): number | null => {
    const box = scroller.getBoundingClientRect();
    const { insetTop } = insets();
    const y = box.top + insetTop + (scroller.clientHeight - insetTop) / 4;
    const lines = scroller.querySelectorAll<HTMLElement>(".mushaf-line, .mushaf-surah-header");
    let at = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].getBoundingClientRect().bottom >= y) {
        at = i;
        break;
      }
    }
    if (at < 0) return null;
    // A surah's header (and its basmala) belongs to the words after it
    for (let i = at; i < lines.length; i++) {
      const location = lines[i].querySelector<HTMLElement>("[data-location]")?.dataset.location;
      if (location) return Number(location.split(":")[0]) || null;
    }
    return null;
  };

  /** Brings a wanted ayah / mark into view once its page is drawn; true when done (or given up) */
  const tryReveal = (scroller: HTMLDivElement, reveal: Reveal): boolean => {
    if (performance.now() > reveal.until) return true;
    // The basmala (ayah 0) is drawn right before ayah 1
    const ayah = Math.max(1, reveal.ref.ayah);
    const words = scroller.querySelectorAll<HTMLElement>(`.mushaf-word[data-location^="${reveal.ref.surah}:${ayah}:"]`);
    if (words.length === 0) return false;
    const first = words[0];
    const last = words[words.length - 1];
    const smooth = reveal.smooth;

    const firstLine = first.closest<HTMLElement>(".mushaf-line") ?? first;
    const lastLine = last.closest<HTMLElement>(".mushaf-line") ?? last;
    const box = scroller.getBoundingClientRect();
    const firstBox = firstLine.getBoundingClientRect();
    const top = firstBox.top - box.top + scroller.scrollTop;
    const bottom = lastLine.getBoundingClientRect().bottom - box.top + scroller.scrollTop;
    const target = revealScrollTop(
      { top, bottom },
      {
        scrollTop: scroller.scrollTop,
        viewportHeight: scroller.clientHeight,
        maxScrollTop: scroller.scrollHeight - scroller.clientHeight,
        ...insets(),
      },
      // A little room above the line: its harakat and the end of the line before
      firstBox.height * 0.35,
    );
    if (target !== null) {
      scroller.scrollTo({ top: target, behavior: smooth && !latest.current.reducedMotion ? "smooth" : "auto" });
    }
    return true;
  };

  /** One pass per frame: the page in view, the surah, the chrome, a wanted ayah */
  const update = () => {
    frameRef.current = 0;
    const scroller = scrollerRef.current;
    const height = itemHeight();
    if (!scroller || !height) return;

    positionRef.current = scroller.scrollTop / height;
    setPage(pageMostInView(scroller.scrollTop, scroller.clientHeight, height, TOTAL_PAGES));

    const surah = findSurah(scroller) ?? latest.current.index.pageInfo[currentRef.current - 1]?.[0] ?? null;
    if (surah !== null && surah !== surahRef.current) {
      surahRef.current = surah;
      latest.current.onSurahChange?.(surah);
    }

    const ownScroll = touching.current || performance.now() - lastInputAt.current < USER_SCROLL_MS;
    if (
      latest.current.chromeVisible &&
      ownScroll &&
      Math.abs(scroller.scrollTop - chromeAnchor.current) > HIDE_CHROME_AFTER_PX
    ) {
      latest.current.onChromeVisibleChange(false);
    }

    const reveal = revealRef.current;
    // Never pull the page from under the reader's finger: it waits until the finger is lifted
    if (reveal && !touching.current && tryReveal(scroller, reveal)) {
      if (revealRef.current === reveal) revealRef.current = null;
    }
  };

  const schedule = useCallback(() => {
    if (!frameRef.current) frameRef.current = requestAnimationFrame(update);
    // update reads everything through refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const jumpTo = (page: number) => {
    const scroller = scrollerRef.current;
    const height = itemHeight();
    if (!scroller || !height) return;
    scroller.scrollTop = (page - 1) * height;
    positionRef.current = page - 1;
    setPage(page);
  };

  /** Shows an ayah: jumps to its page first when that page is not drawn, then scrolls to the ayah itself */
  const showAyah = (ref: AyahRef, smooth: boolean) => {
    const page = latest.current.index.ayahPages[String(ref.surah)]?.[Math.max(1, ref.ayah) - 1];
    if (!page) return;
    const far = Math.abs(page - currentRef.current) > RENDER_RADIUS;
    if (far) jumpTo(page);
    revealRef.current = { kind: "ayah", ref, smooth: smooth && !far, until: performance.now() + REVEAL_TIMEOUT_MS };
    schedule();
  };

  useImperativeHandle(ref, () => ({
    scrollToPage: (page: number) => {
      revealRef.current = null;
      jumpTo(page);
    },
  }));

  // Open at the first page before the first paint, then at the ayah the link asks for (?surah=&ayah=)
  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    const height = measureItem();
    if (!scroller || !height) return;
    itemHeightRef.current = height;
    scroller.scrollTop = (initialPage - 1) * height;

    const until = performance.now() + REVEAL_TIMEOUT_MS;
    const searchParams = new URLSearchParams(window.location.search);
    const surah = Number(searchParams.get("surah"));
    const ayah = Number(searchParams.get("ayah"));
    const linkedPage = surah && ayah ? index.ayahPages[String(surah)]?.[ayah - 1] : undefined;
    if (linkedPage === initialPage) {
      revealRef.current = { kind: "ayah", ref: { surah, ayah }, smooth: false, until };
    }
    // Read once, like the other views
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The header and footer show when this view opens (the phone was just turned, or the mushaf just opened)
  useEffect(() => {
    latest.current.onChromeVisibleChange(true);
  }, []);

  // Shown again (a tap): the next scroll of the reader's own hides it, counted from here
  useEffect(() => {
    if (chromeVisible) chromeAnchor.current = scrollerRef.current?.scrollTop ?? 0;
  }, [chromeVisible]);

  // Pages drawing in (data, fonts), coming and going: the surah and a wanted ayah are looked for again
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const observer = new MutationObserver(schedule);
    observer.observe(scroller, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-state"] });
    schedule();
    return () => observer.disconnect();
  }, [schedule]);

  // The width changes (split screen, a resize): every page gets a new height; stay at the same place in the text
  useEffect(() => {
    const scroller = scrollerRef.current;
    const first = scroller?.firstElementChild;
    if (!scroller || !first) return;
    const observer = new ResizeObserver(() => {
      const height = first.getBoundingClientRect().height;
      if (!height || Math.abs(height - itemHeightRef.current) < 0.5) return;
      itemHeightRef.current = height;
      scroller.scrollTop = positionRef.current * height;
    });
    observer.observe(first);
    return () => observer.disconnect();
  }, []);

  useEffect(
    () => () => {
      cancelAnimationFrame(frameRef.current);
      // Or a remount (StrictMode) would think a frame is still coming and never update again
      frameRef.current = 0;
    },
    [],
  );

  // The reciter moves on: the ayah being read comes into view (the basmala with its surah's first ayah)
  const readingSurah = readingAyah?.surah;
  const readingNumber = readingAyah ? Math.max(1, readingAyah.ayah) : undefined;
  useEffect(() => {
    if (readingSurah && readingNumber) showAyah({ surah: readingSurah, ayah: readingNumber }, true);
    // showAyah reads everything through refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readingSurah, readingNumber]);

  // A searched ayah or the exam's question: the page jump came first (scrollToPage), now the ayah itself
  const focusSurah = focusAyah?.surah;
  const focusNumber = focusAyah?.ayah;
  useEffect(() => {
    if (focusSurah && focusNumber) showAyah({ surah: focusSurah, ayah: focusNumber }, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusSurah, focusNumber]);

  const markInput = () => {
    lastInputAt.current = performance.now();
  };

  const drawn = new Set(pagesNear(current, RENDER_RADIUS, TOTAL_PAGES));

  return (
    <div
      ref={scrollerRef}
      className="mushaf-landscape"
      onScroll={schedule}
      onTouchStart={() => {
        touching.current = true;
        markInput();
      }}
      onTouchMove={markInput}
      onTouchEnd={() => {
        touching.current = false;
        markInput();
        schedule();
      }}
      onTouchCancel={() => {
        touching.current = false;
        schedule();
      }}
      onWheel={markInput}
      onKeyDown={markInput}
    >
      {PAGES.map((page) => {
        const near = drawn.has(page);
        return (
          <div key={page} className="mushaf-landscape-item" data-page={page}>
            <div className="mushaf-landscape-slot">{near && renderPage(page)}</div>
            <div className="mushaf-landscape-break">{near && <PageBreak page={page} index={index} />}</div>
          </div>
        );
      })}
    </div>
  );
}

/** The end of a page: its number and where it is in the hizb, like the mushaf apps */
const PageBreak = memo(function PageBreak({ page, index }: { page: number; index: MushafIndex }) {
  return (
    <span className="mushaf-landscape-break-chip">
      <span className="tabular-nums">{page}</span>
      <span aria-hidden="true">·</span>
      <HizbLabel page={page} index={index} />
    </span>
  );
});

/** "1/4 الحزب 31": the quarter of the hizb a page belongs to (the last quarter begun by the page's end) */
export function HizbLabel({ page, index }: { page: number; index: MushafIndex }) {
  const { t } = useI18n();
  const { hizb, quarter } = hizbPositionOfPage(page, index);
  return (
    <span>
      {quarter === 0
        ? t("mushaf:landscape.hizb", { hizb })
        : t("mushaf:landscape.hizbQuarter", { hizb, fraction: QUARTER_FRACTIONS[quarter] })}
    </span>
  );
}
