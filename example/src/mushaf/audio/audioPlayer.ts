import { pageAudioUrl, type Reciter } from "./audioCatalog";
import type { AudioItem } from "./audioQueue";

export type PlayerStatus = "idle" | "loading" | "playing" | "paused" | "ended" | "error";

export interface PlayerSnapshot {
  status: PlayerStatus;
  /** The ayah (or basmala) being read, null when nothing is queued */
  item: AudioItem | null;
  position: number;
  total: number;
}

export interface PlayerOptions {
  rate: number;
  /** Times each ayah is read; 0 = until stopped */
  repeatAyah: number;
  /** Times the whole selection is read; 0 = until stopped */
  repeatRange: number;
}

/** Page files kept in memory for going back and forth (about 2 MB each). */
const KEPT_PAGES = 4;
/** The next page is fetched once this much of the current one has played, so it never slows the start. */
const PREFETCH_AFTER_MS = 3000;
const RETRY_AFTER_MS = 1500;

const times = (n: number) => (n <= 0 ? Infinity : n);

/**
 * Plays a list of ayat from the one-file-per-page recordings with a single <audio> element: an ayah is a stretch of
 * its page's file, so moving inside a page or repeating an ayah is a seek (no request). Each page file is requested
 * once; the next page is fetched in the background while the current one plays.
 */
export class MushafAudioPlayer {
  private readonly audio = new Audio();
  private queue: AudioItem[] = [];
  private position = 0;
  private ayahRound = 0;
  private rangeRound = 0;
  private reciter: Reciter | null = null;
  private loadedUrl: string | null = null;
  private pageStartMs = 0;
  private prefetchedFrom: string | null = null;
  private status: PlayerStatus = "idle";
  private options: PlayerOptions;
  private timer = 0;
  private snapshot: PlayerSnapshot = { status: "idle", item: null, position: 0, total: 0 };
  private readonly listeners = new Set<() => void>();
  /** page URL → object URL of the downloaded file, oldest first */
  private readonly pages = new Map<string, string>();
  private readonly fetching = new Set<string>();

  constructor(options: PlayerOptions) {
    this.options = options;
    this.audio.preload = "auto";
    this.audio.addEventListener("timeupdate", this.tick);
    this.audio.addEventListener("playing", () => {
      this.retriedUrl = null;
      this.setStatus("playing");
    });
    this.audio.addEventListener("waiting", () => this.setStatus("loading"));
    this.audio.addEventListener("pause", () => {
      if (this.status === "playing" || this.status === "loading") this.setStatus("paused");
    });
    this.audio.addEventListener("ended", () => this.advance(true));
    this.audio.addEventListener("error", this.onLoadError);
  }

  /** A page file that fails to load is asked for once more (phones drop connections) before the error shows. */
  private retriedUrl: string | null = null;
  private onLoadError = () => {
    if (!this.audio.getAttribute("src")) return; // stop() emptied it
    if (this.retriedUrl !== this.loadedUrl) {
      this.retriedUrl = this.loadedUrl;
      this.setStatus("loading");
      window.setTimeout(() => {
        if (this.status === "loading") this.retry();
      }, RETRY_AFTER_MS);
      return;
    }
    this.setStatus("error");
  };

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.snapshot;

  get queueItems(): readonly AudioItem[] {
    return this.queue;
  }

  setOptions(options: PlayerOptions) {
    this.options = options;
    this.audio.playbackRate = options.rate;
  }

  play(reciter: Reciter, queue: AudioItem[], startAt = 0) {
    this.reciter = reciter;
    this.queue = queue;
    this.rangeRound = 0;
    this.playItem(Math.min(Math.max(startAt, 0), queue.length - 1));
  }

  toggle() {
    if (this.status === "error") this.retry();
    else if (this.status === "ended") this.playItem(0);
    else if (this.audio.paused) this.resume();
    else this.audio.pause();
  }

  next() {
    if (this.position + 1 < this.queue.length) this.playItem(this.position + 1);
  }

  /** Back to the start of this ayah, or to the previous one when this one has only just begun. */
  previous() {
    const item = this.queue[this.position];
    if (!item) return;
    const playedMs = this.audio.currentTime * 1000 - item.startMs;
    this.playItem(playedMs > 1500 || this.position === 0 ? this.position : this.position - 1);
  }

  retry() {
    this.loadedUrl = null;
    this.playItem(this.position);
  }

  stop() {
    window.clearTimeout(this.timer);
    this.audio.pause();
    this.audio.removeAttribute("src");
    this.audio.load();
    this.loadedUrl = null;
    this.queue = [];
    this.position = 0;
    this.setStatus("idle");
  }

  destroy() {
    this.stop();
    this.pages.forEach((objectUrl) => URL.revokeObjectURL(objectUrl));
    this.pages.clear();
  }

  private resume() {
    this.audio.play().catch(this.onPlayRefused);
  }

  private onPlayRefused = (error: unknown) => {
    const name = (error as DOMException | undefined)?.name;
    if (name === "AbortError") return; // a newer play() or a new source replaced this one
    // NotAllowedError: the browser wants a tap first (an iPhone when the files were not here yet).
    this.setStatus(name === "NotAllowedError" ? "paused" : "error");
  };

  private playItem(index: number) {
    const item = this.queue[index];
    if (!item || !this.reciter) return;
    this.position = index;
    this.ayahRound = 0;
    const url = pageAudioUrl(this.reciter, item.page);
    if (this.loadedUrl !== url) {
      this.loadedUrl = url;
      this.prefetchedFrom = null;
      this.audio.src = this.pages.get(url) ?? url;
      this.audio.playbackRate = this.options.rate;
      this.setStatus("loading");
    }
    this.pageStartMs = item.startMs;
    this.seek(item.startMs);
    this.resume();
    this.publish();
  }

  private seek(ms: number) {
    const go = () => {
      this.audio.currentTime = ms / 1000;
    };
    if (this.audio.readyState >= HTMLMediaElement.HAVE_METADATA) go();
    else this.audio.addEventListener("loadedmetadata", go, { once: true });
  }

  /**
   * Runs on every timeupdate and, between them, on a timer aimed at the end of the current ayah, so a repeat or the
   * end of the selection is exact even with the screen off (where animation frames stop).
   */
  private tick = () => {
    window.clearTimeout(this.timer);
    const item = this.queue[this.position];
    if (!item || this.audio.paused) return;
    const ms = this.audio.currentTime * 1000;
    if (ms >= item.endMs) {
      this.advance(false);
      return;
    }
    if (ms - this.pageStartMs >= PREFETCH_AFTER_MS) this.prefetchNextPage();
    const untilEnd = (item.endMs - ms) / (this.audio.playbackRate || 1);
    this.timer = window.setTimeout(this.tick, Math.min(Math.max(untilEnd, 0), 250));
  };

  private advance(ended: boolean) {
    const item = this.queue[this.position];
    if (!item) return;
    if (item.ayah > 0 && this.ayahRound + 1 < times(this.options.repeatAyah)) {
      this.ayahRound += 1;
      this.seek(item.startMs);
      if (ended) this.resume();
      return;
    }
    const next = this.queue[this.position + 1];
    if (next) {
      // The next ayah follows on in the same file: let it play on, only the highlight moves.
      if (!ended && next.page === item.page && next.startMs === item.endMs) {
        this.position += 1;
        this.ayahRound = 0;
        this.publish();
        this.tick();
      } else {
        this.playItem(this.position + 1);
      }
      return;
    }
    if (this.rangeRound + 1 < times(this.options.repeatRange)) {
      this.rangeRound += 1;
      this.playItem(0);
      return;
    }
    window.clearTimeout(this.timer);
    this.audio.pause();
    this.setStatus("ended");
  }

  /** Fetches the next page this list needs (one request), so turning the page starts at once. */
  private prefetchNextPage() {
    const current = this.queue[this.position];
    if (!current || !this.reciter || this.prefetchedFrom === this.loadedUrl) return;
    this.prefetchedFrom = this.loadedUrl;
    const next = this.queue.slice(this.position + 1).find((x) => x.page !== current.page);
    if (!next) return;
    const url = pageAudioUrl(this.reciter, next.page);
    if (this.pages.has(url) || this.fetching.has(url)) return;
    this.fetching.add(url);
    fetch(url)
      .then((response) => (response.ok ? response.blob() : null))
      .then((blob) => {
        if (!blob) return;
        this.pages.set(url, URL.createObjectURL(blob));
        for (const [oldUrl, objectUrl] of this.pages) {
          if (this.pages.size <= KEPT_PAGES) break;
          if (oldUrl === this.loadedUrl) continue;
          URL.revokeObjectURL(objectUrl);
          this.pages.delete(oldUrl);
        }
      })
      .catch(() => {
        // Not fatal: the page then streams from its address when it is reached.
      })
      .finally(() => this.fetching.delete(url));
  }

  private setStatus(status: PlayerStatus) {
    if (this.status === status) return;
    this.status = status;
    this.publish();
  }

  private publish() {
    const item = this.queue[this.position] ?? null;
    this.snapshot = { status: this.status, item, position: this.position, total: this.queue.length };
    this.listeners.forEach((listener) => listener());
  }
}
