import { useEffect, type ReactNode } from "react";
import {
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  CloudDownload,
  ExternalLink,
  Footprints,
  Headphones,
  Moon,
  MonitorSmartphone,
  RotateCcw,
  ScrollText,
  Smartphone,
  Sun,
  SunMoon,
} from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  SegmentedControl,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  Switch,
} from "@/ui";
import { LogoMark } from "@/brand/Logo";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/cn";
import { REPOSITORY_URL } from "@/config";
import { isAppleMobile, isInstalled, startInstall, useCanInstall } from "@/lib/installApp";
import { TOTAL_PAGES } from "@/lib/quranData";
import { textIn } from "@/mushaf/audio/audioCatalog";
import type { MushafAudio } from "@/mushaf/audio/useMushafAudio";
import { mushafDownload } from "@/mushaf/offline/offlineDownloads";
import { useOfflineDownload } from "@/mushaf/offline/useOfflineDownload";
import {
  DAY_PAPERS,
  DEFAULT_SETTINGS,
  LANGUAGES,
  NIGHT_PAPERS,
  PAPER_COLORS,
  updateSettings,
  useIsDark,
  useSettings,
  type DayPaper,
  type Language,
  type NightPaper,
  type ThemeChoice,
} from "./store";

interface SettingsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The reciters (the default one is chosen here too) */
  audio: MushafAudio;
  isDesktop: boolean;
  /** Opens "the mushaf offline" (download, update, remove) */
  onOpenOffline: () => void;
}

const LANGUAGE_NAMES: Record<Language, string> = { ar: "العربية", en: "English", tr: "Türkçe" };

/** The text drawn on each page colour's little page */
const PAPER_INK: Record<DayPaper | NightPaper, { ink: string; gold: string }> = {
  cream: { ink: "#1f1b14", gold: "#b8912e" },
  white: { ink: "#1f1b14", gold: "#b8912e" },
  sepia: { ink: "#2a2014", gold: "#9c7a2c" },
  black: { ink: "#e8e1cf", gold: "#cdb26a" },
  green: { ink: "#e3ecdf", gold: "#cdb26a" },
};

const SECTION_LABEL = "px-1 font-medium text-muted-foreground";
const GROUP = "overflow-hidden rounded-2xl bg-muted/50 dark:bg-muted/40";
const ROW = "flex w-full items-center gap-3 px-3.5 py-3 text-start";
const ROW_ICON = "flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary";

/**
 * The reader's settings — new in quran-libary (the Hafiz app keeps them elsewhere): day / night / automatic, the
 * page's colour by day and by night, how a phone moves between pages, the page-turn animation, keeping the screen
 * on, the reciter, following the reciter, the language, the mushaf on this device, installing the app, and where it
 * all comes from. Everything is kept on this device (settings/store.ts). A bottom sheet on a phone, a dialog on a
 * computer, under the green cover of the index with its gold stars.
 */
export function SettingsSheet({ open, onOpenChange, audio, isDesktop, onOpenOffline }: SettingsSheetProps) {
  const { t } = useI18n();
  const { prepare } = audio;

  // The reciters' list is only needed here and in the listen sheet: loaded when one of them opens
  useEffect(() => {
    if (open) void prepare();
  }, [open, prepare]);

  const cover = (
    <div className="flex items-center gap-3.5 px-5 pt-3 pb-6 sm:pt-6">
      <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-white/[0.06] ring-1 ring-[#c9a24a]/30">
        <LogoMark tone="onDark" className="h-6" />
      </span>
      <div className="min-w-0">
        {isDesktop ? (
          <DialogTitle className="truncate text-xl leading-snug font-semibold text-[#efe5c8] sm:text-xl">
            {t("settings:title")}
          </DialogTitle>
        ) : (
          <SheetTitle className="truncate text-xl leading-snug font-semibold text-[#efe5c8]">{t("settings:title")}</SheetTitle>
        )}
        {isDesktop ? (
          <DialogDescription className="mb-0 truncate text-[#e6cd86]/80">{t("settings:subtitle")}</DialogDescription>
        ) : (
          <SheetDescription className="truncate text-[#e6cd86]/80">{t("settings:subtitle")}</SheetDescription>
        )}
      </div>
    </div>
  );

  const body = (
    <SettingsBody
      audio={audio}
      onOpenOffline={onOpenOffline}
      onDone={() => onOpenChange(false)}
    />
  );

  if (!isDesktop) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          className="mushaf-index-cover max-h-[92dvh] overflow-y-auto p-0 pt-2 pb-0 [&>button:first-child>span]:bg-[#e6cd86]/40"
        >
          {cover}
          <div className="rounded-t-3xl bg-card px-4 pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">{body}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-xl sm:p-0 [&>button:last-child]:bg-white/10 [&>button:last-child]:text-[#e6cd86] [&>button:last-child]:hover:bg-white/15 [&>button:last-child]:hover:text-[#efe5c8]">
        <div className="mushaf-index-cover">{cover}</div>
        <div className="-mt-4 rounded-t-3xl bg-card px-6 pt-7 pb-7">{body}</div>
      </DialogContent>
    </Dialog>
  );
}

function SettingsBody({
  audio,
  onOpenOffline,
  onDone,
}: {
  audio: MushafAudio;
  onOpenOffline: () => void;
  onDone: () => void;
}) {
  const { t, language, isRTL } = useI18n();
  const settings = useSettings();
  const dark = useIsDark();
  const offline = useOfflineDownload(mushafDownload);
  const canInstall = useCanInstall();
  const Forward = isRTL ? ChevronLeft : ChevronRight;

  useEffect(() => {
    void mushafDownload.refresh();
  }, []);

  const themes: { value: ThemeChoice; icon: typeof Sun; label: string }[] = [
    { value: "light", icon: Sun, label: t("settings:theme.light") },
    { value: "dark", icon: Moon, label: t("settings:theme.dark") },
    { value: "auto", icon: SunMoon, label: t("settings:theme.auto") },
  ];

  const offlineStatus = offline.complete
    ? t("mushaf:offline.completeShort")
    : offline.progress
      ? t("mushaf:offline.downloadingShort", {
          percent: Math.round((offline.progress.done / Math.max(1, offline.progress.total)) * 100),
        })
      : offline.storedPages !== null
        ? t("mushaf:offline.storedShort", { count: offline.storedPages, total: TOTAL_PAGES })
        : t("mushaf:offline.title");

  return (
    <div className="space-y-8">
      {/* Day, night, or the device's own choice */}
      <section className="space-y-3">
        <h3 className={SECTION_LABEL}>{t("settings:appearance")}</h3>
        <div role="radiogroup" aria-label={t("settings:appearance")} className="grid grid-cols-3 gap-2.5">
          {themes.map(({ value, icon: Icon, label }) => {
            const selected = settings.theme === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => updateSettings({ theme: value })}
                className={cn(
                  "group flex cursor-pointer flex-col items-center gap-2 rounded-2xl p-2 pb-2.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  selected ? "bg-primary/10 ring-2 ring-primary" : "bg-muted/50 hover:bg-muted",
                )}
              >
                <ThemePreview theme={value} dayPaper={settings.dayPaper} nightPaper={settings.nightPaper} />
                <span className={cn("flex items-center gap-1.5 font-medium", selected ? "text-primary" : "text-foreground")}>
                  <Icon className="size-4 shrink-0" aria-hidden="true" />
                  {label}
                </span>
              </button>
            );
          })}
        </div>
        {settings.theme === "auto" && <p className="px-1 text-muted-foreground">{t("settings:theme.autoHint")}</p>}
      </section>

      {/* The page's colour, by day and by night */}
      <section className="space-y-3">
        <h3 className={SECTION_LABEL}>{t("settings:paper.title")}</h3>
        <div className={cn(GROUP, "space-y-4 p-3.5")}>
          <PaperChoices
            label={t("settings:paper.day")}
            icon={<Sun className="size-4" aria-hidden="true" />}
            papers={DAY_PAPERS}
            value={settings.dayPaper}
            active={!dark}
            onChange={(dayPaper) => updateSettings({ dayPaper: dayPaper as DayPaper })}
          />
          <PaperChoices
            label={t("settings:paper.night")}
            icon={<Moon className="size-4" aria-hidden="true" />}
            papers={NIGHT_PAPERS}
            value={settings.nightPaper}
            active={dark}
            onChange={(nightPaper) => updateSettings({ nightPaper: nightPaper as NightPaper })}
          />
        </div>
      </section>

      {/* Reading */}
      <section className="space-y-3">
        <h3 className={SECTION_LABEL}>{t("settings:reading")}</h3>
        <div className="space-y-2 px-1">
          <p className="font-medium">{t("settings:viewMode.title")}</p>
          <SegmentedControl
            value={settings.viewMode}
            onChange={(viewMode) => updateSettings({ viewMode })}
            label={t("settings:viewMode.title")}
            className="flex w-full"
            options={[
              { value: "swipe", label: t("mushaf:viewModeSwipe"), icon: BookOpen },
              { value: "scroll", label: t("mushaf:viewModeScroll"), icon: ScrollText },
            ]}
          />
          <p className="text-muted-foreground">
            {t(settings.viewMode === "swipe" ? "settings:viewMode.swipeHint" : "settings:viewMode.scrollHint")}
          </p>
        </div>
        <div className={cn(GROUP, "divide-y divide-[#b8912e]/12 dark:divide-[#cdb26a]/10")}>
          <ToggleRow
            icon={<BookOpen className="size-5" />}
            title={t("settings:pageTurn.title")}
            hint={t("settings:pageTurn.hint")}
            checked={settings.pageTurn}
            onChange={(pageTurn) => updateSettings({ pageTurn })}
          />
          <ToggleRow
            icon={<Smartphone className="size-5" />}
            title={t("settings:keepAwake.title")}
            hint={t("settings:keepAwake.hint")}
            checked={settings.keepAwake}
            onChange={(keepAwake) => updateSettings({ keepAwake })}
          />
        </div>
      </section>

      {/* Listening */}
      <section className="space-y-3">
        <h3 className={SECTION_LABEL}>{t("settings:listening")}</h3>
        <div className="space-y-2 px-1">
          <label htmlFor="settings-reciter" className="block font-medium">
            {t("settings:reciter")}
          </label>
          {audio.catalog ? (
            <Select value={audio.reciter?.id} onValueChange={(reciterId) => audio.updateSettings({ reciterId })}>
              <SelectTrigger id="settings-reciter" className="w-full border-transparent bg-muted/60 shadow-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {audio.catalog.reciters.map((reciter) => (
                  <SelectItem key={reciter.id} value={reciter.id} className="py-2.5">
                    {textIn(reciter.name, language)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : audio.catalogFailed ? (
            <button
              type="button"
              onClick={() => void audio.prepare()}
              className="w-full cursor-pointer rounded-xl bg-destructive/5 p-3 text-start text-destructive"
            >
              {t("mushaf:audio.listFailed")}
            </button>
          ) : (
            <div className="h-12 animate-pulse rounded-xl bg-muted" />
          )}
        </div>
        <div className={cn(GROUP, "divide-y divide-[#b8912e]/12 dark:divide-[#cdb26a]/10")}>
          <ToggleRow
            icon={<Footprints className="size-5" />}
            title={t("settings:followReciter.title")}
            hint={t("settings:followReciter.hint")}
            checked={settings.followReciter}
            onChange={(followReciter) => updateSettings({ followReciter })}
          />
          <ToggleRow
            icon={<Headphones className="size-5" />}
            title={t("settings:immersive.title")}
            hint={t("settings:immersive.hint")}
            checked={settings.immersiveListening}
            onChange={(immersiveListening) => updateSettings({ immersiveListening })}
          />
        </div>
      </section>

      {/* Language */}
      <section className="space-y-3">
        <h3 className={SECTION_LABEL}>{t("settings:language")}</h3>
        <SegmentedControl
          value={settings.language}
          onChange={(value) => updateSettings({ language: value })}
          label={t("settings:language")}
          className="flex w-full"
          options={LANGUAGES.map((value) => ({ value, label: LANGUAGE_NAMES[value] }))}
        />
      </section>

      {/* The mushaf on this device */}
      <section className="space-y-3">
        <h3 className={SECTION_LABEL}>{t("settings:device")}</h3>
        <div className={cn(GROUP, "divide-y divide-[#b8912e]/12 dark:divide-[#cdb26a]/10")}>
          {offline.supported && (
            <button
              type="button"
              onClick={onOpenOffline}
              className={cn(ROW, "cursor-pointer transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset")}
            >
              <span className={ROW_ICON}>
                {offline.complete ? <Check className="size-5" /> : <CloudDownload className="size-5" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{t("mushaf:offline.title")}</span>
                <span className="block truncate text-muted-foreground">{offlineStatus}</span>
              </span>
              <Forward className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            </button>
          )}
          {!isInstalled() && (canInstall || isAppleMobile()) && (
            <button
              type="button"
              disabled={!canInstall}
              onClick={() => void startInstall()}
              className={cn(ROW, canInstall && "cursor-pointer transition-colors hover:bg-muted", "disabled:cursor-default")}
            >
              <span className={ROW_ICON}>
                <MonitorSmartphone className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{t("settings:install.title")}</span>
                <span className="block text-muted-foreground">
                  {canInstall ? t("settings:install.hint") : t("settings:install.iosHint")}
                </span>
              </span>
              {canInstall && <Forward className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />}
            </button>
          )}
        </div>
      </section>

      {/* Where it all comes from */}
      <section className="space-y-4 rounded-2xl border border-[#b8912e]/20 bg-paper p-4 text-[#1f1b14] dark:border-[#cdb26a]/15 dark:text-[#efe5c8]">
        <div className="flex items-center gap-3">
          <LogoMark className="h-6 shrink-0" />
          <div className="min-w-0">
            <p className="font-semibold">{t("common:appName")}</p>
            <p className="text-[#8a6d2f] dark:text-[#cdb26a]">{t("settings:about.edition")}</p>
          </div>
        </div>
        <p className="leading-relaxed text-[#1f1b14]/80 dark:text-[#efe5c8]/80">{t("settings:about.body")}</p>
        <p className="leading-relaxed text-[#1f1b14]/70 dark:text-[#efe5c8]/70">{t("settings:about.thanks")}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <a href={REPOSITORY_URL} target="_blank" rel="noreferrer">
              <ExternalLink className="size-4" aria-hidden="true" />
              {t("settings:about.source")}
            </a>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => {
              updateSettings({ ...DEFAULT_SETTINGS, language: settings.language });
              audio.updateSettings({ reciterId: "husary", rate: 1, repeatAyah: 1, repeatRange: 1 });
            }}
          >
            <RotateCcw className="size-4" aria-hidden="true" />
            {t("settings:reset")}
          </Button>
        </div>
      </section>

      <Button className="w-full" size="lg" onClick={onDone}>
        {t("settings:done")}
      </Button>
    </div>
  );
}

/** One switch with its icon, its name and a line saying what it does; the whole row toggles it */
function ToggleRow({
  icon,
  title,
  hint,
  checked,
  onChange,
}: {
  icon: ReactNode;
  title: string;
  hint: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className={cn(ROW, "cursor-pointer")}>
      <span className={ROW_ICON} aria-hidden="true">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{title}</span>
        <span className="block text-muted-foreground">{hint}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

/** A little mushaf page in a paper colour: the gold frame, the surah frame and lines of text */
function MiniPage({ paper, className }: { paper: DayPaper | NightPaper; className?: string }) {
  const { ink, gold } = PAPER_INK[paper];
  return (
    <span
      className={cn("relative block aspect-[3/4] overflow-hidden rounded-md shadow-[0_1px_3px_rgba(0,0,0,0.18)]", className)}
      style={{ backgroundColor: PAPER_COLORS[paper] }}
      aria-hidden="true"
    >
      <span className="absolute inset-[7%] rounded-[3px] border" style={{ borderColor: `${gold}66` }} />
      <span className="absolute inset-x-[16%] top-[15%] h-[11%] rounded-full border" style={{ borderColor: gold }} />
      {[0, 1, 2, 3, 4].map((line) => (
        <span
          key={line}
          className="absolute h-[5%] rounded-full"
          style={{
            backgroundColor: ink,
            opacity: 0.72,
            top: `${36 + line * 11}%`,
            right: "16%",
            left: line === 4 ? "42%" : "16%",
          }}
        />
      ))}
    </span>
  );
}

/** The theme as a page: by day, at night, or half of each for "automatic" */
function ThemePreview({ theme, dayPaper, nightPaper }: { theme: ThemeChoice; dayPaper: DayPaper; nightPaper: NightPaper }) {
  if (theme !== "auto") {
    return <MiniPage paper={theme === "light" ? dayPaper : nightPaper} className="w-full max-w-[4.5rem]" />;
  }
  return (
    <span className="relative block w-full max-w-[4.5rem]" aria-hidden="true">
      <MiniPage paper={dayPaper} className="w-full" />
      <span className="absolute inset-0 overflow-hidden rounded-md [clip-path:polygon(100%_0,100%_100%,0_100%)]">
        <MiniPage paper={nightPaper} className="w-full shadow-none" />
      </span>
    </span>
  );
}

function PaperChoices({
  label,
  icon,
  papers,
  value,
  active,
  onChange,
}: {
  label: string;
  icon: ReactNode;
  papers: readonly (DayPaper | NightPaper)[];
  value: DayPaper | NightPaper;
  /** The page shows this time of day right now */
  active: boolean;
  onChange: (paper: DayPaper | NightPaper) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="space-y-2.5">
      <p className="flex items-center gap-1.5 font-medium">
        {icon}
        {label}
        {active && (
          <span className="ms-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            {t("settings:paper.now")}
          </span>
        )}
      </p>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-3">
        {papers.map((paper) => {
          const selected = paper === value;
          return (
            <button
              key={paper}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(paper)}
              className="group flex w-[4.75rem] cursor-pointer flex-col items-center gap-1.5 rounded-xl focus-visible:outline-none"
            >
              <span
                className={cn(
                  "relative block w-full rounded-lg p-1 transition-shadow group-focus-visible:ring-2 group-focus-visible:ring-ring",
                  selected ? "ring-2 ring-primary" : "ring-1 ring-foreground/10 group-hover:ring-foreground/25",
                )}
              >
                <MiniPage paper={paper} className="w-full" />
                {selected && (
                  <span className="absolute -end-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow">
                    <Check className="size-3.5" aria-hidden="true" />
                  </span>
                )}
              </span>
              <span className={cn("leading-tight", selected ? "font-semibold text-primary" : "text-muted-foreground")}>
                {t(`settings:paper.${paper}`)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
