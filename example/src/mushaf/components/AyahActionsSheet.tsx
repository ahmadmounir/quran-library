import { useEffect, useState } from "react";
import { Download, Headphones, ImageIcon, Loader2, Share2 } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/ui";
import { showToast } from "@/ui/toast-config";
import { useI18n } from "@/i18n";
import { TOTAL_PAGES, type Chapter } from "@/lib/quranData";
import { textIn } from "../audio/audioCatalog";
import { useAyahBand } from "../audio/ayahBands";
import type { MushafAudio } from "../audio/useMushafAudio";
import { fetchMushafPage } from "../hooks/usePageData";
import { loadPageFont, pageFontFamily } from "../utils/mushafFonts";
import {
  arabicDigits,
  ayahImageName,
  ayahWords,
  continuesAfter,
  continuesFromBefore,
  quotedAyah,
  type PlacedWord,
} from "../utils/ayahShare";
import { renderAyahImage } from "../utils/ayahImage";

/** The ayah a long press picked, and the page it was pressed on. */
export interface PickedAyah {
  surah: number;
  ayah: number;
  page: number;
}

interface AyahActionsSheetProps {
  /** Open while an ayah is picked */
  picked: PickedAyah | null;
  onClose: () => void;
  audio: MushafAudio;
  chapters: Chapter[];
  isDesktop: boolean;
}

/** The ayah's words from every page it is printed on (an ayah can begin on one page and end on the next). */
async function loadAyah(picked: PickedAyah): Promise<PlacedWord[]> {
  const pressed = { page: picked.page, data: await fetchMushafPage(picked.page) };
  const pages = [pressed];
  let before = pressed;
  while (before.page > 1 && continuesFromBefore(before.data, picked)) {
    before = { page: before.page - 1, data: await fetchMushafPage(before.page - 1) };
    pages.push(before);
  }
  let after = pressed;
  while (after.page < TOTAL_PAGES && continuesAfter(after.data, picked)) {
    after = { page: after.page + 1, data: await fetchMushafPage(after.page + 1) };
    pages.push(after);
  }
  const words = ayahWords(pages, picked);
  await Promise.all([...new Set(words.map((w) => w.page))].map((page) => loadPageFont(page)));
  return words;
}

// Same look as the listen sheet's choices: soft filled rows, a round icon, the label and one muted line under it.
const ACTION =
  "flex w-full cursor-pointer items-center gap-3 rounded-xl bg-muted/50 p-3 text-start transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60";
const ACTION_ICON = "flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary";

/**
 * What a long press on an ayah offers when the mushaf is only being read (not evaluated): listen to that one ayah, or
 * share it as a picture. The ayah stays marked with a gold band while the sheet is open.
 */
export function AyahActionsSheet({ picked, onClose, audio, chapters, isDesktop }: AyahActionsSheetProps) {
  const { t, language, isRTL } = useI18n();
  const { prepare, reciter, catalogFailed } = audio;

  // Keep the last ayah while the sheet slides away, or its content vanishes before the animation ends
  const [shown, setShown] = useState<PickedAyah | null>(picked);
  const [words, setWords] = useState<PlacedWord[] | null>(null);
  const [view, setView] = useState<"actions" | "share">("actions");
  const [image, setImage] = useState<{ blob: Blob; url: string } | null>(null);
  const [making, setMaking] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);

  useAyahBand(picked?.surah ?? null, picked?.ayah ?? null, "selected");

  useEffect(() => {
    if (!picked) return;
    let cancelled = false;
    setShown(picked);
    setView("actions");
    setWords(null);
    setImage(null);
    setImageFailed(false);
    void prepare();
    loadAyah(picked).then(
      (loaded) => !cancelled && setWords(loaded),
      () => !cancelled && setWords([]),
    );
    return () => {
      cancelled = true;
    };
  }, [picked, prepare]);

  useEffect(() => () => {
    if (image) URL.revokeObjectURL(image.url);
  }, [image]);

  const chapter = shown ? chapters.find((c) => c.id === shown.surah) : undefined;
  const surahName = chapter ? (language === "ar" ? chapter.name_arabic : chapter.name_simple) : "";
  const ayahNumber = shown ? (language === "ar" ? arabicDigits(shown.ayah) : String(shown.ayah)) : "";
  const title = t("mushaf:audio.ayah", { surah: surahName, ayah: ayahNumber });

  const listen = () => {
    if (!shown) return;
    const ref = { surah: shown.surah, ayah: shown.ayah };
    audio.start({ from: ref, to: ref });
    onClose();
  };

  const makeImage = async () => {
    setView("share");
    if (image || making || !shown || !words?.length) return;
    setMaking(true);
    setImageFailed(false);
    try {
      const blob = await renderAyahImage(words, shown.surah, {
        ayahLabel: t("mushaf:ayahActions.ayahLabel", { ayah: ayahNumber }),
        surahTitle: chapter ? `سورة ${chapter.name_arabic}` : "",
        brandLine: t("mushaf:ayahActions.brandLine"),
        rtl: isRTL,
      });
      setImage({ blob, url: URL.createObjectURL(blob) });
    } catch {
      setImageFailed(true);
    } finally {
      setMaking(false);
    }
  };

  const save = () => {
    if (!image || !shown) return;
    const link = document.createElement("a");
    link.href = image.url;
    link.download = ayahImageName(shown);
    link.click();
    showToast.success(t("mushaf:ayahActions.saved"));
  };

  const file = image && shown ? new File([image.blob], ayahImageName(shown), { type: "image/png" }) : null;
  const canShareFile = !!file && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });

  const share = async () => {
    if (!file || !shown || !words) return;
    const text = `${quotedAyah(words.map((w) => w.word), chapter?.name_arabic ?? "", shown)}\n${t("mushaf:ayahActions.brandLine")}`;
    try {
      await navigator.share({ files: [file], text });
    } catch (error) {
      // Closing the share panel is not an error
      if ((error as DOMException)?.name !== "AbortError") showToast.error(t("mushaf:ayahActions.shareFailed"));
    }
  };

  const wordsFailed = words !== null && words.length === 0;

  const body =
    view === "actions" ? (
      <div className="space-y-5">
        {/* The ayah itself, in the print's script, so the reader sees what they picked */}
        <div className="rounded-2xl bg-paper px-4 py-3 text-[#1f1b14] dark:bg-paper-bar dark:text-foreground">
          {words === null ? (
            <div className="h-16 animate-pulse rounded-lg bg-muted" />
          ) : wordsFailed ? (
            <p className="text-center text-muted-foreground">{t("mushaf:failedToLoadPage")}</p>
          ) : (
            // Each word is its own inline block, so a long ayah wraps between words (the glyphs have no spaces)
            <p dir="rtl" className="line-clamp-3 text-center text-[1.7rem] leading-[2.1]" aria-label={title}>
              {words.map(({ word, page }) => (
                <span
                  key={word.id}
                  className={
                    word.end === 1 ? "inline-block px-[0.15em] text-[#8a6d2f] dark:text-brand-gold" : "inline-block px-[0.15em]"
                  }
                  style={{ fontFamily: pageFontFamily(page) }}
                >
                  {word.g}
                </span>
              ))}
            </p>
          )}
        </div>

        <ul className="space-y-3">
          <li>
            <button type="button" className={ACTION} disabled={!reciter && !catalogFailed} onClick={catalogFailed ? () => void prepare() : listen}>
              <span className={ACTION_ICON}>
                <Headphones className="size-5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{t("mushaf:ayahActions.listen")}</span>
                <span className="block truncate text-muted-foreground">
                  {catalogFailed
                    ? t("mushaf:ayahActions.listenFailed")
                    : reciter
                      ? t("mushaf:ayahActions.listenDetail", { reciter: textIn(reciter.name, language) })
                      : t("mushaf:audio.loading")}
                </span>
              </span>
            </button>
          </li>
          <li>
            <button type="button" className={ACTION} disabled={!words?.length} onClick={() => void makeImage()}>
              <span className={ACTION_ICON}>
                <Share2 className="size-5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{t("mushaf:ayahActions.share")}</span>
                <span className="block truncate text-muted-foreground">{t("mushaf:ayahActions.shareDetail")}</span>
              </span>
              <ImageIcon className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            </button>
          </li>
        </ul>
      </div>
    ) : (
      <div className="space-y-5">
        {image ? (
          <img
            src={image.url}
            alt={t("mushaf:ayahActions.imageAlt", { surah: surahName, ayah: ayahNumber })}
            className="mx-auto max-h-[56dvh] w-auto max-w-full rounded-2xl shadow-[0_18px_40px_-18px_rgba(7,29,22,0.55)] ring-1 ring-black/5"
          />
        ) : imageFailed ? (
          <div className="space-y-3 rounded-2xl bg-destructive/5 p-4 text-center">
            <p>{t("mushaf:ayahActions.imageFailed")}</p>
            <Button variant="outline" onClick={() => void makeImage()}>
              {t("mushaf:audio.tryAgain")}
            </Button>
          </div>
        ) : (
          // The card's own shape while it is drawn: the page on the green cover
          <div className="mx-auto aspect-square max-h-[56dvh] w-full max-w-sm rounded-2xl bg-[#0d3429] p-[4%] pb-[16%] shadow-[0_18px_40px_-18px_rgba(7,29,22,0.55)]">
            <div className="flex size-full flex-col items-center justify-center gap-3 rounded-lg bg-[#fbf6ea] text-[#8a6d2f]">
              <Loader2 className="size-6 animate-spin" aria-hidden="true" />
              {t("mushaf:ayahActions.preparing")}
            </div>
          </div>
        )}

        {/* Share (or save, where this browser cannot share a file) and Cancel, which goes back to the two choices */}
        <div className="grid grid-cols-2 gap-3">
          {canShareFile ? (
            <Button size="lg" className="gap-2" disabled={!image} onClick={() => void share()}>
              <Share2 className="size-4" aria-hidden="true" />
              {t("mushaf:ayahActions.shareImage")}
            </Button>
          ) : (
            <Button size="lg" className="gap-2" disabled={!image} onClick={save}>
              <Download className="size-4" aria-hidden="true" />
              {t("mushaf:ayahActions.saveImage")}
            </Button>
          )}
          <Button size="lg" variant="outline" onClick={() => setView("actions")}>
            {t("common:cancel")}
          </Button>
        </div>
      </div>
    );

  const heading = view === "actions" ? title : t("mushaf:ayahActions.shareTitle");

  if (!isDesktop) {
    return (
      <Sheet open={picked !== null} onOpenChange={(open) => !open && onClose()}>
        <SheetContent
          side="bottom"
          // A light, unblurred dimming: the picked ayah stays readable above the sheet
          overlayClassName="bg-black/20 backdrop-blur-none"
          className="max-h-[92dvh] overflow-y-auto px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
        >
          <SheetHeader className="mb-4 text-center">
            <SheetTitle className="text-center font-semibold text-[#8a6d2f] dark:text-brand-gold">
              {heading}
            </SheetTitle>
            <SheetDescription className="sr-only">{t("mushaf:ayahActions.description")}</SheetDescription>
          </SheetHeader>
          {body}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={picked !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-center font-semibold text-[#8a6d2f] dark:text-brand-gold">{heading}</DialogTitle>
          <DialogDescription className="sr-only">{t("mushaf:ayahActions.description")}</DialogDescription>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
}
