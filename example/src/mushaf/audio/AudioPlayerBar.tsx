import { Loader2, Pause, Play, RotateCcw, SkipBack, SkipForward, SlidersHorizontal, X } from "lucide-react";
import { Button, Popover, PopoverContent, PopoverTrigger, SegmentedControl } from "@/ui";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/cn";
import { textIn } from "./audioCatalog";
import type { AudioItem } from "./audioQueue";
import type { MushafAudio } from "./useMushafAudio";
import { useAyahBand } from "./ayahBands";

const SPEEDS = [0.75, 1, 1.25, 1.5] as const;
const AYAH_REPEATS = [1, 2, 3, 5, 0] as const;
const RANGE_REPEATS = [1, 2, 3, 0] as const;

interface AudioPlayerBarProps {
  audio: MushafAudio;
  describe: (item: AudioItem) => string;
  /**
   * Shown with the rest of the chrome: always on a desktop, and on a phone only while the header shows (a tap toggles
   * both). Hidden, it slides off the bottom; the recited-ayah band stays on the page regardless.
   */
  visible: boolean;
  /** Sits above the evaluation bar when that one is on screen */
  raised: boolean;
}

/** The floating player while a recitation is on: what is being read, play / pause, previous / next ayah, settings. */
export function AudioPlayerBar({ audio, describe, visible, raised }: AudioPlayerBarProps) {
  const { t, language } = useI18n();
  const { snapshot, settings, updateSettings, reciter } = audio;
  const { status, item } = snapshot;
  if (status === "idle" && !audio.noAudio) return null;

  const times = (n: number) => (n === 0 ? t("mushaf:audio.forever") : `${n}×`);
  const busy = status === "loading";
  const playing = status === "playing" || busy;

  return (
    <>
      {item && item.ayah > 0 && <AyahHighlight surah={item.surah} ayah={item.ayah} />}
      <div
        className={cn(
          "pointer-events-none fixed inset-x-0 z-50 flex justify-center px-3 transition-[bottom,transform,opacity] duration-300 ease-out motion-reduce:transition-none",
          raised ? "bottom-[5.5rem]" : "bottom-[max(0.75rem,env(safe-area-inset-bottom))]",
          visible ? "translate-y-0 opacity-100" : "translate-y-[140%] opacity-0",
        )}
      >
        <div
          role="region"
          aria-label={t("mushaf:audio.title")}
          aria-hidden={!visible}
          inert={!visible}
          className="pointer-events-auto flex w-full max-w-md items-center gap-1 rounded-2xl border bg-card/95 p-1.5 shadow-lg backdrop-blur"
        >
          <Button variant="ghost" size="icon" className="shrink-0 text-muted-foreground" onClick={audio.stop} aria-label={t("mushaf:audio.close")}>
            <X className="size-5" />
          </Button>

          <div className="min-w-0 flex-1 px-1" aria-live="polite">
            {status === "error" || audio.noAudio ? (
              <button type="button" className="w-full cursor-pointer truncate text-start text-destructive" onClick={audio.retry}>
                {audio.noAudio ? t("mushaf:audio.noAudio") : `${t("mushaf:audio.failed")} · ${t("mushaf:audio.tryAgain")}`}
              </button>
            ) : (
              <>
                <p className="truncate font-medium">
                  {status === "ended" ? t("mushaf:audio.ended") : item ? describe(item) : t("mushaf:audio.loading")}
                </p>
                <p className="truncate text-muted-foreground">{(reciter ? textIn(reciter.name, language) : "")}</p>
              </>
            )}
          </div>

          {/* Reading order: in Arabic the next ayah is on the left, like the next page of the mushaf. */}
          <div className="flex shrink-0 items-center">
            <Button variant="ghost" size="icon" onClick={audio.previous} disabled={!item} aria-label={t("mushaf:audio.previous")}>
              <SkipBack className="size-5 rtl:-scale-x-100" />
            </Button>
            <Button
              size="icon"
              className="size-11 rounded-full"
              onClick={audio.toggle}
              disabled={!item}
              aria-label={status === "ended" ? t("mushaf:audio.replay") : playing ? t("mushaf:audio.pause") : t("mushaf:audio.play")}
            >
              {busy ? (
                <Loader2 className="size-5 animate-spin" />
              ) : status === "ended" ? (
                <RotateCcw className="size-5" />
              ) : playing ? (
                <Pause className="size-5" />
              ) : (
                <Play className="size-5 rtl:-scale-x-100" />
              )}
            </Button>
            <Button variant="ghost" size="icon" onClick={audio.next} disabled={!item || snapshot.position + 1 >= snapshot.total} aria-label={t("mushaf:audio.next")}>
              <SkipForward className="size-5 rtl:-scale-x-100" />
            </Button>
          </div>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="shrink-0" aria-label={t("mushaf:audio.settings")}>
                <SlidersHorizontal className="size-5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" side="top" className="w-[min(22rem,calc(100vw-1.5rem))] space-y-4">
              <Setting label={t("mushaf:audio.speed")}>
                <SegmentedControl
                  value={settings.rate}
                  onChange={(rate) => updateSettings({ rate })}
                  options={SPEEDS.map((s) => ({ value: s, label: `${s}×` }))}
                  label={t("mushaf:audio.speed")}
                  size="sm"
                  className="flex w-full"
                />
              </Setting>
              <Setting label={t("mushaf:audio.repeatAyah")}>
                <SegmentedControl
                  value={settings.repeatAyah}
                  onChange={(repeatAyah) => updateSettings({ repeatAyah })}
                  options={AYAH_REPEATS.map((n) => ({ value: n, label: times(n) }))}
                  label={t("mushaf:audio.repeatAyah")}
                  size="sm"
                  className="flex w-full"
                />
              </Setting>
              <Setting label={t("mushaf:audio.repeatRange")}>
                <SegmentedControl
                  value={settings.repeatRange}
                  onChange={(repeatRange) => updateSettings({ repeatRange })}
                  options={RANGE_REPEATS.map((n) => ({ value: n, label: times(n) }))}
                  label={t("mushaf:audio.repeatRange")}
                  size="sm"
                  className="flex w-full"
                />
              </Setting>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </>
  );
}

function Setting({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="font-medium">{label}</p>
      {children}
    </div>
  );
}

/**
 * Marks the ayah being read on whatever page shows it, as one flat band per line (no rounding, border or shadow)
 * that joins the next line's — see ayahBands.ts. Every word carries data-location="s:a:pos", so the pages never
 * re-render for it.
 */
function AyahHighlight({ surah, ayah }: { surah: number; ayah: number }) {
  useAyahBand(surah, ayah);
  return null;
}
