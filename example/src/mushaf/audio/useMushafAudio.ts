import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Chapter } from "@/lib/quranData";
import type { MushafIndex } from "../types";
import {
  getReciterCatalog,
  getReciterIndex,
  loadedReciterIndex,
  textIn,
  type Reciter,
  type ReciterCatalog,
} from "./audioCatalog";
import { MushafAudioPlayer, type PlayerOptions } from "./audioPlayer";
import { buildQueue, pageOfAyah, type AudioItem, type AudioRange } from "./audioQueue";

export interface AudioSettings extends PlayerOptions {
  reciterId: string;
}

const SETTINGS_KEY = "quran-library:audio";
const DEFAULT_SETTINGS: AudioSettings = { reciterId: "husary", rate: 1, repeatAyah: 1, repeatRange: 1 };

// A per-browser convenience: losing it only brings the defaults back.
const readSettings = (): AudioSettings => {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null") as Partial<AudioSettings> | null;
    return { ...DEFAULT_SETTINGS, ...saved };
  } catch {
    return DEFAULT_SETTINGS;
  }
};

const saveSettings = (settings: AudioSettings) => {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // private mode / storage full: the choice lasts until the page is closed
  }
};

interface UseMushafAudioArgs {
  mushaf: MushafIndex | null;
  chapters: Chapter[];
  /** The page the recitation has moved on to — the mushaf turns to it. */
  onPageReached: (page: number) => void;
  /** Words for the lock screen / notification ("Al-Baqarah 5") */
  describe: (item: AudioItem) => string;
  /** The app's name, shown under the reciter on the lock screen */
  album: string;
  language: string;
}

export function useMushafAudio({ mushaf, chapters, onPageReached, describe, album, language }: UseMushafAudioArgs) {
  const [settings, setSettings] = useState<AudioSettings>(readSettings);
  const [player] = useState(() => new MushafAudioPlayer(settings));
  const snapshot = useSyncExternalStore(player.subscribe, player.getSnapshot);
  const [catalog, setCatalog] = useState<ReciterCatalog | null>(null);
  const [catalogFailed, setCatalogFailed] = useState(false);
  const [noAudio, setNoAudio] = useState(false);
  const rangeRef = useRef<AudioRange | null>(null);

  useEffect(() => () => player.destroy(), [player]);
  useEffect(() => {
    player.setOptions(settings);
    saveSettings(settings);
  }, [player, settings]);

  const reciter: Reciter | undefined =
    catalog?.reciters.find((r) => r.id === settings.reciterId) ?? catalog?.reciters[0];

  /** Loads the reciter list and the chosen reciter's index — called when the listen sheet opens. */
  const prepare = useCallback(async () => {
    try {
      setCatalogFailed(false);
      const loaded = await getReciterCatalog();
      setCatalog(loaded);
      const chosen = loaded.reciters.find((r) => r.id === settings.reciterId) ?? loaded.reciters[0];
      if (chosen) await getReciterIndex(chosen);
    } catch {
      setCatalogFailed(true);
    }
  }, [settings.reciterId]);

  /** Starts a selection, from `startAt` (an ayah inside it) when given. */
  const playRange = useCallback(
    async (range: AudioRange, chosen: Reciter, startAt?: { surah: number; ayah: number }) => {
      if (!mushaf) return;
      rangeRef.current = range;
      setNoAudio(false);
      // Already loaded → playback starts within the tap, which iPhones insist on.
      const index = loadedReciterIndex(chosen.id) ?? (await getReciterIndex(chosen));
      const queue = buildQueue(index, range);
      if (queue.length === 0) {
        setNoAudio(true);
        return;
      }
      const from = startAt ? queue.findIndex((x) => x.surah === startAt.surah && x.ayah === startAt.ayah) : 0;
      player.play(chosen, queue, Math.max(from, 0));
    },
    [mushaf, player],
  );

  const start = useCallback(
    (range: AudioRange) => {
      if (reciter) void playRange(range, reciter).catch(() => setCatalogFailed(true));
    },
    [playRange, reciter],
  );

  const updateSettings = useCallback(
    (patch: Partial<AudioSettings>) => {
      setSettings((current) => ({ ...current, ...patch }));
      // Another reciter while listening: same selection, same ayah, the new voice.
      const nextReciter = patch.reciterId && catalog?.reciters.find((r) => r.id === patch.reciterId);
      const current = player.getSnapshot();
      if (nextReciter && rangeRef.current && current.item && current.status !== "idle") {
        const ayah = { surah: current.item.surah, ayah: current.item.ayah };
        void playRange(rangeRef.current, nextReciter, ayah).catch(() => setCatalogFailed(true));
      } else if (nextReciter) {
        void getReciterIndex(nextReciter).catch(() => setCatalogFailed(true));
      }
    },
    [catalog, player, playRange],
  );

  const stop = useCallback(() => {
    rangeRef.current = null;
    setNoAudio(false);
    player.stop();
  }, [player]);

  // Turn the mushaf to the page being read, in the print on screen (not the page file the audio comes from).
  const page = snapshot.item && mushaf ? pageOfAyah(mushaf, snapshot.item) : null;
  const pageReached = useRef(onPageReached);
  useEffect(() => {
    pageReached.current = onPageReached;
  });
  useEffect(() => {
    if (page !== null) pageReached.current(page);
  }, [page]);

  // Lock screen / headphones controls.
  const item = snapshot.item;
  const reciterName = reciter ? textIn(reciter.name, language) : "";
  useEffect(() => {
    if (!("mediaSession" in navigator) || !item) return;
    navigator.mediaSession.metadata = new MediaMetadata({ title: describe(item), artist: reciterName, album });
  }, [item, reciterName, describe, album]);
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const session = navigator.mediaSession;
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ["play", () => player.toggle()],
      ["pause", () => player.toggle()],
      ["previoustrack", () => player.previous()],
      ["nexttrack", () => player.next()],
      ["stop", () => stop()],
    ];
    handlers.forEach(([action, handler]) => {
      try {
        session.setActionHandler(action, handler);
      } catch {
        // an action this browser does not offer
      }
    });
    return () =>
      handlers.forEach(([action]) => {
        try {
          session.setActionHandler(action, null);
        } catch {
          // same as above
        }
      });
  }, [player, stop]);

  return {
    snapshot,
    settings,
    updateSettings,
    catalog,
    catalogFailed,
    noAudio,
    reciter,
    chapters,
    prepare,
    start,
    stop,
    toggle: () => player.toggle(),
    next: () => player.next(),
    previous: () => player.previous(),
    retry: () => player.retry(),
  };
}

export type MushafAudio = ReturnType<typeof useMushafAudio>;
