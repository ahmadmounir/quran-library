import { AUDIO_BASE } from "@/config";
import type { ReciterIndex } from "./audioQueue";

/**
 * Where the reciters' files are: AUDIO_BASE (src/config.ts), laid out like the repository's `data/audio/`:
 * `reciters.json`, then per reciter `<path>index.json` and `<path>p001.mp3 … p604.mp3`. The MP3s are not in git:
 * `node tools/audio/build-reciter.mjs <id…|all>` builds them, and `tools/cloudflare` publishes them. In production
 * read them through your own Worker or domain, never the bucket's `*.r2.dev` address (blocked by some providers).
 */
const ROOT = `${AUDIO_BASE}/`;

type Texts = Record<"ar" | "en" | "tr", string>;

export interface Reciter {
  id: string;
  name: Texts;
  style: string;
  /** Folder of the reciter's files, e.g. "husary/" (a rebuild with new recordings gets a new folder; the id stays) */
  path: string;
}

export interface ReciterCatalog {
  reciters: Reciter[];
}

const getJson = async <T>(url: string): Promise<T> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return (await response.json()) as T;
};

// One download each per visit; the browser keeps them too (the list for an hour, an index for a year).
let catalogRequest: Promise<ReciterCatalog> | null = null;
const indexRequests = new Map<string, Promise<ReciterIndex>>();
const loadedIndexes = new Map<string, ReciterIndex>();

export const getReciterCatalog = (): Promise<ReciterCatalog> => {
  catalogRequest ??= getJson<ReciterCatalog>(`${ROOT}reciters.json`).catch((error) => {
    catalogRequest = null;
    throw error;
  });
  return catalogRequest;
};

export const getReciterIndex = (reciter: Reciter): Promise<ReciterIndex> => {
  let request = indexRequests.get(reciter.id);
  if (!request) {
    request = getJson<ReciterIndex>(`${ROOT}${reciter.path}index.json`).then(
      (index) => {
        loadedIndexes.set(reciter.id, index);
        return index;
      },
      (error) => {
        indexRequests.delete(reciter.id);
        throw error;
      },
    );
    indexRequests.set(reciter.id, request);
  }
  return request;
};

/** The index when it is already here — lets playback start inside the tap itself (iPhones require that). */
export const loadedReciterIndex = (reciterId: string): ReciterIndex | undefined => loadedIndexes.get(reciterId);

/** A text of the reciter list in the reader's language (English when that language is missing). */
export const textIn = (texts: Texts, language: string): string => texts[language as keyof Texts] ?? texts.en;

export const pageAudioUrl = (reciter: Reciter, page: number): string =>
  `${ROOT}${reciter.path}p${String(page).padStart(3, "0")}.mp3`;
