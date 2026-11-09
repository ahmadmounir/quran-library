import { useEffect, useRef, useState, type CSSProperties } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Bookmark, CheckCircle2, CloudDownload, Search, X } from "lucide-react";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/formatDate";
import { surahMatches } from "@/lib/arabicSearch";
import { TOTAL_PAGES, type Chapter } from "@/lib/quranData";
import type { MushafIndex } from "../types";
import { OfflineMushafSheet } from "../offline/OfflineMushafSheet";
import { mushafDownload } from "../offline/offlineDownloads";
import { useOfflineDownload } from "../offline/useOfflineDownload";
import { useMushafBookmarks } from "../hooks/useMushafBookmarks";
import { juzStarts } from "../utils/landscapeScroll";
import { hizbPositionOfPage } from "../utils/hizbQuarters";

export type MushafIndexTab = "surahs" | "juz" | "bookmarks";

interface MushafIndexScreenProps {
  /** The tab it opens on; null while it is closed */
  tab: MushafIndexTab | null;
  onClose: () => void;
  index: MushafIndex;
  chapters: Chapter[];
  currentPage: number;
  /** A surah, a juz or a bookmark was chosen: close and go to its page */
  onOpenPage: (page: number) => void;
}

/** The eight-pointed star the numbers sit in (the rub el hizb of the print), in a 44 × 44 box */
const STAR =
  "M22 2L27.86 7.86L36.14 7.86L36.14 16.14L42 22L36.14 27.86L36.14 36.14L27.86 36.14L22 42L16.14 36.14L7.86 36.14L7.86 27.86L2 22L7.86 16.14L7.86 7.86L16.14 7.86Z";

/** Rows further than this from the reader's row all come in together (the ripple only plays where the eye is) */
const RIPPLE_ROWS = 12;

/** A list row: a hairline under it from after the star to the end, none under the last one */
const listRow =
  "relative after:absolute after:start-[4.375rem] after:end-3 after:bottom-0 after:h-px after:bg-[#b8912e]/12 after:content-[''] last:after:hidden dark:after:bg-[#cdb26a]/10";
const rowButton =
  "mushaf-index-row flex w-full cursor-pointer items-center gap-3.5 rounded-2xl px-3 py-3 text-start transition-colors hover:bg-[#b8912e]/8 active:bg-[#b8912e]/14 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b8912e]/45 dark:hover:bg-[#cdb26a]/8";
const currentRow = "bg-[#b8912e]/12 ring-1 ring-[#b8912e]/30 dark:bg-[#cdb26a]/10 dark:ring-[#cdb26a]/25";

/** How far a row is from the reader's one, for the ripple of rows coming in (a CSS variable read by .mushaf-index-row) */
const ripple = (position: number, current: number): CSSProperties =>
  ({ "--i": Math.min(Math.abs(position - Math.max(0, current)), RIPPLE_ROWS) }) as CSSProperties;

/** Scrolls a list so the reader's row (aria-current) is in the middle, once, when the list appears */
const centerCurrent = (list: HTMLElement | null) => {
  const current = list?.querySelector<HTMLElement>('[aria-current="true"]');
  if (!list || !current) return;
  const offset = current.getBoundingClientRect().top - list.getBoundingClientRect().top;
  list.scrollTop += offset - list.clientHeight / 2 + current.offsetHeight / 2;
};

function StarNumber({ value, active }: { value: number; active: boolean }) {
  return (
    <span className="relative flex size-11 shrink-0 items-center justify-center" aria-hidden="true">
      <svg viewBox="0 0 44 44" className="absolute inset-0 size-full overflow-visible">
        <path
          d={STAR}
          strokeWidth={1.25}
          strokeLinejoin="round"
          className={
            active
              ? "fill-[#0d3429] stroke-[#c9a24a] dark:fill-[#cdb26a] dark:stroke-[#cdb26a]"
              : "fill-[#b8912e]/8 stroke-[#b8912e]/55 dark:fill-[#cdb26a]/8 dark:stroke-[#cdb26a]/45"
          }
        />
      </svg>
      <span
        className={cn(
          "relative text-[13px] leading-none font-semibold tabular-nums",
          active ? "text-[#e6cd86] dark:text-[#0d3429]" : "text-[#6f5622] dark:text-[#e2cd94]",
        )}
      >
        {value}
      </span>
    </span>
  );
}

/** The page a row leads to: the number, «صفحة» under it */
function PageNumber({ page }: { page: number }) {
  const { t } = useI18n();
  return (
    <span className="flex w-12 shrink-0 flex-col items-center gap-0.5">
      <span className="text-base leading-none font-semibold text-[#0d3429] tabular-nums dark:text-[#efe5c8]">{page}</span>
      <span className="text-[11px] leading-none text-[#8a6d2f]/80 dark:text-[#cdb26a]/70">{t("mushaf:page")}</span>
    </span>
  );
}

function CurrentBadge() {
  const { t } = useI18n();
  return (
    <span className="shrink-0 rounded-full bg-[#0d3429] px-2 py-1 text-[11px] leading-none font-medium text-[#e6cd86] dark:bg-[#cdb26a] dark:text-[#0d3429]">
      {t("mushaf:index.current")}
    </span>
  );
}

/**
 * The fihris: a screen of its own over the whole mushaf, with the surahs, the 30 juz and the page bookmarks. A deep
 * green cover on top (the title, the tabs and, for the surahs, a field that finds one by name or number) over the
 * mushaf's paper; every surah and juz has its number in the print's eight-pointed star, what it is under its name
 * (Makki or Madani and its ayat; where the juz begins) and the page at the end. It opens scrolled to where the reader
 * is, that row marked, and the rows near it ripple in. The mushaf's offline download stays at the foot.
 * It opens on the tab its button is named after: the surah's name opens the surahs, the sideways juz chip the juz.
 */
export function MushafIndexScreen({ tab, onClose, index, chapters, currentPage, onOpenPage }: MushafIndexScreenProps) {
  const { t, language } = useI18n();
  const open = tab !== null;
  const offline = useOfflineDownload(mushafDownload);
  const [offlineOpen, setOfflineOpen] = useState(false);
  const bookmarks = useMushafBookmarks();
  const contentRef = useRef<HTMLDivElement>(null);

  // The tab shown; it keeps the last one while the screen leaves, and starts from the asked one on every opening
  const [shown, setShown] = useState<MushafIndexTab>(tab ?? "surahs");
  const [query, setQuery] = useState("");
  const [lastTab, setLastTab] = useState(tab);
  if (lastTab !== tab) {
    setLastTab(tab);
    if (tab) {
      setShown(tab);
      setQuery("");
    }
  }
  useEffect(() => {
    if (open) void mushafDownload.refresh();
  }, [open]);
  const active: MushafIndexTab = shown === "bookmarks" && !bookmarks.available ? "surahs" : shown;

  // Where the reader is: the page's first surah (as the header names it) and the juz of its hizb
  const currentSurah = index.pageInfo[currentPage - 1]?.[0] ?? 1;
  const currentJuz = Math.ceil(hizbPositionOfPage(currentPage, index).hizb / 2);

  const surahs = query.trim() ? chapters.filter((chapter) => surahMatches(chapter, query)) : chapters;
  const currentSurahRow = surahs.findIndex((chapter) => chapter.id === currentSurah);

  const surahName = (chapter: Chapter | undefined) =>
    chapter ? (language === "ar" ? chapter.name_arabic : chapter.name_simple) : "";

  const tabs: { value: MushafIndexTab; label: string }[] = [
    { value: "surahs", label: t("mushaf:index.surahs") },
    { value: "juz", label: t("mushaf:index.juz") },
    ...(bookmarks.available ? [{ value: "bookmarks" as const, label: t("mushaf:bookmarks.title") }] : []),
  ];

  const offlineStatus = offline.complete
    ? t("mushaf:offline.completeShort")
    : offline.progress
      ? t("mushaf:offline.downloadingShort", {
          percent: Math.round((offline.progress.done / Math.max(1, offline.progress.total)) * 100),
        })
      : offline.storedPages !== null
        ? t("mushaf:offline.storedShort", { count: offline.storedPages, total: TOTAL_PAGES })
        : "";

  const listClass =
    "min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-color:rgba(184,145,46,0.35)_transparent] [scrollbar-width:thin]";
  // A phone on its side has the notch on the left or the right
  const listInner =
    "mx-auto w-full max-w-5xl py-3 pl-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] lg:grid lg:grid-cols-2 lg:gap-x-6 xl:grid-cols-3";
  const coverInner =
    "mx-auto w-full max-w-5xl pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]";

  return (
    <>
      <DialogPrimitive.Root open={open} onOpenChange={(next) => !next && onClose()}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Content
            ref={contentRef}
            aria-describedby={undefined}
            // No field takes the focus by itself: on a phone that would raise the keyboard over the list
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              contentRef.current?.focus({ preventScroll: true });
            }}
            className="mushaf-index fixed inset-0 z-50 flex flex-col bg-paper text-[#1f1b14] outline-none dark:text-[#efe5c8]"
          >
            {/* The cover: the title, the tabs, the surah finder */}
            <div className="mushaf-index-cover shrink-0 pt-[env(safe-area-inset-top)] shadow-[0_12px_28px_-18px_rgba(7,29,22,0.8)]">
              <div className={cn(coverInner, "pb-4 [@media(max-height:30rem)]:pb-2.5")}>
                {/* Lower on a phone held sideways, where the height is short */}
                <div className="flex h-16 items-center gap-3 [@media(max-height:30rem)]:h-12">
                  <svg viewBox="0 0 44 44" className="size-6 shrink-0" aria-hidden="true">
                    <path d={STAR} fill="none" stroke="#c9a24a" strokeWidth={2.5} strokeLinejoin="round" />
                  </svg>
                  <DialogPrimitive.Title className="min-w-0 flex-1 truncate text-xl leading-snug font-semibold text-[#efe5c8]">
                    {t("mushaf:index.title")}
                  </DialogPrimitive.Title>
                  <DialogPrimitive.Close
                    className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full text-[#e6cd86] transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e6cd86]/50"
                    aria-label={t("common:close")}
                    title={t("common:close")}
                  >
                    <X className="size-5" />
                  </DialogPrimitive.Close>
                </div>

                <div
                  role="tablist"
                  aria-label={t("mushaf:index.tabs")}
                  className="flex rounded-full bg-black/25 p-1 ring-1 ring-[#c9a24a]/25"
                >
                  {tabs.map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      role="tab"
                      aria-selected={active === value}
                      onClick={() => setShown(value)}
                      className={cn(
                        "h-9 min-w-0 flex-1 cursor-pointer truncate rounded-full px-3 text-sm font-medium transition-[background-color,color,box-shadow] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e6cd86]/50",
                        active === value
                          ? "bg-gradient-to-b from-[#e6cd86] to-[#c9a24a] text-[#0d3429] shadow-[0_2px_8px_-2px_rgba(0,0,0,0.45)]"
                          : "text-[#efe5c8]/75 hover:text-[#efe5c8]",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {active === "surahs" && (
                  <div className="relative mt-3">
                    <Search
                      className="pointer-events-none absolute start-4 top-1/2 size-4.5 -translate-y-1/2 text-[#8a6d2f]"
                      aria-hidden="true"
                    />
                    <input
                      type="search"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      enterKeyHint="search"
                      autoComplete="off"
                      placeholder={t("mushaf:index.filter")}
                      aria-label={t("mushaf:index.filter")}
                      className="h-11 w-full rounded-full border-0 bg-[#fbf6ea] ps-11 pe-11 text-base text-[#1f1b14] shadow-inner outline-none placeholder:text-[#8a6d2f]/70 focus-visible:ring-2 focus-visible:ring-[#e6cd86]/60 [&::-webkit-search-cancel-button]:hidden"
                    />
                    {query && (
                      <button
                        type="button"
                        onClick={() => setQuery("")}
                        className="absolute end-1.5 top-1/2 flex size-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-[#8a6d2f] transition-colors hover:bg-[#8a6d2f]/10"
                        aria-label={t("mushaf:index.clear")}
                        title={t("mushaf:index.clear")}
                      >
                        <X className="size-4" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {active === "surahs" && (
              <div key="surahs" ref={centerCurrent} className={listClass}>
                {surahs.length === 0 ? (
                  <p className="px-6 py-14 text-center text-[#8a6d2f] dark:text-[#cdb26a]">{t("mushaf:index.noMatch")}</p>
                ) : (
                  <ul className={listInner}>
                    {surahs.map((chapter, position) => {
                      const isCurrent = chapter.id === currentSurah;
                      const place = chapter.revelation_place
                        ? t(chapter.revelation_place === "madinah" ? "mushaf:index.madinah" : "mushaf:index.makkah")
                        : null;
                      return (
                        <li key={chapter.id} className={listRow}>
                          <button
                            type="button"
                            onClick={() => onOpenPage(chapter.pages[0])}
                            aria-current={isCurrent ? "true" : undefined}
                            className={cn(rowButton, isCurrent && currentRow)}
                            style={ripple(position, currentSurahRow)}
                          >
                            <StarNumber value={chapter.id} active={isCurrent} />
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-2">
                                <span className="truncate text-[17px] leading-snug font-semibold text-[#0d3429] dark:text-[#efe5c8]">
                                  {surahName(chapter)}
                                </span>
                                {isCurrent && <CurrentBadge />}
                              </span>
                              <span className="mt-1 block truncate text-[13px] leading-snug text-[#8a6d2f] dark:text-[#cdb26a]/80">
                                {language !== "ar" && (
                                  <>
                                    {chapter.name_arabic}
                                    <span className="mx-1.5 opacity-50" aria-hidden="true">·</span>
                                  </>
                                )}
                                {place && (
                                  <>
                                    {place}
                                    <span className="mx-1.5 opacity-50" aria-hidden="true">·</span>
                                  </>
                                )}
                                {t("mushaf:index.verses", { count: chapter.verses_count })}
                              </span>
                            </span>
                            <PageNumber page={chapter.pages[0]} />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}

            {active === "juz" && (
              <div key="juz" ref={centerCurrent} className={listClass}>
                <ul className={listInner}>
                  {juzStarts(index).map((start) => {
                    const isCurrent = start.juz === currentJuz;
                    return (
                      <li key={start.juz} className={listRow}>
                        <button
                          type="button"
                          onClick={() => onOpenPage(start.page)}
                          aria-current={isCurrent ? "true" : undefined}
                          className={cn(rowButton, isCurrent && currentRow)}
                          style={ripple(start.juz - 1, currentJuz - 1)}
                        >
                          <StarNumber value={start.juz} active={isCurrent} />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2">
                              <span className="truncate text-[17px] leading-snug font-semibold text-[#0d3429] dark:text-[#efe5c8]">
                                {t("mushaf:landscape.juz", { juz: start.juz })}
                              </span>
                              {isCurrent && <CurrentBadge />}
                            </span>
                            <span className="mt-1 block truncate text-[13px] leading-snug text-[#8a6d2f] dark:text-[#cdb26a]/80">
                              {t("mushaf:landscape.juzStart", {
                                surah: surahName(chapters.find((c) => c.id === start.surah)),
                                ayah: start.ayah,
                              })}
                            </span>
                          </span>
                          <PageNumber page={start.page} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {active === "bookmarks" && (
              <div key="bookmarks" className={listClass}>
                {bookmarks.bookmarks.length === 0 ? (
                  <div className="mushaf-index-row mx-auto flex max-w-sm flex-col items-center gap-3 px-6 py-14 text-center">
                    <span className="flex size-14 items-center justify-center rounded-full bg-[#b8912e]/12 text-[#8a6d2f] dark:text-[#cdb26a]">
                      <Bookmark className="size-6" />
                    </span>
                    <p className="text-lg font-semibold text-[#0d3429] dark:text-[#efe5c8]">{t("mushaf:bookmarks.empty")}</p>
                    <p className="leading-relaxed text-[#8a6d2f] dark:text-[#cdb26a]/80">{t("mushaf:bookmarks.emptyHint")}</p>
                  </div>
                ) : (
                  <ul className={cn(listInner, "lg:max-w-3xl lg:grid-cols-1 xl:grid-cols-1")}>
                    {bookmarks.bookmarks.map(({ page, savedAt }, position) => {
                      // The surah the page begins with
                      const chapter = chapters.find((c) => c.id === index.pageInfo[page - 1]?.[0]);
                      return (
                        <li key={page} className={cn(listRow, "flex items-center gap-1")}>
                          <button
                            type="button"
                            onClick={() => onOpenPage(page)}
                            className={cn(rowButton, "min-w-0 flex-1")}
                            style={ripple(position, 0)}
                          >
                            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#b8912e]/12 text-[#8a6d2f] dark:text-[#cdb26a]">
                              <Bookmark className="size-5" fill="currentColor" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[17px] leading-snug font-semibold text-[#0d3429] dark:text-[#efe5c8]">
                                {surahName(chapter)}
                              </span>
                              <span className="mt-1 block truncate text-[13px] leading-snug text-[#8a6d2f] dark:text-[#cdb26a]/80">
                                {formatDate(new Date(savedAt).toISOString(), language)}
                              </span>
                            </span>
                            <PageNumber page={page} />
                          </button>
                          <button
                            type="button"
                            onClick={() => bookmarks.remove(page)}
                            className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full text-[#8a6d2f] transition-colors hover:bg-[#8a6d2f]/10 dark:text-[#cdb26a]"
                            aria-label={t("mushaf:bookmarks.removePage", { page })}
                            title={t("mushaf:bookmarks.removePage", { page })}
                          >
                            <X className="size-4" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}

            {/* The mushaf without internet: what is on this device, and the full download */}
            {offline.supported && (
              <div className="shrink-0 border-t border-[#b8912e]/20 bg-paper-bar pb-[env(safe-area-inset-bottom)] dark:border-[#cdb26a]/15">
                <div className="mx-auto w-full max-w-5xl py-2 pl-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] [@media(max-height:30rem)]:py-1">
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      setOfflineOpen(true);
                    }}
                    className="flex w-full cursor-pointer items-center gap-3.5 rounded-2xl px-3 py-2.5 text-start transition-colors hover:bg-[#b8912e]/8"
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#0d3429] text-[#e6cd86] dark:bg-[#cdb26a] dark:text-[#0d3429]">
                      {offline.complete ? <CheckCircle2 className="size-5" /> : <CloudDownload className="size-5" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-[#0d3429] dark:text-[#efe5c8]">{t("mushaf:offline.title")}</span>
                      {offlineStatus && (
                        <span className="block truncate text-[13px] text-[#8a6d2f] dark:text-[#cdb26a]/80">{offlineStatus}</span>
                      )}
                    </span>
                  </button>
                </div>
              </div>
            )}
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      <OfflineMushafSheet open={offlineOpen} onOpenChange={setOfflineOpen} />
    </>
  );
}
