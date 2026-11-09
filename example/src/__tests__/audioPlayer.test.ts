import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AudioItem } from "@/mushaf/audio/audioQueue";
import type { Reciter } from "@/mushaf/audio/audioCatalog";

/** Enough of an <audio> element for the player: a clock the test moves by hand. */
class FakeAudio {
  static last: FakeAudio;
  paused = true;
  playbackRate = 1;
  preload = "";
  readyState = 4;
  /** Every position the player jumped to, in ms */
  seeks: number[] = [];
  /** Every file it loaded */
  sources: string[] = [];
  private broken = false;
  private time = 0;
  private source = "";
  private handlers = new Map<string, Set<() => void>>();

  constructor() {
    FakeAudio.last = this;
  }
  get currentTime() {
    return this.time;
  }
  set currentTime(seconds: number) {
    this.time = seconds;
    this.seeks.push(Math.round(seconds * 1000));
  }
  get src() {
    return this.source;
  }
  set src(url: string) {
    this.source = url;
    this.sources.push(url);
  }
  addEventListener(name: string, handler: () => void) {
    if (!this.handlers.has(name)) this.handlers.set(name, new Set());
    this.handlers.get(name)!.add(handler);
  }
  getAttribute(name: string) {
    return name === "src" ? this.source || null : null;
  }
  removeAttribute() {
    this.source = "";
  }
  load() {}
  play() {
    this.paused = false;
    if (!this.broken) this.emit("playing");
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
    this.emit("pause");
  }
  /** The file could not be loaded (network error): it will not play until a new source is set. */
  fail() {
    this.broken = true;
    this.emit("error");
  }
  /** Plays on to `ms`, the way timeupdate reports it. */
  reach(ms: number) {
    this.time = ms / 1000;
    this.emit("timeupdate");
  }
  private emit(name: string) {
    this.handlers.get(name)?.forEach((handler) => handler());
  }
}

const reciter: Reciter = { id: "r", name: { ar: "", en: "", tr: "" }, style: "murattal", path: "r/" };
// Page 2: the basmala, 2:1 and 2:2 back to back; page 3: 2:3.
const queue: AudioItem[] = [
  { page: 2, surah: 2, ayah: 0, startMs: 0, endMs: 1000 },
  { page: 2, surah: 2, ayah: 1, startMs: 1000, endMs: 2000 },
  { page: 2, surah: 2, ayah: 2, startMs: 2000, endMs: 3000 },
  { page: 3, surah: 2, ayah: 3, startMs: 0, endMs: 1000 },
];

const newPlayer = async (options: { repeatAyah?: number; repeatRange?: number } = {}) => {
  const { MushafAudioPlayer } = await import("@/mushaf/audio/audioPlayer");
  const player = new MushafAudioPlayer({ rate: 1, repeatAyah: 1, repeatRange: 1, ...options });
  return { player, audio: FakeAudio.last };
};
const at = (player: { getSnapshot: () => { item: AudioItem | null } }) => {
  const item = player.getSnapshot().item;
  return item ? `p${item.page} ${item.surah}:${item.ayah}` : null;
};

describe("mushaf audio player", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("Audio", FakeAudio);
    vi.stubGlobal("window", globalThis);
    vi.stubGlobal("HTMLMediaElement", { HAVE_METADATA: 1 });
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {}))); // background downloads never finish here
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("plays on through a page without seeking, then loads the next page's file", async () => {
    const { player, audio } = await newPlayer();
    player.play(reciter, queue);
    expect(audio.sources).toHaveLength(1);
    expect(audio.sources[0]).toMatch(/\/audio\/v\d+\/r\/p002\.mp3$/);
    audio.reach(1000);
    audio.reach(2000);
    expect(at(player)).toBe("p2 2:2");
    expect(audio.seeks).toEqual([0]); // only the start
    audio.reach(3000);
    expect(at(player)).toBe("p3 2:3");
    expect(audio.sources.at(-1)).toMatch(/p003\.mp3$/);
  });

  it("repeats each ayah by seeking back, but never the basmala", async () => {
    const { player, audio } = await newPlayer({ repeatAyah: 2 });
    player.play(reciter, queue);
    audio.reach(1000); // the basmala is read once
    expect(at(player)).toBe("p2 2:1");
    audio.reach(2000); // end of 2:1, first time: back to its start
    expect(at(player)).toBe("p2 2:1");
    expect(audio.seeks.at(-1)).toBe(1000);
    audio.reach(2000); // second time: on to 2:2
    expect(at(player)).toBe("p2 2:2");
  });

  it("starts the selection again when asked to repeat it, and stops at its end otherwise", async () => {
    const twice = await newPlayer({ repeatRange: 2 });
    twice.player.play(reciter, queue, 3);
    twice.audio.reach(1000);
    expect(at(twice.player)).toBe("p2 2:0");
    twice.player.next();
    twice.player.next();
    twice.player.next();
    twice.audio.reach(1000); // the second round is the last
    expect(twice.player.getSnapshot().status).toBe("ended");

    const once = await newPlayer();
    once.player.play(reciter, queue, 3);
    once.audio.reach(1000);
    expect(once.player.getSnapshot().status).toBe("ended");
    expect(once.audio.paused).toBe(true);
  });

  it("asks for a page that failed once more, then shows the error; play tries again", async () => {
    const { player, audio } = await newPlayer();
    player.play(reciter, queue, 3);
    audio.fail();
    expect(player.getSnapshot().status).toBe("loading");
    vi.advanceTimersByTime(1500);
    expect(audio.sources.filter((s) => s.endsWith("p003.mp3"))).toHaveLength(2);
    audio.fail();
    expect(player.getSnapshot().status).toBe("error");
    player.toggle();
    expect(audio.sources.filter((s) => s.endsWith("p003.mp3"))).toHaveLength(3);
  });

  it("goes back to the start of the ayah, or to the previous one right after it began", async () => {
    const { player, audio } = await newPlayer();
    const long: AudioItem[] = [
      { page: 2, surah: 2, ayah: 1, startMs: 0, endMs: 5000 },
      { page: 2, surah: 2, ayah: 2, startMs: 5000, endMs: 10000 },
    ];
    player.play(reciter, long, 1);
    audio.reach(8000); // well into 2:2
    player.previous();
    expect(at(player)).toBe("p2 2:2");
    expect(audio.seeks.at(-1)).toBe(5000);
    audio.reach(5500); // just began
    player.previous();
    expect(at(player)).toBe("p2 2:1");
  });
});
