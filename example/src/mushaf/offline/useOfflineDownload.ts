import { useSyncExternalStore } from "react";
import type { OfflineDownload } from "./offlineDownloads";

/** What of a download is on this device, and the download under way. */
export function useOfflineDownload(download: OfflineDownload) {
  return useSyncExternalStore(download.subscribe, download.getState, download.getState);
}
