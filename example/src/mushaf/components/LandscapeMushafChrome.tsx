import { Bookmark, ChevronDown, Headphones, LayoutGrid, Search, Settings2 } from "lucide-react";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/cn";
import type { Chapter } from "@/lib/quranData";
import type { MushafIndex } from "../types";
import { hizbPositionOfPage } from "../utils/hizbQuarters";
import { HizbLabel } from "./MushafLandscapeView";
import { usePageBookmark } from "../hooks/useMushafBookmarks";
import type { MushafIndexTab } from "./MushafIndexScreen";

interface LandscapeMushafChromeProps {
  /** Hidden while the reader scrolls, shown again by a tap on the page */
  visible: boolean;
  page: number;
  /** The surah at the reading position (MushafLandscapeView); the page's first surah until it is known */
  surah: number | null;
  index: MushafIndex;
  chapters: Chapter[];
  /** Opens the index screen on a tab: the surah chip and the index button on the surahs, the juz chip on the juz */
  onOpenIndex: (tab: MushafIndexTab) => void;
  onOpenSearch: () => void;
  onOpenListen: () => void;
  /** The reader's settings (day / night, page colour, language …) */
  onOpenSettings: () => void;
}

const iconButton =
  "flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-[#8a6d2f] transition-colors hover:bg-[#8a6d2f]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b8912e]/45 dark:text-[#cdb26a] dark:hover:bg-[#cdb26a]/10";
const chip =
  "flex h-8 min-w-0 shrink cursor-pointer items-center gap-1 rounded-full border border-[#b8912e]/30 bg-[#b8912e]/10 ps-3 pe-2 text-[#6f5622] transition-colors hover:bg-[#b8912e]/20 dark:border-[#cdb26a]/25 dark:bg-[#cdb26a]/10 dark:text-[#e2cd94]";

/**
 * The slim header and footer of the sideways mushaf, like the mushaf apps: the surah and the juz as chips that open
 * their index, the index, search and listen in the middle, the page and the quarter of the hizb at the bottom. Both
 * slide away while the reader scrolls (MushafLandscapeView) and come back with a tap.
 */
export function LandscapeMushafChrome({
  visible,
  page,
  surah,
  index,
  chapters,
  onOpenIndex,
  onOpenSearch,
  onOpenListen,
  onOpenSettings,
}: LandscapeMushafChromeProps) {
  const { t, language } = useI18n();

  const surahNumber = surah ?? index.pageInfo[page - 1]?.[0] ?? 1;
  const chapter = chapters.find((c) => c.id === surahNumber);
  const surahName = chapter ? (language === "ar" ? chapter.name_arabic : chapter.name_simple) : "";
  // The juz of the hizb the page shows, so the header and the footer never disagree (a juz can begin mid-page)
  const juz = Math.ceil(hizbPositionOfPage(page, index).hizb / 2);
  const juzLabel = t("mushaf:landscape.juz", { juz });
  const bookmark = usePageBookmark([page], page);
  const bookmarkLabel = bookmark.marked ? t("mushaf:bookmarks.remove") : t("mushaf:bookmarks.add");

  return (
    <>
      <header
        className={cn(
          "fixed inset-x-0 top-0 z-40 flex h-11 items-center gap-1 border-b border-[#b8912e]/20 bg-paper/92 shadow-sm backdrop-blur transition-transform duration-300 ease-out dark:border-[#cdb26a]/15",
          // A phone on its side has the notch / rounded corners on the left and right
          "pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))]",
          visible ? "translate-y-0" : "-translate-y-full shadow-none",
        )}
        aria-hidden={!visible}
        inert={!visible}
      >
        <div className="flex min-w-0 flex-1 items-center">
          <button
            type="button"
            className={chip}
            onClick={() => onOpenIndex("surahs")}
            aria-label={t("mushaf:landscape.openSurahIndex", { surah: surahName })}
          >
            <span className="truncate">{surahName}</span>
            <ChevronDown className="size-4 shrink-0 opacity-70" aria-hidden="true" />
          </button>
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <button type="button" className={iconButton} onClick={() => onOpenIndex("surahs")} aria-label={t("mushaf:surahIndex")} title={t("mushaf:surahIndex")}>
            <LayoutGrid className="size-5" />
          </button>
          <button type="button" className={iconButton} onClick={onOpenSearch} aria-label={t("mushaf:search")} title={t("mushaf:search")}>
            <Search className="size-5" />
          </button>
          <button type="button" className={iconButton} onClick={onOpenListen} aria-label={t("mushaf:audio.listen")} title={t("mushaf:audio.listen")}>
            <Headphones className="size-5" />
          </button>
        </div>

        <div className="flex min-w-0 flex-1 items-center justify-end gap-1">
          <button
            type="button"
            className={chip}
            onClick={() => onOpenIndex("juz")}
            aria-label={t("mushaf:landscape.openJuzIndex", { juz: juzLabel })}
          >
            <span className="truncate">{juzLabel}</span>
            <ChevronDown className="size-4 shrink-0 opacity-70" aria-hidden="true" />
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
      </header>

      <div
        className={cn(
          "pointer-events-none fixed bottom-[max(0.5rem,env(safe-area-inset-bottom))] z-30 transition-[translate,opacity] duration-300 ease-out",
          "end-[max(0.75rem,env(safe-area-inset-right))] rtl:end-[max(0.75rem,env(safe-area-inset-left))]",
          visible ? "translate-y-0 opacity-100" : "translate-y-[150%] opacity-0",
        )}
        aria-hidden={!visible}
      >
        <span className="flex h-7 items-center gap-1.5 rounded-full border border-[#b8912e]/30 bg-paper/95 px-3 text-sm text-[#6f5622] shadow-sm backdrop-blur dark:border-[#cdb26a]/25 dark:bg-paper-bar/95 dark:text-[#e2cd94]">
          <span className="tabular-nums">{page}</span>
          <span aria-hidden="true">·</span>
          <HizbLabel page={page} index={index} />
        </span>
      </div>
    </>
  );
}
