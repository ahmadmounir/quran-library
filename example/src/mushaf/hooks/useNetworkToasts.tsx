import { useEffect } from "react";
import { Wifi, WifiOff } from "lucide-react";
import { toast } from "@/ui/toast-config";
import { useI18n } from "@/i18n";

/** A change of network counts only once it has lasted this long (a flicker says nothing) */
const SETTLE_MS = 1500;
const TOAST_ID = "quran-libary-network";

/**
 * "No internet" / "back online", as in the Hafiz app: one toast at a time, never the same twice in a row, "back online"
 * only after "no internet" was said. The mushaf goes on working: the pages read before are on the device.
 */
export function useNetworkToasts(): void {
  const { t } = useI18n();

  useEffect(() => {
    let announced: "offline" | "online" | null = null;
    let timer = 0;

    const settle = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const now = navigator.onLine ? "online" : "offline";
        if (now === announced || (now === "online" && announced === null)) return;
        announced = now;
        if (now === "offline") {
          toast(t("common:network.offlineTitle"), {
            id: TOAST_ID,
            description: `${t("common:network.notice.mushaf")} ${t("common:network.notice.savedPages")}`,
            icon: <WifiOff className="size-4" aria-hidden="true" />,
            duration: 6000,
            closeButton: true,
          });
        } else {
          toast(t("common:network.backOnline"), {
            id: TOAST_ID,
            icon: <Wifi className="size-4" aria-hidden="true" />,
            duration: 3000,
          });
        }
      }, SETTLE_MS);
    };

    window.addEventListener("online", settle);
    window.addEventListener("offline", settle);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("online", settle);
      window.removeEventListener("offline", settle);
    };
  }, [t]);
}
