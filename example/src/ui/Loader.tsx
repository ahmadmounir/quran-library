import { MarkLoader } from "@/brand/Logo";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/cn";

/** The whole screen while the mushaf opens: the reciting bars «التلاوة» on the paper */
export function FullScreenLoader({ className }: { className?: string }) {
  const { t } = useI18n();
  return (
    <div className={cn("flex h-dvh items-center justify-center bg-background", className)}>
      <div className="text-center" role="status" aria-live="polite">
        <MarkLoader className="mx-auto mb-2 size-16" />
        <p className="text-muted-foreground">{t("loading")}</p>
      </div>
    </div>
  );
}
