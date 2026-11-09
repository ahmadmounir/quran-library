import {
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from "react";
import { TOTAL_PAGES } from "@/lib/quranData";

const PAGES = Array.from({ length: TOTAL_PAGES }, (_, i) => i + 1);
/** Pages rendered on each side of the current one — the rest are empty slots */
const RENDER_RADIUS = 2;

export interface MushafScrollHandle {
  scrollToPage: (page: number) => void;
}

interface MushafScrollViewProps {
  ref?: Ref<MushafScrollHandle>;
  /** Read once on mount to open at the right page */
  initialPage: number;
  onPageChange: (page: number) => void;
  renderPage: (page: number) => ReactNode;
}

/**
 * Scrolling alternative to the Swiper: every page stacked in one vertical
 * list. All slots share the same CSS-defined height (see .mushaf-scroll-slot),
 * so a page's offset is plain arithmetic and only the pages around the
 * current one are actually rendered.
 */
export function MushafScrollView({
  ref,
  initialPage,
  onPageChange,
  renderPage,
}: MushafScrollViewProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState(initialPage);
  const currentRef = useRef(initialPage);
  const itemHeightRef = useRef(0);
  const onPageChangeRef = useRef(onPageChange);

  useEffect(() => {
    onPageChangeRef.current = onPageChange;
  }, [onPageChange]);

  const measureItem = (): number =>
    scrollerRef.current?.firstElementChild?.getBoundingClientRect().height ?? 0;

  const setPage = (page: number) => {
    if (page === currentRef.current) return;
    currentRef.current = page;
    setCurrent(page);
    onPageChangeRef.current(page);
  };

  const scrollToPage = (page: number) => {
    const scroller = scrollerRef.current;
    const height = measureItem();
    if (!scroller || !height) return;
    itemHeightRef.current = height;
    // Instant on purpose: a smooth scroll across hundreds of pages would crawl
    // through empty slots.
    scroller.scrollTop = (page - 1) * height;
    setPage(page);
  };

  useImperativeHandle(ref, () => ({ scrollToPage }));

  // Open at the initial page before the first paint
  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    const height = measureItem();
    if (!scroller || !height) return;
    itemHeightRef.current = height;
    scroller.scrollTop = (currentRef.current - 1) * height;
    scroller.focus({ preventScroll: true }); // keyboard scrolling works right away
  }, []);

  // Slot height follows the width (rotation, window resize): keep the current
  // page in view instead of drifting to whatever lands at the old offset.
  useEffect(() => {
    const scroller = scrollerRef.current;
    const first = scroller?.firstElementChild;
    if (!scroller || !first) return;
    const observer = new ResizeObserver(() => {
      const height = first.getBoundingClientRect().height;
      if (!height || Math.abs(height - itemHeightRef.current) < 0.5) return;
      itemHeightRef.current = height;
      scroller.scrollTop = (currentRef.current - 1) * height;
    });
    observer.observe(first);
    return () => observer.disconnect();
  }, []);

  const frame = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );

  const handleScroll = () => {
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const scroller = scrollerRef.current;
      const height = itemHeightRef.current || measureItem();
      if (!scroller || !height) return;

      // The current page is the one under the upper third of the viewport;
      // the very bottom always counts as the last page.
      const atBottom =
        scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1;
      const page = atBottom
        ? TOTAL_PAGES
        : Math.floor((scroller.scrollTop + scroller.clientHeight / 3) / height) + 1;
      setPage(Math.min(TOTAL_PAGES, Math.max(1, page)));
    });
  };

  return (
    <div
      ref={scrollerRef}
      className="mushaf-scroll"
      tabIndex={-1}
      onScroll={handleScroll}
    >
      {PAGES.map((page) => (
        <div key={page} className="mushaf-scroll-item">
          <div className="mushaf-scroll-slot">
            {Math.abs(page - current) <= RENDER_RADIUS && renderPage(page)}
          </div>
        </div>
      ))}
    </div>
  );
}
