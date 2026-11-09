import { useCallback, useEffect, useRef, useState } from "react";
import { Swiper, SwiperSlide } from "swiper/react";
import { Keyboard, Virtual } from "swiper/modules";
import type { Swiper as SwiperClass } from "swiper/types";
import "swiper/css";
import "swiper/css/virtual";

import { ChevronLeft, ChevronRight, RotateCw, WifiOff } from "lucide-react";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/cn";
import { Button, FullScreenLoader } from "@/ui";
import { getChapters, TOTAL_PAGES, type Chapter } from "@/lib/quranData";
import { useScreenWakeLock } from "@/hooks/useScreenWakeLock";
import { updateSettings, useSettings, type ViewMode } from "@/settings/store";
import { SettingsSheet } from "@/settings/SettingsSheet";
import { LogoMark } from "@/brand/Logo";

import type { MushafIndex, MushafWord } from "./types";
import { getMushafIndex, resolveTargetPage, type SearchResult } from "./utils/mushafData";
import { prefetchAround } from "./hooks/usePageData";
import { useIsDesktop } from "./hooks/useIsDesktop";
import { usePrefersReducedMotion } from "./hooks/usePrefersReducedMotion";
import { usePhoneLandscape } from "./hooks/usePhoneLandscape";
import { useNetworkToasts } from "./hooks/useNetworkToasts";
import { MushafHeader } from "./components/MushafHeader";
import { QuranPageView } from "./components/QuranPageView";
import { MushafScrollView, type MushafScrollHandle } from "./components/MushafScrollView";
import { MushafBookView, type MushafBookHandle } from "./components/MushafBookView";
import { MushafLandscapeView, type MushafLandscapeHandle } from "./components/MushafLandscapeView";
import { LandscapeMushafChrome } from "./components/LandscapeMushafChrome";
import { isFirstSpread, isLastSpread, spreadOf } from "./utils/bookSpreads";
import { MushafIndexScreen, type MushafIndexTab } from "./components/MushafIndexScreen";
import { SearchDialog } from "./components/SearchDialog";
import { useMushafAudio } from "./audio/useMushafAudio";
import { ListenSheet, type ListenOption } from "./audio/ListenSheet";
import { AyahActionsSheet, type PickedAyah } from "./components/AyahActionsSheet";
import { AudioPlayerBar } from "./audio/AudioPlayerBar";
import { pageBounds, rangeOfPages, type AudioItem } from "./audio/audioQueue";
import { updateDownloadedMushafIfDue } from "./offline/offlineDownloads";
import { OfflineMushafSheet } from "./offline/OfflineMushafSheet";

const PAGES = Array.from({ length: TOTAL_PAGES }, (_, i) => i + 1);
const FLASH_DURATION_MS = 2600;
/** Holding a word this long picks its ayah (listen to it alone, or share it as a picture) */
const AYAH_PRESS_MS = 450;

/** localStorage key holding the last visited page (resume position) */
const LAST_PAGE_KEY = "quran-libary:last-page";

const readLastPage = (): number | null => {
  try {
    const saved = Number(localStorage.getItem(LAST_PAGE_KEY));
    return Number.isInteger(saved) && saved >= 1 && saved <= TOTAL_PAGES ? saved : null;
  } catch {
    return null;
  }
};

/**
 * The mushaf: the 1421H Madinah print drawn with the King Fahd Complex page fonts, as in the Hafiz app.
 *
 * - A desktop (1024px and wider) reads the open book: two pages at the spine and a 3D page turn (MushafBookView).
 * - A phone held upright swipes one page at a time (Swiper, RTL) or scrolls them (MushafScrollView); held sideways it
 *   scrolls every page across the full width, like the Golden Mushaf (MushafLandscapeView).
 * - On a phone the bars hide to leave the page alone; a tap brings them back.
 * - Index, search, reciters, a long press on an ayah to hear or share it, bookmarks, the reader's settings, the
 *   whole mushaf offline on request. No account and no server of its own: the files are static (src/config.ts).
 */
export default function MushafPage() {
  const { t, language } = useI18n();
  const settings = useSettings();
  const viewMode = settings.viewMode;
  // A phone turned sideways reads one long scroll (MushafLandscapeView), never the open book, however wide it is
  const phoneLandscape = usePhoneLandscape();
  const isDesktop = useIsDesktop() && !phoneLandscape;
  const systemReducedMotion = usePrefersReducedMotion();
  // The reader's own "page-turn animation" switch joins the system's "reduce motion"
  const reducedMotion = systemReducedMotion || !settings.pageTurn;
  // The screen stays on as long as the mushaf is open (a phone on the table during a recitation), unless turned off
  useScreenWakeLock(settings.keepAwake);
  useNetworkToasts();

  const [index, setIndex] = useState<MushafIndex | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  /** Resolved BEFORE Swiper mounts so initialSlide always opens the right page */
  const [initialPage, setInitialPage] = useState<number | null>(null);
  const [activePage, setActivePage] = useState(1);
  const [swiper, setSwiper] = useState<SwiperClass | null>(null);
  const scrollView = useRef<MushafScrollHandle>(null);
  const bookView = useRef<MushafBookHandle>(null);
  const landscapeView = useRef<MushafLandscapeHandle>(null);
  // The surah at the reading position of the sideways view (its header chip)
  const [readingSurah, setReadingSurah] = useState<number | null>(null);
  // Laptops and desktops read the open book, two pages at a time; phones swipe one page
  const showsBook = isDesktop && viewMode === "swipe";
  // The book or the swiped pages (with the arrows on a wide screen), not one of the two scrolling views
  const swipesPages = viewMode === "swipe" && !phoneLandscape;

  // Crossing the desktop width (a window resized, a tablet turned) swaps the book and the phone pages, and turning a
  // phone swaps its pages and the sideways scroll: the new view opens where the reader is.
  const layout = phoneLandscape ? "landscape" : isDesktop ? "desktop" : "phone";
  const [shownLayout, setShownLayout] = useState(layout);
  if (shownLayout !== layout) {
    setShownLayout(layout);
    if (initialPage !== null) {
      setInitialPage(activePage);
      setSwiper(null);
    }
  }

  // Pages (and their fonts) fetched ahead: the neighbours of a phone page, or both spreads around the open book
  const warmPagesAround = (page: number) => (showsBook ? prefetchAround(page, 3, 3) : prefetchAround(page));
  useEffect(() => {
    if (initialPage !== null) warmPagesAround(activePage);
    // Only when the view changes between the book and single pages
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showsBook]);

  // The next visit resumes here. Written on every page change, once the real starting page is known.
  useEffect(() => {
    if (initialPage === null) return;
    try {
      localStorage.setItem(LAST_PAGE_KEY, String(activePage));
    } catch {
      // private mode: no resume
    }
  }, [activePage, initialPage]);

  // The index screen and the tab it opens on (null: closed)
  const [indexTab, setIndexTab] = useState<MushafIndexTab | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [offlineOpen, setOfflineOpen] = useState(false);
  const [flashAyah, setFlashAyah] = useState<{ surah: number; ayah: number } | null>(null);
  const flashTimer = useRef<number | null>(null);
  // Phones: the bars are hidden to leave the page alone; a tap on the page shows them (always shown on a desktop)
  const [chromeVisible, setChromeVisible] = useState(false);

  // Nothing of the mushaf downloads by itself (a page is kept when opened); only a mushaf the reader downloaded is
  // checked and completed, on the schedule they chose in the offline sheet, a moment after it opens
  useEffect(() => {
    const timer = window.setTimeout(() => void updateDownloadedMushafIfDue().catch(() => undefined), 3000);
    return () => window.clearTimeout(timer);
  }, []);

  // ------- Static lookups: index + chapter names -------
  useEffect(() => {
    let cancelled = false;
    setLoadFailed(false);
    Promise.all([getMushafIndex(), getChapters()])
      .then(([indexData, chaptersData]) => {
        if (cancelled) return;
        setChapters(chaptersData);
        setIndex(indexData);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  // ------- Resolve the initial page BEFORE mounting Swiper: ?page=, ?surah=&ayah=, else where the reader was -------
  useEffect(() => {
    if (initialPage !== null || !index) return;
    const params = new URLSearchParams(window.location.search);
    const page =
      params.get("page") || params.get("surah")
        ? resolveTargetPage(index, { page: params.get("page"), surah: params.get("surah"), ayah: params.get("ayah") })
        : (readLastPage() ?? 1);
    setInitialPage(page);
    setActivePage(page);
    warmPagesAround(page);
    // The address is read once, for the starting position only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, initialPage]);

  // ------- Navigation helpers -------
  const goToPage = useCallback(
    (page: number) => {
      if (phoneLandscape) landscapeView.current?.scrollToPage(page);
      else if (viewMode === "scroll") scrollView.current?.scrollToPage(page);
      else if (showsBook) bookView.current?.goToPage(page);
      else swiper?.slideTo(page - 1);
    },
    [swiper, viewMode, showsBook, phoneLandscape],
  );

  const turnNext = () => (showsBook ? bookView.current?.next() : swiper?.slideNext());
  const turnPrev = () => (showsBook ? bookView.current?.prev() : swiper?.slidePrev());
  const atFirstPage = showsBook ? isFirstSpread(spreadOf(activePage)) : (swiper?.isBeginning ?? false);
  const atLastPage = showsBook ? isLastSpread(spreadOf(activePage)) : (swiper?.isEnd ?? false);

  // The view being switched to mounts fresh, so it opens at the page the reader is on right now.
  const changeViewMode = (mode: ViewMode) => {
    if (mode === viewMode) return;
    setInitialPage(activePage);
    setSwiper(null);
    updateSettings({ viewMode: mode });
  };
  // A change made in the settings sheet goes through the same door
  const [shownViewMode, setShownViewMode] = useState(viewMode);
  if (shownViewMode !== viewMode) {
    setShownViewMode(viewMode);
    if (initialPage !== null) {
      setInitialPage(activePage);
      setSwiper(null);
    }
  }

  const handlePageChange = (page: number) => {
    setActivePage(page);
    warmPagesAround(page);
  };

  const flash = (surah: number, ayah: number) => {
    setFlashAyah({ surah, ayah });
    if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlashAyah(null), FLASH_DURATION_MS);
  };

  const handleSearchSelect = (result: SearchResult) => {
    if (!index) return;
    const page = index.ayahPages[String(result.surah)]?.[result.ayah - 1];
    setSearchOpen(false);
    if (!page) return;
    goToPage(page);
    // Reached the page they searched for: show it clean, no dimmed chrome over it.
    setChromeVisible(false);
    flash(result.surah, result.ayah);
  };

  useEffect(
    () => () => {
      if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    },
    [],
  );

  // ------- Listening to the reciters -------
  const [listenOpen, setListenOpen] = useState(false);
  const describeAyah = useCallback(
    (item: AudioItem) => {
      const chapter = chapters.find((c) => c.id === item.surah);
      const surah = chapter ? (language === "ar" ? chapter.name_arabic : chapter.name_simple) : "";
      return item.ayah === 0
        ? t("mushaf:audio.basmala", { surah })
        : t("mushaf:audio.ayah", { surah, ayah: item.ayah });
    },
    [chapters, language, t],
  );
  const followReciter = useRef(settings.followReciter);
  followReciter.current = settings.followReciter;
  const audio = useMushafAudio({
    mushaf: index,
    chapters,
    // Sideways the view scrolls to the ayah being read itself (readingAyah), not to the top of its page
    onPageReached: (page) => {
      if (!phoneLandscape && followReciter.current) goToPage(page);
    },
    describe: describeAyah,
    album: t("common:appName"),
    language,
  });

  // Listening is immersive like reading: once a recitation actually starts, the chrome (header + player bar) slides
  // away on a phone so only the Quran and the recited-ayah band remain; a tap on the page brings the controls back.
  useEffect(() => {
    if (!isDesktop && settings.immersiveListening && audio.snapshot.status === "playing") setChromeVisible(false);
  }, [isDesktop, settings.immersiveListening, audio.snapshot.status]);

  // ------- A long press on an ayah offers to hear it alone, or share it as a picture -------
  const [pickedAyah, setPickedAyah] = useState<PickedAyah | null>(null);
  const handleAyahPress = useCallback((word: MushafWord, _element: HTMLElement, page: number) => {
    if ("vibrate" in navigator) navigator.vibrate(12);
    setPickedAyah({ surah: word.surah, ayah: word.ayah, page });
  }, []);

  // ------- Render -------
  if (loadFailed) {
    const offline = !navigator.onLine;
    return (
      <div className="flex h-dvh items-center justify-center bg-background p-6">
        <div className="offline-state flex max-w-sm flex-col items-center gap-4 text-center">
          <span className="flex size-16 items-center justify-center rounded-full bg-brand-ink">
            {offline ? (
              <WifiOff className="size-7 text-[#e6cd86]" aria-hidden="true" />
            ) : (
              <LogoMark tone="onDark" className="h-7" />
            )}
          </span>
          <h1 className="text-xl font-semibold">
            {offline ? t("common:network.offlineTitle") : t("mushaf:failedToLoadTitle")}
          </h1>
          <p className="text-muted-foreground">{offline ? t("mushaf:offlineFirstOpen") : t("mushaf:failedToLoadMessage")}</p>
          <Button
            size="lg"
            onClick={() => {
              setInitialPage(null);
              setReloadKey((k) => k + 1);
            }}
          >
            <RotateCw className="size-4" aria-hidden="true" />
            {t("common:offlineState.retry")}
          </Button>
        </div>
      </div>
    );
  }

  if (!index || initialPage === null) return <FullScreenLoader />;

  // What the listen sheet offers: the page in view, its surah, everything from here on
  const listenOptions: ListenOption[] = [];
  const pageRange = rangeOfPages(index, activePage, activePage);
  if (pageRange) {
    const surah = chapters.find((c) => c.id === pageRange.from.surah);
    listenOptions.push({
      key: "page",
      label: t("mushaf:audio.thisPage"),
      detail: t("mushaf:audio.pageNumber", { page: activePage }),
      range: pageRange,
    });
    if (surah) {
      listenOptions.push({
        key: "surah",
        label: t("mushaf:audio.wholeSurah", { surah: language === "ar" ? surah.name_arabic : surah.name_simple }),
        detail: t("mushaf:index.verses", { count: surah.verses_count }),
        range: { from: { surah: surah.id, ayah: 1 }, to: { surah: surah.id, ayah: surah.verses_count } },
      });
    }
    listenOptions.push({
      key: "fromHere",
      label: t("mushaf:audio.fromHere"),
      range: { from: pageRange.from, to: { surah: 114, ayah: 6 } },
    });
  }

  const renderPage = (page: number) => (
    <QuranPageView
      page={page}
      chapters={chapters}
      index={index}
      onWordSelect={handleAyahPress}
      longPressMs={AYAH_PRESS_MS}
      flashAyah={flashAyah}
    />
  );

  const chromeShown = isDesktop || chromeVisible;

  return (
    // On a desktop the open book lies on a quiet table: the cream with the faint star ornament of the identity
    <div className={cn("relative flex h-dvh flex-col bg-background", showsBook && "mushaf-table")}>
      {phoneLandscape ? (
        <LandscapeMushafChrome
          visible={chromeVisible}
          page={activePage}
          surah={readingSurah}
          index={index}
          chapters={chapters}
          onOpenIndex={(tab) => setIndexTab(tab)}
          onOpenSearch={() => setSearchOpen(true)}
          onOpenListen={() => setListenOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      ) : (
        <MushafHeader
          visible={chromeShown}
          viewMode={viewMode}
          onViewModeChange={changeViewMode}
          onOpenIndex={() => setIndexTab("surahs")}
          onOpenSearch={() => setSearchOpen(true)}
          onOpenListen={() => setListenOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
          page={activePage}
          book={showsBook}
          index={index}
          chapters={chapters}
        />
      )}

      {/* Phone (either orientation): while the chrome shows (z-40 and up), a soft scrim grounds the bars at the top
          and bottom — the Golden Mushaf's look — while the ayat in the middle stay clear (a mask lifts the dim off the
          centre). No blur at all, only a gentle dim. It takes no touch: a tap still reaches the page (hiding the
          chrome) and a swipe still turns it. */}
      {!isDesktop && (
        <div
          aria-hidden="true"
          className={cn(
            "pointer-events-none fixed inset-0 z-30 bg-[#1f1b14]/22 transition-[opacity,visibility] duration-300 ease-out motion-reduce:transition-none dark:bg-black/45",
            "[mask-image:linear-gradient(to_bottom,black_0%,black_16%,transparent_37%,transparent_63%,black_80%,black_100%)]",
            "[-webkit-mask-image:linear-gradient(to_bottom,black_0%,black_16%,transparent_37%,transparent_63%,black_80%,black_100%)]",
            chromeVisible ? "visible opacity-100" : "invisible opacity-0",
          )}
        />
      )}

      {/* dir="ltr" pins the arrows to PHYSICAL sides regardless of UI language: the mushaf itself is always RTL, so
          the next page is always to the left and the previous page always to the right. As flex siblings the
          buttons live outside the page cards and can never overlap them. */}
      <div
        dir="ltr"
        className={cn("flex min-h-0 w-full flex-1 items-center justify-center", swipesPages && "lg:gap-2 lg:px-3")}
      >
        <Button
          variant="outline"
          size="icon"
          className={cn("mushaf-turn-button hidden shrink-0 rounded-full", swipesPages && "lg:inline-flex")}
          onClick={turnNext}
          disabled={atLastPage}
          aria-label={t("common:next")}
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>

        {/* Phone: a tap on the page toggles the header and the player bar (always visible on a desktop). A long press
            swallows its own click, and neither a swipe nor a scroll produces a click. */}
        <div className={cn("relative mx-auto min-h-0 w-full flex-1 self-stretch", swipesPages && "max-w-[980px]")}>
          <div className="h-full" onClick={!isDesktop ? () => setChromeVisible((v) => !v) : undefined}>
            {phoneLandscape ? (
              <MushafLandscapeView
                ref={landscapeView}
                initialPage={initialPage}
                index={index}
                onPageChange={handlePageChange}
                onSurahChange={setReadingSurah}
                renderPage={renderPage}
                readingAyah={audio.snapshot.status === "idle" || !settings.followReciter ? null : audio.snapshot.item}
                focusAyah={flashAyah}
                chromeVisible={chromeVisible}
                onChromeVisibleChange={setChromeVisible}
              />
            ) : viewMode === "scroll" ? (
              <MushafScrollView
                ref={scrollView}
                initialPage={initialPage}
                onPageChange={handlePageChange}
                renderPage={renderPage}
              />
            ) : showsBook ? (
              <MushafBookView
                ref={bookView}
                initialPage={initialPage}
                onPageChange={handlePageChange}
                renderPage={renderPage}
                animated={settings.pageTurn}
              />
            ) : (
              <Swiper
                key={reducedMotion ? "still" : "moving"}
                dir="rtl"
                className="mushaf-swiper h-full"
                modules={[Virtual, Keyboard]}
                virtual={{ addSlidesBefore: 1, addSlidesAfter: 1 }}
                keyboard
                slidesPerView={1}
                speed={reducedMotion ? 0 : 300}
                initialSlide={activePage - 1}
                onSwiper={setSwiper}
                onSlideChange={(s) => handlePageChange(s.activeIndex + 1)}
              >
                {PAGES.map((page, i) => (
                  <SwiperSlide key={page} virtualIndex={i}>
                    {renderPage(page)}
                  </SwiperSlide>
                ))}
              </Swiper>
            )}
          </div>
        </div>

        <Button
          variant="outline"
          size="icon"
          className={cn("mushaf-turn-button hidden shrink-0 rounded-full", swipesPages && "lg:inline-flex")}
          onClick={turnPrev}
          disabled={atFirstPage}
          aria-label={t("common:previous")}
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      <MushafIndexScreen
        tab={indexTab}
        onClose={() => setIndexTab(null)}
        index={index}
        chapters={chapters}
        currentPage={activePage}
        onOpenPage={(page) => {
          setIndexTab(null);
          goToPage(page);
          // Landed on the chosen surah / juz / bookmark: show it clean, with no dimmed chrome over it.
          setChromeVisible(false);
        }}
      />

      <SearchDialog
        open={searchOpen}
        onOpenChange={setSearchOpen}
        chapters={chapters}
        onSelect={handleSearchSelect}
        onSurahSelect={(chapter) => {
          setSearchOpen(false);
          goToPage(chapter.pages[0]);
          setChromeVisible(false);
        }}
      />

      <ListenSheet
        open={listenOpen}
        onOpenChange={setListenOpen}
        audio={audio}
        options={listenOptions}
        chapters={chapters}
        currentSurah={pageBounds(index).get(activePage)?.from.surah ?? 1}
        isDesktop={isDesktop}
      />

      <AyahActionsSheet
        picked={pickedAyah}
        onClose={() => setPickedAyah(null)}
        audio={audio}
        chapters={chapters}
        isDesktop={isDesktop}
      />

      <SettingsSheet
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        audio={audio}
        isDesktop={isDesktop}
        onOpenOffline={() => {
          setSettingsOpen(false);
          setOfflineOpen(true);
        }}
      />

      <OfflineMushafSheet open={offlineOpen} onOpenChange={setOfflineOpen} />

      <AudioPlayerBar audio={audio} describe={describeAyah} visible={chromeShown} raised={false} />
    </div>
  );
}
