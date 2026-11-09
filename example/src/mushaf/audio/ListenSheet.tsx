import { useEffect, useState } from "react";
import { BookOpen, ListMusic, Play } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/ui";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/cn";
import type { Chapter } from "@/lib/quranData";
import { textIn } from "./audioCatalog";
import type { AudioRange } from "./audioQueue";
import type { MushafAudio } from "./useMushafAudio";

export interface ListenOption {
  key: string;
  label: string;
  /** e.g. the log's own description of the range ("Al-Baqarah 1–20") or the page number */
  detail?: string | null;
  range: AudioRange;
}

// The sheet keeps borders to a minimum: sections are set apart by space and a muted label, and its fields are
// filled instead of outlined (the outline comes back on focus). Labels are inline by default, so they get `block`:
// otherwise the space under them is ignored and they sit right on the field.
const SECTION_LABEL = "font-medium text-muted-foreground";
const SOFT_FIELD = "w-full border-transparent bg-muted/60 shadow-none";

interface ListenSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  audio: MushafAudio;
  options: ListenOption[];
  chapters: Chapter[];
  /** Surah the custom choice starts on: the one on the page in view */
  currentSurah: number;
  isDesktop: boolean;
}

/** "What would you like to hear?": the reciter, then the log's parts, the page, or ayat of one's own choosing. */
export function ListenSheet({ open, onOpenChange, audio, options, chapters, currentSurah, isDesktop }: ListenSheetProps) {
  const { t, language } = useI18n();
  const { catalog, catalogFailed, reciter, prepare, updateSettings } = audio;

  useEffect(() => {
    if (open) void prepare();
  }, [open, prepare]);

  const begin = (range: AudioRange) => {
    audio.start(range);
    onOpenChange(false);
  };

  const body = (
    <div className="space-y-8">
      {catalogFailed ? (
        <div className="space-y-3 rounded-xl bg-destructive/5 p-4">
          <p>{t("mushaf:audio.listFailed")}</p>
          <Button variant="outline" onClick={() => void prepare()}>
            {t("mushaf:audio.tryAgain")}
          </Button>
        </div>
      ) : (
        <section className="space-y-3">
          <Label htmlFor="listen-reciter" className={cn(SECTION_LABEL, "block")}>
            {t("mushaf:audio.reciter")}
          </Label>
          {catalog ? (
            <Select value={reciter?.id} onValueChange={(reciterId) => updateSettings({ reciterId })}>
              <SelectTrigger id="listen-reciter" className={SOFT_FIELD}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {catalog.reciters.map((r) => (
                  <SelectItem key={r.id} value={r.id} className="py-2.5">
                    {textIn(r.name, language)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div className="h-11 animate-pulse rounded-lg bg-muted" />
          )}
        </section>
      )}

      <section className="space-y-3">
        <h3 className={SECTION_LABEL}>{t("mushaf:audio.what")}</h3>
        <ul className="space-y-3">
          {options.map((option) => (
            <li key={option.key}>
              <button
                type="button"
                disabled={!reciter}
                onClick={() => begin(option.range)}
                className="flex w-full cursor-pointer items-center gap-3 rounded-xl bg-muted/50 p-3 text-start transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  {option.key === "page" || option.key === "fromHere" ? (
                    <BookOpen className="size-5" aria-hidden="true" />
                  ) : (
                    <ListMusic className="size-5" aria-hidden="true" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{option.label}</span>
                  {option.detail && <span className="block truncate text-muted-foreground">{option.detail}</span>}
                </span>
                <Play className="size-5 shrink-0 text-primary rtl:-scale-x-100" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      </section>

      <CustomRange chapters={chapters} initialSurah={currentSurah} disabled={!reciter} onPlay={begin} />
    </div>
  );

  if (!isDesktop) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {/* No visible title: the sheet opens straight on the reciter (screen readers still get its name). */}
          <SheetHeader className="sr-only">
            <SheetTitle>{t("mushaf:audio.title")}</SheetTitle>
            <SheetDescription>{t("mushaf:audio.what")}</SheetDescription>
          </SheetHeader>
          {body}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto">
        <DialogHeader className="sr-only">
          <DialogTitle>{t("mushaf:audio.title")}</DialogTitle>
          <DialogDescription>{t("mushaf:audio.what")}</DialogDescription>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
}

interface CustomRangeProps {
  chapters: Chapter[];
  initialSurah: number;
  disabled: boolean;
  onPlay: (range: AudioRange) => void;
}

function CustomRange({ chapters, initialSurah, disabled, onPlay }: CustomRangeProps) {
  const { t, language } = useI18n();
  const [surah, setSurah] = useState(initialSurah);
  const [from, setFrom] = useState("1");
  const [to, setTo] = useState("");
  const chapter = chapters.find((c) => c.id === surah);
  const count = chapter?.verses_count ?? 0;
  const first = Number(from);
  const last = to === "" ? count : Number(to);
  const valid = Number.isInteger(first) && Number.isInteger(last) && first >= 1 && last <= count && first <= last;

  return (
    <section className="space-y-6">
      <h3 className={SECTION_LABEL}>{t("mushaf:audio.custom")}</h3>
      <div className="space-y-2.5">
        <Label htmlFor="listen-surah" className="block">{t("mushaf:audio.surah")}</Label>
        <Select
          value={String(surah)}
          onValueChange={(value) => {
            setSurah(Number(value));
            setFrom("1");
            setTo("");
          }}
        >
          <SelectTrigger id="listen-surah" className={SOFT_FIELD}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {chapters.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.id}. {language === "ar" ? c.name_arabic : c.name_simple}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2.5">
          <Label htmlFor="listen-from" className="block">{t("mushaf:audio.fromAyah")}</Label>
          <Input id="listen-from" type="number" inputMode="numeric" min={1} max={count} className={SOFT_FIELD} value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-2.5">
          <Label htmlFor="listen-to" className="block">{t("mushaf:audio.toAyah")}</Label>
          <Input id="listen-to" type="number" inputMode="numeric" min={1} max={count} placeholder={String(count)} className={SOFT_FIELD} value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>
      {!valid && <p className="text-destructive">{t("mushaf:audio.invalidAyat", { count })}</p>}
      <Button
        className="w-full gap-2"
        disabled={disabled || !valid}
        onClick={() => onPlay({ from: { surah, ayah: first }, to: { surah, ayah: last } })}
      >
        <Play className="size-4 rtl:-scale-x-100" aria-hidden="true" />
        {t("mushaf:audio.play")}
      </Button>
    </section>
  );
}
