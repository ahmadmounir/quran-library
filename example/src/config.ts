/**
 * The one setting this app needs: where the mushaf's files are. The folder is laid out like the repository's
 * `data/` (mushaf/, fonts/, audio/). During development the dev server serves `../data` at `/data`; in production
 * point VITE_FILES_BASE at your own Worker or domain in front of the R2 bucket (`https://files.example.com/v1`).
 * Never at someone else's Worker or bucket.
 */
const trim = (url: string) => url.replace(/\/+$/, "");

export const FILES_BASE = trim(import.meta.env.VITE_FILES_BASE || `${import.meta.env.BASE_URL}data`);

/** The reciters' audio: `reciters.json`, and per reciter `<path>index.json` + `<path>p001.mp3 … p604.mp3` */
export const AUDIO_BASE = trim(import.meta.env.VITE_AUDIO_BASE || `${FILES_BASE}/audio`);

/** The repository, for the "about" row of the settings */
export const REPOSITORY_URL = "https://github.com/ahmadmounir/quran-libary";
