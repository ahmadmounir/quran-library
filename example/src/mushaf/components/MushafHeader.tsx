import { BookOpen, Bookmark, Headphones, ScrollText, Search, Settings2 } from "lucide-react";
import { LogoMark } from "@/brand/Logo";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/cn";
import type { Chapter } from "@/lib/quranData";
import type { MushafIndex, MushafViewMode } from "../types";
import { mushafDownload } from "../offline/offlineDownloads";
import { useOfflineDownload } from "../offline/useOfflineDownload";
import { usePageBookmark } from "../hooks/useMushafBookmarks";
import { pagesOfSpread, spreadOf } from "../utils/bookSpreads";
import { hizbPositionOfPage } from "../utils/hizbQuarters";

const VIEW_MODES = [
  { mode: "swipe", icon: BookOpen, labelKey: "mushaf:viewModeSwipe" },
  { mode: "scroll", icon: ScrollText, labelKey: "mushaf:viewModeScroll" },
] as const;

// The same paper and gold as the sideways mushaf's header (LandscapeMushafChrome), so the two read as one design
const iconButton =
  "flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-[#8a6d2f] transition-colors hover:bg-[#8a6d2f]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b8912e]/40 dark:text-[#cdb26a] dark:hover:bg-[#cdb26a]/10";

interface MushafHeaderProps {
  /** Mobile immersive mode: hidden by default, slides down when toggled. Always visible on desktop. */
  visible: boolean;
  viewMode: MushafViewMode;
  onViewModeChange: (mode: MushafViewMode) => void;
  onOpenIndex: () => void;
  onOpenSearch: () => void;
  /** Opens "listen to the recitation" */
  onOpenListen: () => void;
  /** The reader's settings: day / night, the page colour, the language … */
  onOpenSettings: () => void;
  /** The reader's page (the title and the bookmark button) */
  page: number;
  /** The open book: its bookmark button stands for both pages of the spread */
  book: boolean;
  index: MushafIndex;
  chapters: Chapter[];
}

/**
 * The mushaf's header: one bar (4rem) of a warmer paper than the page, with a gold hairline and a soft shadow so it
 * stands apart from the page under it. At the start, where the reader is (the surah, the juz and the page), which
 * opens the index; at the end, icon buttons for the way pages turn, search, listening, the bookmark and the settings.
 * On a desktop the mark «صوت المصحف» leads, the search is a wide field and both ways of turning pages show. While the
 * mushaf downloads to the device, a thin gold line along the bottom fills up.
 */
export function MushafHeader({
  visible,
  viewMode,
  onViewModeChange,
  onOpenIndex,
  onOpenSearch,
  onOpenListen,
  onOpenSettings,
  page,
  book,
  index,
  chapters,
}: MushafHeaderProps) {
  const { t, language } = useI18n();
  const bookmark = usePageBookmark(book ? pagesOfSpread(spreadOf(page)) : [page], page);
  const bookmarkLabel = bookmark.marked ? t("mushaf:bookmarks.remove") : t("mushaf:bookmarks.add");

  const surahNumber = index.pageInfo[page - 1]?.[0] ?? 1;
  const chapter = chapters.find((c) => c.id === surahNumber);
  const surahName = chapter ? (language === "ar" ? chapter.name_arabic : chapter.name_simple) : "";
  // The juz of the hizb the page shows, as the sideways header counts it (a juz can begin mid-page)
  const juz = Math.ceil(hizbPositionOfPage(page, index).hizb / 2);

  // The mushaf downloading to this device (by itself or on request); the index drawer shows the details
  const offline = useOfflineDownload(mushafDownload);
  const downloadPercent =
    offline.downloading && offline.progress
      ? Math.min(100, Math.round((offline.progress.done / Math.max(1, offline.progress.total)) * 100))
      : null;

  const otherMode = VIEW_MODES.find((m) => m.mode !== viewMode) ?? VIEW_MODES[0];
  const OtherModeIcon = otherMode.icon;

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-40 flex h-16 shrink-0 items-center gap-2 border-b border-[#b8912e]/35 bg-paper-bar/95 ps-3 pe-2 shadow-[0_10px_28px_-14px_rgba(13,52,41,0.5)] backdrop-blur-md transition-transform duration-300 ease-out",
        "dark:border-[#cdb26a]/20 dark:shadow-[0_10px_28px_-14px_rgba(0,0,0,0.9)]",
        "lg:relative lg:translate-y-0 lg:px-4 lg:shadow-none lg:backdrop-blur-none",
        // Hidden on a phone: no shadow left hanging over the top of the page
        visible ? "translate-y-0" : "-translate-y-full shadow-none",
      )}
      aria-hidden={!visible}
      inert={!visible}
    >
      {/* Desktop: the mark «صوت المصحف» (bars + gold spine) */}
      <span className="hidden shrink-0 items-center gap-3 ps-1 lg:flex" aria-hidden="true">
        <LogoMark className="h-7" />
        <span className="h-7 w-px bg-[#b8912e]/25 dark:bg-[#cdb26a]/20" />
      </span>

      {/* Where the reader is; opens the index */}
      <button
        type="button"
        onClick={onOpenIndex}
        className="flex min-w-0 shrink cursor-pointer flex-col justify-center rounded-xl px-2 py-1 text-start transition-colors hover:bg-[#8a6d2f]/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b8912e]/40"
        aria-label={t("mushaf:landscape.openSurahIndex", { surah: surahName })}
      >
        <span className="block truncate text-lg leading-snug font-semibold text-[#0d3429] dark:text-[#efe5c8]">
          {surahName}
        </span>
        <span className="block truncate text-xs leading-snug text-[#8a6d2f] dark:text-[#cdb26a]">
          {t("mushaf:landscape.juz", { juz })}
          <span className="mx-1.5 opacity-50" aria-hidden="true">
            ·
          </span>
          {t("mushaf:page")} <span className="tabular-nums">{page}</span>
        </span>
      </button>

      {/* Desktop: both ways of turning pages, side by side */}
      <div
        role="group"
        aria-label={t("mushaf:viewMode")}
        className="hidden shrink-0 items-center rounded-full border border-[#b8912e]/25 bg-[#b8912e]/8 p-0.5 lg:flex dark:border-[#cdb26a]/20"
      >
        {VIEW_MODES.map(({ mode, icon: Icon, labelKey }) => (
          <button
            key={mode}
            type="button"
            onClick={() => onViewModeChange(mode)}
            aria-pressed={viewMode === mode}
            aria-label={t(labelKey)}
            title={t(labelKey)}
            className={cn(
              "flex size-8 cursor-pointer items-center justify-center rounded-full transition-colors",
              viewMode === mode
                ? "bg-[#0d3429] text-[#e6cd86] shadow-sm dark:bg-[#cdb26a] dark:text-[#0d3429]"
                : "text-[#8a6d2f] hover:text-[#0d3429] dark:text-[#cdb26a] dark:hover:text-[#efe5c8]",
            )}
          >
            <Icon className="size-4" />
          </button>
        ))}
      </div>

      {/* Desktop: a wide search field in the middle */}
      <div className="hidden min-w-0 flex-1 justify-center lg:flex">
        <button
          type="button"
          onClick={onOpenSearch}
          className="flex w-full max-w-sm cursor-pointer items-center gap-2 rounded-full border border-[#b8912e]/25 bg-white/60 px-4 py-2 text-start text-[#6f5622]/80 transition-colors hover:bg-white dark:border-[#cdb26a]/20 dark:bg-white/5 dark:text-[#e2cd94]/70 dark:hover:bg-white/10"
        >
          <Search className="size-4 shrink-0" />
          <span className="truncate">{t("mushaf:searchButton")}</span>
        </button>
      </div>

      <div className="ms-auto flex shrink-0 items-center gap-0.5 lg:ms-0">
        {/* Phone: one button that switches to the other way of turning pages */}
        <button
          type="button"
          className={cn(iconButton, "lg:hidden")}
          onClick={() => onViewModeChange(otherMode.mode)}
          aria-label={t(otherMode.labelKey)}
          title={t(otherMode.labelKey)}
        >
          <OtherModeIcon className="size-5" />
        </button>
        <button
          type="button"
          className={cn(iconButton, "lg:hidden")}
          onClick={onOpenSearch}
          aria-label={t("mushaf:search")}
          title={t("mushaf:search")}
        >
          <Search className="size-5" />
        </button>
        <button
          type="button"
          className={iconButton}
          onClick={onOpenListen}
          aria-label={t("mushaf:audio.listen")}
          title={t("mushaf:audio.listen")}
        >
          <Headphones className="size-5" />
        </button>
        {bookmark.available && (
          <button
            type="button"
            className={iconButton}
            onClick={bookmark.toggle}
            aria-pressed={bookmark.marked}
            aria-label={bookmarkLabel}
            title={bookmarkLabel}
          >
            <Bookmark className="size-5" fill={bookmark.marked ? "currentColor" : "none"} />
          </button>
        )}
        <span className="mx-1 h-6 w-px bg-[#b8912e]/25 dark:bg-[#cdb26a]/20" aria-hidden="true" />
        <button
          type="button"
          className={iconButton}
          onClick={onOpenSettings}
          aria-label={t("settings:title")}
          title={t("settings:title")}
        >
          <Settings2 className="size-5" />
        </button>
      </div>

      {downloadPercent !== null && (
        <div
          className="absolute inset-x-0 bottom-0 h-0.5 bg-[#b8912e]/15"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={downloadPercent}
          aria-label={t("mushaf:offline.downloadingShort", { percent: downloadPercent })}
        >
          <div
            className="h-full bg-[#b8912e] transition-[width] duration-500 ease-out dark:bg-[#cdb26a]"
            style={{ width: `${downloadPercent}%` }}
          />
        </div>
      )}
    </header>
  );
}
