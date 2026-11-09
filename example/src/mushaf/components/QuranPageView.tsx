import { memo, useEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import { useI18n } from "@/i18n";
import type { MushafIndex, MushafLine, MushafWord } from "../types";
import { usePageData } from "../hooks/usePageData";
import { useQcfLineFit } from "../hooks/useQcfLineFit";
import {
  pageFontFamily,
  SURAH_HEADER_FAMILY,
  surahHeaderGlyph,
} from "../utils/mushafFonts";
import type { Chapter } from "@/lib/quranData";
import { Skeleton } from "@/ui";

const BASMALA_TEXT = "بِسۡمِ ٱللَّهِ ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ";

/** Arabic ordinal Juz names, index 0 = Juz 1 .. index 29 = Juz 30 */
const JUZ_NAMES_AR: readonly string[] = [
  "الجزء الأول",
  "الجزء الثاني",
  "الجزء الثالث",
  "الجزء الرابع",
  "الجزء الخامس",
  "الجزء السادس",
  "الجزء السابع",
  "الجزء الثامن",
  "الجزء التاسع",
  "الجزء العاشر",
  "الجزء الحادي عشر",
  "الجزء الثاني عشر",
  "الجزء الثالث عشر",
  "الجزء الرابع عشر",
  "الجزء الخامس عشر",
  "الجزء السادس عشر",
  "الجزء السابع عشر",
  "الجزء الثامن عشر",
  "الجزء التاسع عشر",
  "الجزء العشرون",
  "الجزء الحادي والعشرون",
  "الجزء الثاني والعشرون",
  "الجزء الثالث والعشرون",
  "الجزء الرابع والعشرون",
  "الجزء الخامس والعشرون",
  "الجزء السادس والعشرون",
  "الجزء السابع والعشرون",
  "الجزء الثامن والعشرون",
  "الجزء التاسع والعشرون",
  "الجزء الثلاثون",
];

/**
 * Surah shown in the page's running head: the first line's surah if the page
 * opens with a new surah, otherwise the surah of the first word on the page.
 */
const derivePageSurahName = (
  lines: MushafLine[],
  chapters: Chapter[],
): string => {
  for (const line of lines) {
    if (line.type === "header") {
      return chapters.find((c) => c.id === line.surah)?.name_arabic ?? "";
    }
    if (line.type === "words" && line.words.length > 0) {
      return (
        chapters.find((c) => c.id === line.words[0].surah)?.name_arabic ?? ""
      );
    }
  }
  return "";
};

/**
 * Open-book glyph: the printed Arabic mushaf always lays odd folios on the
 * right leaf and even folios on the left, so the filled (current) leaf flips
 * with page parity while the other leaf stays outlined/muted.
 */
function BookIcon({ page }: { page: number }) {
  const rightIsCurrent = page % 2 !== 0;
  const currentLeaf = "fill-(--mushaf-gold) stroke-(--mushaf-gold)";
  const otherLeaf = "fill-none stroke-(--mushaf-gold) [stroke-opacity:0.4]";

  return (
    <svg
      viewBox="0 0 24 16"
      aria-hidden="true"
      className="h-[16px] w-[24px] shrink-0"
    >
      <path
        d="M12 3 C9.2 1.8 5.4 1.6 2 2.6 L2 13 C5.4 12 9.2 12.2 12 13.4 Z"
        strokeWidth="0.7"
        className={rightIsCurrent ? otherLeaf : currentLeaf}
      />
      <path
        d="M12 3 C14.8 1.8 18.6 1.6 22 2.6 L22 13 C18.6 12 14.8 12.2 12 13.4 Z"
        strokeWidth="0.7"
        className={rightIsCurrent ? currentLeaf : otherLeaf}
      />
      <line
        x1="12"
        y1="3"
        x2="12"
        y2="13.4"
        strokeWidth="0.5"
        className="stroke-(--mushaf-gold)"
      />
    </svg>
  );
}

/** Hold duration before a word press becomes a selection (spec: >= 400ms) */
const LONG_PRESS_MS = 300;
/**
 * Finger/mouse drift that cancels a pending long-press (it's a swipe/scroll). Under the desktop book's 10 px, so a
 * press is always cancelled before the book captures the pointer for a page turn.
 */
const MOVE_TOLERANCE_PX = 8;

interface QuranPageViewProps {
  page: number;
  chapters: Chapter[];
  /** mushaf_index.json — used to resolve the Juz shown in the in-page header */
  index: MushafIndex;
  /** Long-press handler (holding a word picks its ayah) — never fires on quick taps */
  onWordSelect?: (word: MushafWord, element: HTMLElement, page: number) => void;
  /** How long a press must be held */
  longPressMs?: number;
  /** Ayah to pulse briefly (search result jump) */
  flashAyah?: { surah: number; ayah: number } | null;
}

/**
 * One mushaf page rendered as a fixed-ratio framed card with the printed
 * 15-line layout. Always RTL regardless of UI language.
 */
export const QuranPageView = memo(function QuranPageView({
  page,
  chapters,
  index,
  onWordSelect,
  longPressMs = LONG_PRESS_MS,
  flashAyah,
}: QuranPageViewProps) {
  const { t } = useI18n();
  const { data, failed, retry } = usePageData(page);
  // Every word is one glyph of this page's own font (QCF V2)
  const bodyRef = useRef<HTMLDivElement>(null);
  useQcfLineFit(bodyRef, data);

  const juz = index.pageInfo[page - 1]?.[1] ?? 1;
  const juzName = JUZ_NAMES_AR[juz - 1] ?? "";
  const pageSurahName = data ? derivePageSurahName(data.lines, chapters) : "";

  /** Long-press machinery is only wired when there is something to pick */
  const useLongPress = !!onWordSelect;

  // --- Long-press selection machinery (one pending press per page) ---
  const pressTimer = useRef<number | null>(null);
  const pressStart = useRef<{ x: number; y: number } | null>(null);
  const longPressFired = useRef(false);

  const cancelPress = () => {
    if (pressTimer.current !== null) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
    pressStart.current = null;
  };

  useEffect(() => cancelPress, []);

  const handleWordPointerDown =
    (word: MushafWord) => (e: React.PointerEvent<HTMLSpanElement>) => {
      if (!onWordSelect) return;
      cancelPress();
      const element = e.currentTarget;
      pressStart.current = { x: e.clientX, y: e.clientY };
      pressTimer.current = window.setTimeout(() => {
        pressTimer.current = null;
        longPressFired.current = true;
        onWordSelect(word, element, page);
      }, longPressMs);
    };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (pressTimer.current === null || !pressStart.current) return;
    const dx = e.clientX - pressStart.current.x;
    const dy = e.clientY - pressStart.current.y;
    if (Math.hypot(dx, dy) > MOVE_TOLERANCE_PX) {
      cancelPress(); // the user is swiping, not selecting
    }
  };

  // Swallow the synthetic click that follows a completed long-press so it
  // doesn't toggle the bars (the phone's tap on the page) underneath.
  const handleClickCapture = (e: React.MouseEvent) => {
    if (longPressFired.current) {
      longPressFired.current = false;
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const isOpeningPage = page <= 2;

  return (
    <div
      dir="rtl"
      className="mushaf-page-card"
      // The desktop book turns a copy of a page only once it is drawn (MushafBookView)
      data-state={failed ? "failed" : data ? "ready" : "loading"}
      onClickCapture={useLongPress ? handleClickCapture : undefined}
      onPointerMove={useLongPress ? handlePointerMove : undefined}
      onPointerUp={useLongPress ? cancelPress : undefined}
      onPointerCancel={useLongPress ? cancelPress : undefined}
      onContextMenu={useLongPress ? (e) => e.preventDefault() : undefined}
    >
      {/* In-page running head, like a printed mushaf's margin furniture:
          surah on the right, Juz name (in words) on the left, book icon
          centered and mirrored to the page's physical side. */}
      <div className="absolute top-[2%] inset-x-[3%] grid grid-cols-[1fr_auto_1fr] items-center text-[clamp(14px,2.5cqw,14px)] text-(--mushaf-gold)">
        <span className="min-w-0 justify-self-start">
          {pageSurahName ? `سورة ${pageSurahName}` : ""}
        </span>
        <BookIcon page={page} />
        <span className="min-w-0 justify-self-end">{juzName}</span>
      </div>

      {failed ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
          <p className="text-muted-foreground">
            {t("mushaf:failedToLoadPage")}
          </p>
          <button
            type="button"
            onClick={retry}
            className="text-primary underline underline-offset-4"
          >
            {t("common:refresh")}
          </button>
        </div>
      ) : !data ? (
        <div className="flex h-full flex-col justify-between py-1">
          {Array.from({ length: 15 }, (_, i) => (
            <Skeleton key={i} className="h-[4.5cqw] w-full" />
          ))}
        </div>
      ) : (
        <div
          ref={bodyRef}
          className={cn("mushaf-page-body", isOpeningPage && "mushaf-opening")}
          style={{ fontFamily: pageFontFamily(page) }}
        >
          {data.lines.map((line) => {
            if (line.type === "header") {
              const chapter = chapters.find((c) => c.id === line.surah);
              return (
                <div key={line.line} className="mushaf-surah-header">
                  <span
                    className="mushaf-surah-frame"
                    style={{ fontFamily: SURAH_HEADER_FAMILY }}
                    aria-label={chapter ? `سورة ${chapter.name_arabic}` : undefined}
                  >
                    {surahHeaderGlyph(line.surah)}
                  </span>
                </div>
              );
            }

            if (line.type === "basmala") {
              return (
                <div
                  key={line.line}
                  className="mushaf-basmala"
                  style={{ fontFamily: pageFontFamily(line.fontPage) }}
                  aria-label={BASMALA_TEXT}
                >
                  {[...line.g].map((glyph, i) => (
                    <span key={i}>{glyph}</span>
                  ))}
                </div>
              );
            }

            return (
              <div
                key={line.line}
                className={cn("mushaf-line", line.centered && "mushaf-line-centered")}
              >
                {line.words.map((word) => {
                  const isFlashing =
                    flashAyah &&
                    word.surah === flashAyah.surah &&
                    word.ayah === flashAyah.ayah;
                  return (
                    <span
                      key={word.id}
                      data-word-id={word.id}
                      // The ayah bands find the words by this attribute (audio/ayahBands.ts): keep it on every word
                      data-location={`${word.surah}:${word.ayah}:${word.pos}`}
                      // The glyph code means nothing to a screen reader: it reads the word itself
                      aria-label={word.text}
                      className={cn(
                        "mushaf-word",
                        word.end === 1 && "mushaf-ayah-end",
                        isFlashing && "mushaf-flash",
                      )}
                      onPointerDown={
                        useLongPress ? handleWordPointerDown(word) : undefined
                      }
                      onPointerUp={useLongPress ? cancelPress : undefined}
                      onPointerLeave={useLongPress ? cancelPress : undefined}
                    >
                      {word.g}
                    </span>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {/* Folio number in the bottom margin, like a printed mushaf */}
      <div className="mushaf-page-number">{page}</div>
    </div>
  );
});
