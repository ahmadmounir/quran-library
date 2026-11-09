import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, CloudDownload, Trash2, Wifi } from "lucide-react";
import {
  Button,
  ConfirmDialog,
  SegmentedControl,
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
import { useI18n } from "@/i18n";
import { useIsDesktop } from "../hooks/useIsDesktop";
import { megabytes } from "./offlinePlan";
import { mushafDownload } from "./offlineDownloads";
import { mushafUpdateEvery, setMushafUpdateEvery } from "./offlineFiles";
import type { MushafUpdateEvery } from "./offlineRules";
import { useOfflineDownload } from "./useOfflineDownload";

interface OfflineMushafSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * "The mushaf offline": how much of the mushaf is on this device (the pages the reader opened are kept by themselves),
 * its full download only on request (its size first, Wi-Fi advised, progress, stop, remove) and how often a
 * downloaded mushaf is checked (once / every two weeks / every month). A bottom sheet on a phone, a dialog on a
 * computer.
 */
export function OfflineMushafSheet({ open, onOpenChange }: OfflineMushafSheetProps) {
  const { t } = useI18n();
  const isDesktop = useIsDesktop();

  useEffect(() => {
    if (open) void mushafDownload.refresh();
  }, [open]);

  const body = (
    <div className="space-y-4">
      <MushafDownload />
    </div>
  );

  if (!isDesktop) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="mx-auto max-h-[92dvh] max-w-lg overflow-y-auto px-4 pt-3">
          <SheetHeader className="mb-4 space-y-1.5 p-0 text-start">
            <SheetTitle>{t("mushaf:offline.title")}</SheetTitle>
            <SheetDescription>{t("mushaf:offline.explain")}</SheetDescription>
          </SheetHeader>
          {body}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto">
        <DialogHeader className="pe-8">
          <DialogTitle>{t("mushaf:offline.title")}</DialogTitle>
          <DialogDescription>{t("mushaf:offline.explain")}</DialogDescription>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
}

const useSize = () => {
  const { t } = useI18n();
  return (bytes: number) => t("mushaf:offline.mb", { n: megabytes(bytes) });
};

/** The mushaf: what is on the device, its size, and download / stop / remove. */
function MushafDownload() {
  const { t } = useI18n();
  const size = useSize();
  const state = useOfflineDownload(mushafDownload);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const { storedPages, totalPages, complete, downloading, progress, error } = state;
  const started = (storedPages ?? 0) > 0;
  const share = complete
    ? 1
    : progress
      ? progress.total === 0
        ? 1
        : progress.done / progress.total
      : totalPages > 0
        ? (storedPages ?? 0) / totalPages
        : 0;
  const percent = Math.min(100, Math.round(share * 100));

  return (
    <section className="space-y-3">
      {/* What is on this device */}
      <div className="rounded-xl border bg-background p-4">
        <div className="flex items-center gap-3">
          <span
            className={`flex size-10 shrink-0 items-center justify-center rounded-full ${
              complete ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"
            }`}
          >
            {complete ? <CheckCircle2 className="size-5" /> : <CloudDownload className="size-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">
              {complete
                ? t("mushaf:offline.complete")
                : downloading
                  ? t("mushaf:offline.downloading")
                  : t("mushaf:offline.stored", { count: storedPages ?? 0, total: totalPages || "…" })}
            </p>
            {progress ? (
              <p className="text-muted-foreground tabular-nums">
                {t("mushaf:offline.progress", {
                  done: size(progress.bytes),
                  total: size(progress.totalBytes),
                  percent,
                })}
              </p>
            ) : complete ? (
              <p className="text-muted-foreground">{t("mushaf:offline.completeHint")}</p>
            ) : (
              <p className="text-muted-foreground">{t("mushaf:offline.pagesYouOpen")}</p>
            )}
          </div>
        </div>

        <div
          className="mt-3 h-2 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${percent}%` }} />
        </div>
      </div>

      {error && (
        <Notice icon={<AlertTriangle className="size-5" />} tone="warning">
          {t(
            error === "space"
              ? "mushaf:offline.errorSpace"
              : error === "unavailable"
                ? "mushaf:offline.unavailable"
                : "mushaf:offline.errorNetwork",
          )}
        </Notice>
      )}

      {downloading ? (
        <>
          <p className="text-muted-foreground">{t("mushaf:offline.keepReading")}</p>
          <Button variant="outline" className="w-full" onClick={mushafDownload.cancel}>
            {t("mushaf:offline.stop")}
          </Button>
        </>
      ) : (
        !complete &&
        storedPages !== null &&
        error !== "unavailable" && (
          <>
            <Notice icon={<Wifi className="size-5" />}>{t("mushaf:offline.wifi", { size: size(state.missingBytes) })}</Notice>
            <Button size="lg" className="w-full" onClick={() => void mushafDownload.start()}>
              <CloudDownload className="size-5" aria-hidden="true" />
              {started
                ? t("mushaf:offline.continue", { size: size(state.missingBytes) })
                : t("mushaf:offline.download", { size: size(state.missingBytes) })}
            </Button>
          </>
        )
      )}

      <UpdateSchedule />

      {!downloading && started && (
        <Button
          variant="ghost"
          className="w-full text-muted-foreground hover:text-destructive"
          onClick={() => setConfirmRemove(true)}
        >
          <Trash2 className="size-4" aria-hidden="true" />
          {t("mushaf:offline.remove")}
        </Button>
      )}

      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title={t("mushaf:offline.removeTitle")}
        description={t("mushaf:offline.removeConfirm")}
        confirmText={t("mushaf:offline.removeAction")}
        variant="destructive"
        onConfirm={async () => {
          await mushafDownload.remove();
          setConfirmRemove(false);
        }}
      />
    </section>
  );
}

const UPDATE_HINTS: Record<MushafUpdateEvery, string> = {
  once: "mushaf:offline.updateOnceHint",
  biweekly: "mushaf:offline.updateBiweeklyHint",
  monthly: "mushaf:offline.updateMonthlyHint",
};

/** How often a downloaded mushaf is checked and completed by itself (once = never again). Kept on this device. */
function UpdateSchedule() {
  const { t } = useI18n();
  const [every, setEvery] = useState<MushafUpdateEvery>(mushafUpdateEvery);

  return (
    <div className="space-y-2 pt-1">
      <p className="font-medium">{t("mushaf:offline.updateTitle")}</p>
      <SegmentedControl
        value={every}
        onChange={(value) => {
          setEvery(value);
          setMushafUpdateEvery(value);
        }}
        label={t("mushaf:offline.updateTitle")}
        className="flex w-full"
        options={[
          { value: "once", label: t("mushaf:offline.updateOnce") },
          { value: "biweekly", label: t("mushaf:offline.updateBiweekly") },
          { value: "monthly", label: t("mushaf:offline.updateMonthly") },
        ]}
      />
      <p className="text-muted-foreground">{t(UPDATE_HINTS[every])}</p>
    </div>
  );
}

function Notice({ icon, tone, children }: { icon: ReactNode; tone?: "warning"; children: ReactNode }) {
  return (
    <div
      className={`flex items-start gap-3 rounded-xl p-3 ${
        tone === "warning"
          ? "bg-amber-500/10 text-amber-900 dark:text-amber-200"
          : "bg-muted/60 text-foreground"
      }`}
    >
      <span className="mt-0.5 shrink-0" aria-hidden="true">
        {icon}
      </span>
      <p>{children}</p>
    </div>
  );
}
