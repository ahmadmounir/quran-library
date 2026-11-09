/**
 * The whole mushaf on this device (~103 MB), only when the reader asks for it (the offline sheet): it counts what is
 * already here, downloads the rest a few files at a time, can be stopped (what was saved stays and a new start skips
 * it), and can be removed. The state lives here, so the download goes on while the reader keeps reading.
 *
 * Nothing downloads the mushaf by itself (no needless requests to your files Worker); a page is kept when it is
 * opened (the service worker). The one exception is the reader's own choice: a mushaf they downloaded is
 * checked every two weeks or every month if they picked that (`updateDownloadedMushafIfDue`, rules in `updateDue`):
 * the check reads the device only, and what is missing (cleared by the browser, a new version of the data) downloads
 * on a network `networkAllows` (never a mobile network the browser can see, never Data Saver).
 */
import {
  DATA_CACHE,
  FONTS_CACHE,
  countStoredPages,
  offlinePlan,
  totalBytes,
  type OfflineFile,
} from "./offlinePlan";
import {
  absoluteUrl,
  askPersistentStorage,
  freeBytes,
  isQuotaError,
  keepApp,
  keepFile,
  mushafCheckedAt,
  mushafUpdateEvery,
  mushafWanted,
  offlineSupported,
  setMushafCheckedAt,
  setMushafWanted,
  storedUrls,
} from "./offlineFiles";
import { SPARE_BYTES, networkAllows, updateDue, type ConnectionInfo } from "./offlineRules";

export interface OfflineDownloadState {
  supported: boolean;
  /** Pages all of whose files are on this device; null until counted */
  storedPages: number | null;
  totalPages: number;
  /** Every file is on this device */
  complete: boolean;
  /** What is still missing, and the whole (estimates) */
  missingBytes: number;
  totalBytes: number;
  downloading: boolean;
  /** The download under way (or the last one) is the update on the person's schedule, not their own press */
  scheduled: boolean;
  /** The download under way: files and bytes done of what was missing when it started */
  progress: { done: number; total: number; bytes: number; totalBytes: number } | null;
  /** unavailable: what to download could not be worked out (no network, nothing kept yet) */
  error: "network" | "space" | "unavailable" | null;
}

export interface OfflineDownload {
  subscribe(listener: () => void): () => void;
  getState(): OfflineDownloadState;
  /** Counts what is on this device (call it when the offline view opens). */
  refresh(): Promise<void>;
  /** The person starts (or continues) the download. */
  start(): Promise<void>;
  /** The person stops the download; what was saved stays. */
  cancel(): void;
  /** Removes it from this device (pages read later are kept again as usual). */
  remove(): Promise<void>;
}

/** Files fetched at the same time: enough to be quick, few enough to stay gentle with the servers. */
const PARALLEL = 4;

const connection = (): ConnectionInfo | undefined => (navigator as Navigator & { connection?: ConnectionInfo }).connection;
const networkAllowsNow = () => networkAllows(connection(), navigator.onLine);

const pagesIn = (files: OfflineFile[]) => new Set(files.flatMap((file) => (file.page === undefined ? [] : [file.page]))).size;

function createOfflineDownload(plan: () => Promise<OfflineFile[]>, cacheNames: string[]) {
  let state: OfflineDownloadState = {
    supported: offlineSupported,
    storedPages: null,
    totalPages: 0,
    complete: false,
    missingBytes: 0,
    totalBytes: 0,
    downloading: false,
    scheduled: false,
    progress: null,
    error: null,
  };
  const listeners = new Set<() => void>();
  let controller: AbortController | null = null;
  let planned: Promise<OfflineFile[]> | null = null;

  const update = (next: Partial<OfflineDownloadState>) => {
    state = { ...state, ...next };
    listeners.forEach((listener) => listener());
  };

  const getPlan = () => {
    planned ??= plan().catch((error) => {
      planned = null;
      throw error;
    });
    return planned;
  };

  async function refresh(): Promise<void> {
    if (!offlineSupported) return;
    try {
      const files = await getPlan();
      const stored = await storedUrls(cacheNames);
      const isStored = (file: OfflineFile) => stored.has(absoluteUrl(file.url));
      const missing = files.filter((file) => !isStored(file));
      update({
        storedPages: countStoredPages(files, isStored),
        totalPages: pagesIn(files),
        complete: missing.length === 0,
        missingBytes: totalBytes(missing),
        totalBytes: totalBytes(files),
        error: state.error === "unavailable" ? null : state.error,
      });
    } catch {
      update({ storedPages: state.storedPages ?? 0, error: "unavailable" });
    }
  }

  async function run(scheduled: boolean): Promise<void> {
    if (!offlineSupported || state.downloading) return;
    controller = new AbortController();
    const { signal } = controller;
    update({ downloading: true, scheduled, error: null, progress: null });

    try {
      const files = await getPlan();
      const stored = await storedUrls(cacheNames);
      const missing = files.filter((file) => !stored.has(absoluteUrl(file.url)));
      if (missing.length === 0) return;
      const missingBytes = totalBytes(missing);

      await askPersistentStorage();
      const free = await freeBytes();
      if (free !== null && free < missingBytes + (scheduled ? SPARE_BYTES : 0)) {
        update({ error: "space" });
        return;
      }

      const progress = { done: 0, total: missing.length, bytes: 0, totalBytes: missingBytes };
      update({ progress: { ...progress } });

      await keepApp(signal).catch(() => undefined);

      let next = 0;
      let failure: OfflineDownloadState["error"] = null;
      let paused = false;
      const worker = async () => {
        while (next < missing.length && !signal.aborted && !failure && !paused) {
          // The scheduled update waits for a network it may use (e.g. the phone left the Wi-Fi)
          if (scheduled && !networkAllowsNow()) {
            paused = true;
            return;
          }
          const file = missing[next++];
          try {
            // One more try for a dropped connection
            const kept = await keepFile(file, signal).catch((error) => {
              if (signal.aborted || isQuotaError(error)) throw error;
              return keepFile(file, signal);
            });
            progress.done++;
            progress.bytes += kept.bytes;
            update({ progress: { ...progress } });
          } catch (error) {
            if (signal.aborted) return;
            failure = isQuotaError(error) ? "space" : "network";
          }
        }
      };
      await Promise.all(Array.from({ length: PARALLEL }, worker));
      if (failure) update({ error: failure });
    } catch (error) {
      if (!signal.aborted) update({ error: scheduled && !navigator.onLine ? "network" : isQuotaError(error) ? "space" : "unavailable" });
    } finally {
      controller = null;
      // Counted before the progress goes, so the bar never falls back to the old count for a moment
      await refresh();
      if (state.complete) setMushafCheckedAt(Date.now());
      update({ downloading: false, progress: null });
    }
  }

  const download: OfflineDownload = {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getState: () => state,
    refresh,
    start() {
      setMushafWanted(true);
      return run(false);
    },
    cancel() {
      if (!controller) return;
      setMushafWanted(false);
      controller.abort();
    },
    async remove() {
      if (!offlineSupported) return;
      setMushafWanted(false);
      controller?.abort();
      await Promise.all(cacheNames.map((name) => caches.delete(name)));
      update({ error: null });
      await refresh();
    },
  };

  /**
   * The update the person chose for the mushaf they downloaded, when it is due (`updateDue`): counts what is on the
   * device (no request) and downloads only what is missing. Resolves to whether anything was downloaded.
   */
  async function updateIfDue(): Promise<boolean> {
    if (!offlineSupported || state.downloading) return false;
    const due = updateDue({ every: mushafUpdateEvery(), wanted: mushafWanted(), checkedAt: mushafCheckedAt(), now: Date.now() });
    if (!due || !networkAllowsNow()) return false;
    await refresh();
    if (state.error === "unavailable" || state.downloading) return false;
    if (state.complete) {
      setMushafCheckedAt(Date.now());
      return false;
    }
    await run(true);
    return true;
  }

  return { download, updateIfDue };
}

const whole = createOfflineDownload(async () => offlinePlan(), [DATA_CACHE, FONTS_CACHE]);

/** The whole mushaf: every page's words and font, the index, the chapters, the search text. */
export const mushafDownload: OfflineDownload = whole.download;

/** The scheduled update of a mushaf the person downloaded (see the top of this file). */
export const updateDownloadedMushafIfDue = whole.updateIfDue;
