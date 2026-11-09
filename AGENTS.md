# AGENTS.md — building a Quran mushaf from this repository

Instructions for AI coding assistants (Claude Code, Codex, Cursor, Copilot …). Follow them to add a mushaf to a
user's app: the 1421H Madinah print drawn with the King Fahd Complex page fonts (as on Quran.com / Tarteel), word by
word, with reciters' audio in sync, offline caching, and free Cloudflare hosting. The human guide is
`docs/en/GUIDE.md` (also `docs/ar`, `docs/tr`); the reference implementation is `example/`: the mushaf of the Hafiz
platform as a small Vite + React + Tailwind app (open book on a computer, phone pages, reciters, settings, offline),
whose core modules are framework-free (§1).

**Scope.** Only the mushaf: pages, fonts, words, audio, hosting, caching. No accounts, backend, or memorization
tracking unless the user asks for them separately.

## 1. Repository map

| Path | Content |
|---|---|
| `data/mushaf/mushaf_index.json` | `{ pageInfo: [[firstSurah, juz, hizb] per page], ayahPages: { "<surah>": [page of each ayah] } }` |
| `data/mushaf/search_text.json` | 6,236 × `{ id, verse_key: "s:a", text_plain }`: the plain text of every ayah, for search |
| `data/mushaf/chapters.json` | 114 × `{ id, name_arabic, name_simple, verses_count, bismillah_pre, pages: [first, last], … }` |
| `data/mushaf/pages/page-NNN.json` | 604 pages (NNN = 001…604), format in §2 |
| `data/fonts/pages/p{N}.woff2` | page fonts, N = 1…604 (no padding), ~160 KB each |
| `data/fonts/surah-header.woff2` | surah frames; code points in `example/src/mushaf/utils/mushafFonts.ts` (`SURAH_HEADER_CODES`) |
| `data/audio/reciters.json` | `{ v, reciters: [{ id, name: { ar, en, tr }, style, path: "<id>/" }] }` |
| `data/audio/<id>/index.json` | timing index per reciter, §5; the MP3s are NOT in git (built by `tools/audio`) |
| `example/src/config.ts` | the one setting: `FILES_BASE` (`VITE_FILES_BASE`, default `/data`) and `AUDIO_BASE` |
| `example/src/mushaf/utils/mushafFonts.ts` | the font queue (framework-free): load, LRU, the surah frame glyphs |
| `example/src/mushaf/utils/mushafData.ts`, `hooks/usePageData.ts` | page files (LRU cache), index, search corpus |
| `example/src/mushaf/components/QuranPageView.tsx`, `hooks/useQcfLineFit.ts` | one page drawn; the line fit |
| `example/src/mushaf/audio/audioQueue.ts`, `audioPlayer.ts`, `ayahBands.ts` | play list, the player (framework-free), the ayah band |
| `example/src/mushaf/utils/bookSpreads.ts`, `components/MushafBookView.tsx` | the open book: spreads, the 3D turn |
| `example/src/mushaf/components/MushafLandscapeView.tsx`, `utils/hizbQuarters.ts` | a phone held sideways; hizb quarters |
| `example/src/settings/` | the reader's settings (day / night / auto, page colour, …), kept in localStorage |
| `example/public/sw.js` | the service worker |
| `tools/audio/build-reciter.mjs <id…\|all>` | downloads the recordings from EveryAyah and builds `data/audio/<id>/p001.mp3…p604.mp3` (Node 20+, ffmpeg) — see §5.1 |
| `tools/cloudflare/upload-r2.mjs <dir> <prefix>` | uploads to R2 (keys in `.env`, see `.env.example`) |
| `tools/cloudflare/files-worker.js` | Worker serving the bucket (binding `FILES`, folders `v1/`) |

Reciter ids: `husary` (default), `minshawi`, `shuraim`, `muaiqly`, `dosari`, `alafasy`, `abdulbasit`, `alijaber`.

## 2. Page file format (the contract)

```ts
type Word = { id: number; surah: number; ayah: number; pos: number; text: string; end: 0 | 1; g: string };
type Line =
  | { line: number; type: "words"; words: Word[]; centered?: boolean }
  | { line: number; type: "header"; surah: number }
  | { line: number; type: "basmala"; g: string; fontPage: number };
type Page = { page: number; script: "qcf-v2"; lines: Line[] };
```

- Draw `g` (glyph codes in THIS page's font). `text` is the Unicode word: use it for search, copy, `aria-label`.
- `end: 1` = the ayah-number glyph. `pos` counts within the ayah; location key = `${surah}:${ayah}:${pos}`.
- `id` = global word id (Quran.com word ids). Store marks / bookmarks by `id` or location.
- `centered` lines are centered, all other word lines are justified edge to edge.
- `basmala.g` is drawn with page `fontPage`'s font (always 1).
- Invariants: 604 pages; exactly 15 lines on pages 3–604 and 8 on pages 1–2 (header and basmala lines count); every
  page starts on the first word of an ayah; 6,236 ayat; 77,429 words + 6,236 ayah-number glyphs.

## 3. Rendering rules (must follow)

1. One element per line, one element per word; the word element's text is `g`; set `data-location`, keep `text`
   available (dataset or aria).
2. Container: a 3:5 card with `container-type: inline-size`; all inner sizes in `cqw`.
   - `--qcf-room: calc(164.5cqw - 3.5rem)`; `--qcf-size: min(calc(100cqw / 16), calc(var(--qcf-room) / 27))`.
   - Width: `min(100%, 450px, calc((100dvh - <chrome height>) * 3 / 5))` so the whole page fits.
3. Body: flex column, `justify-content: space-between`, `direction: rtl`, vertical padding ~1.75rem.
4. Line: `display: flex; justify-content: space-between; white-space: nowrap; font-size: var(--qcf-size);
   line-height: 1.5; overflow: visible`. Centered line: `justify-content: center; column-gap: 0.25em`.
5. Pages 1–2 (`page <= 2`): body centered with `gap: 0.4em`, lines centered, `font-size: calc(var(--qcf-size) * 1.3)`.
6. Surah header: block of height `12.2cqw`, glyph `surahHeaderGlyph(surah)` in the header font,
   `font-size: calc(100cqw / 3.302)`, `line-height: 1`, `pointer-events: none` (the glyph is drawn 0.4em high but its
   box is a whole em: it reaches over the line above and would take the taps meant for its words).
7. After the page is in the DOM, run the line fit: for each line, `ratio = Σ word widths (+ gaps) / line width`; if
   `ratio > 1`, `font-size = currentSize × 0.99 / ratio` on that line only. Re-run on resize.
8. Never show `g` in a fallback font: render a placeholder (15 grey bars) until the page's fonts are loaded.

## 4. Font loading rules (must follow)

- `new FontFace(family, "url(…/pN.woff2) format('woff2')", { display: "block" }).load()` then `document.fonts.add`.
- A page needs: its own font; page 1's font if it has a `basmala` line; the header font if it has a `header` line.
- Queue: nearest page to the reader first, at most **2** concurrent, pages farther than **1** from the reader wait.
- Keep at most **24** fonts registered (LRU); `document.fonts.delete` the evicted ones.
- A font already in the cache (`quran-library-fonts-v1`) is read from it as an `ArrayBuffer`: no request.
- Copy `example/src/mushaf/utils/mushafFonts.ts` rather than rewriting it (the open book asks for a radius of 3).

## 5. Audio (must follow)

Index: `{ v, rate, kbps, pages: { "<page>": { ms, bytes, ayat: [[surah, ayah, startMs], …] } } }`. Ayah 0 = basmala
before ayah 1 (never surahs 1 and 9). An ayah ends at the next entry's `startMs`, the last at `ms`. Files:
`<AUDIO_BASE>/<reciter.path>p001.mp3` (3-digit page).

- Build the play list with `buildQueue(index, { from, to })` (`example/src/mushaf/audio/audioQueue.ts`): the page FILE of an ayah
  comes from the reciter's index, never from the mushaf index.
- Player (`example/src/mushaf/audio/audioPlayer.ts`, copy it): one `<audio>`; `src` = page file (stream), seek to `startMs`;
  `timeupdate` + a timer at the ayah's end; contiguous next ayah in the same file → only move the highlight; repeat =
  seek; other page → new `src`; 3 s after a page starts, `fetch()` the next needed page into a Blob URL (keep 4);
  retry a failed load once after 1.5 s; `NotAllowedError` → "paused".
- Highlight the current ayah without re-rendering the page: the example draws ONE flat band per line from its first
  word to its last, joined across the gap to the next line (`example/src/mushaf/audio/ayahBands.ts`); the simplest
  alternative is one CSS rule `.word[data-location^="S:A:"]`.
- Turn to `pageOfAyah(mushafIndex, item)` when it differs from the page shown.
- Media Session metadata + play / pause / previoustrack / nexttrack handlers.
- RTL UI: "next ayah" on the LEFT, skip icons mirrored; next PAGE is also on the left, swipe right = next page.
- Start playback inside the user's tap (preload the reciter's `index.json` before), or iPhones refuse to play.

### 5.1 Getting the audio files (they are NOT in git — you must fetch them)

The repository has the reciters' timing indexes but not the MP3s (6.2 GB). When the app needs audio, produce them
with the included tool — it downloads the recordings from EveryAyah, the same source the published files were made
from, and rebuilds them **byte for byte** (verified):

1. Check `node --version` (≥ 20) and `ffmpeg -version`. If ffmpeg is missing, install it (winget `Gyan.FFmpeg`,
   Homebrew `ffmpeg`, apt `ffmpeg`) or ask the user to.
2. Ask the user which reciters they want before downloading gigabytes (default: `husary`). Built sizes: husary
   1.12 GB, minshawi 0.80, shuraim 0.52, muaiqly 0.60, dosari 0.75, alafasy 0.85, abdulbasit 0.85, alijaber 0.70
   (6.2 GB in all); the download is about as big again.
3. Run it in the background (about an hour per reciter, mostly downloading; it resumes if stopped):

   ```bash
   node tools/audio/build-reciter.mjs husary            # one reciter
   node tools/audio/build-reciter.mjs husary minshawi   # several
   node tools/audio/build-reciter.mjs all               # all eight
   ```

   Quick test first if you like: `PAGES=1-3 node tools/audio/build-reciter.mjs husary` (writes to
   `sources/test/husary/`, never to `data/`).
4. Each run ends with a check (604 pages, 6,236 ayat, lengths) and "identical to the published files". If it reports a
   difference, the source recordings changed: keep the new `index.json` with the new MP3s — they belong together.
5. Serve the result: locally `data/audio/` already works with the example; for production upload it
   (`node tools/cloudflare/upload-r2.mjs data/audio v1/audio`, §6).
6. The downloaded ayah files stay in `sources/` (git-ignored, ~same size again); delete them once the build is checked.

Never commit the MP3s, never point a production app at someone else's Worker or bucket.

## 6. Hosting (Cloudflare)

- Bucket layout = the repo's `data/` under a version folder: `v1/mushaf/…`, `v1/fonts/…`, `v1/audio/…`.
- Upload with `tools/cloudflare/upload-r2.mjs` (sets `Cache-Control: public, max-age=31536000, immutable`; one hour for
  `reciters.json`). Never overwrite a published file: publish changes under `v2/`.
- Serve through `tools/cloudflare/files-worker.js` (binding `FILES`): GET/HEAD only, `FOLDERS = ["v1/"]`, Range, 304,
  open CORS (required by `FontFace` and `fetch`). On a custom domain it also uses the edge cache.
- Do NOT use the bucket's `*.r2.dev` address in production: blocked by some ISPs (Turkey), rate-limited, uncached.
- The app needs one setting: `FILES_BASE = https://<worker or domain>/v1` (`AUDIO_BASE` defaults to
  `FILES_BASE + "/audio"`). During development the repo's `data/` folder can be served as-is.
- Secrets: R2 keys only in `.env` / CI secrets, never in the client, never committed.

## 7. Caching and budget

- Service worker (`example/public/sw.js`): cache-first for `/mushaf/` and `/fonts/` (immutable), network-first for the app
  shell, no audio in the service worker (Range; the HTTP cache keeps audio).
- Prefetch only page JSON ±2 and fonts ±1 around the reader (±3 fonts for the open book); never download the whole
  mushaf without the user asking (the example's offline sheet: `example/src/mushaf/offline/`). Audio: one request per page.
- Free tiers (verify current numbers): R2 10 GB storage, 10 M reads, 1 M writes a month, free egress; Workers 100 k
  requests a day. 8 reciters ≈ 6.3 GB + fonts 93 MB.

## 8. Integration recipes

- **The whole app**: `cd example && npm install && npm run build` with `VITE_FILES_BASE` set → `example/dist/` is a
  static site (it can live under any host; the service worker is registered in production only).
- **Plain JS / any server-rendered site**: port the framework-free modules listed in §1 (fonts, data, audio queue and
  player, bands, book spreads, Arabic search) and draw a page as `QuranPageView.tsx` does.
- **React**: start from `example/src/mushaf/` (it is React 19 + Tailwind v4): page component loads the page + fonts
  (placeholder until both ready), `useQcfLineFit` in `useLayoutEffect`, fonts module stays a plain module; the audio player is a class outside React, read through
  `useSyncExternalStore`; swiping with a virtual RTL carousel (only current ±1 mounted).
- **Vue / Svelte**: same split (data + fonts modules, page component, player class).
- **Native / Flutter**: register the page font file and draw `g`; same line rules; platform audio player with the
  same `index.json` logic.

## 8.1 The example's reading rules (keep them if you copy it)

- From 1024 px wide the mushaf is the printed book: spreads 1|2, 3|4 … 603|604 (odd page on the right), a 3D turn of
  the outer edge over the spine (DOM clones of pages already drawn; transforms, filter and opacity only), drag, ← / →
  (ignored in inputs and while a dialog is open). `prefers-reduced-motion` or the "page-turn animation" setting off
  swaps the spread with no motion.
- A phone held sideways — `(orientation: landscape) and (max-height: 540px) and (pointer: coarse)` — never gets the
  book: one vertical scroll of full-width pages, a band with the page and the hizb quarter between them.
- On a phone the bars hide; a tap on the page shows them, with a soft scrim at the top and bottom only — no blur.
  When a recitation starts the bars hide again (a setting).
- The recited ayah is one flat band per line (no rounding, border or shadow); an ayah picked with a long press
  (450 ms, 8 px cancels) gets the same band in gold.
- RTL: the play triangle is mirrored, "next ayah" and "next page" are on the left; the header's title (surah, juz,
  page) opens the index, with no chevron.
- The settings (`example/src/settings/store.ts`) live in localStorage only: theme (light / dark / auto), the page
  colour by day (cream, white, sand) and by night (black, deep green), the phone's view (swipe / scroll), page-turn
  animation, keep the screen on, follow the reciter, hide the bars while listening, the language (ar / en / tr).
  `index.html` applies the theme before the app loads.
- The app has no account and no server of its own: every file is static.

## 9. Checks to run before saying it works

0. `cd example && npm run build` passes (TypeScript and the bundle).
1. Render pages 1, 2, 3, 50, 187, 342, 443, 552, 591, 604 at a 360 px wide viewport: no line has
   `scrollWidth > clientWidth`, 15 lines (header and basmala included) on pages ≥ 3, surah frames fill the width.
2. Throttle the network: a page never shows letters in a fallback font (placeholder first).
3. Open a page and look at the network: 1 page JSON + ≤ 3 fonts for the current page and its neighbours, not more.
4. Play from a word in the middle of a page: the right ayah is highlighted, the page turns at the last ayah, one audio
   request per page (the next page comes from the Blob prefetch).
5. Repeat ×2 on an ayah: it is read twice, then the next ayah.
6. Reload offline after reading a page: it draws from the service worker cache.
7. Arabic UI: next page / next ayah on the left.

## 10. Pitfalls

| Symptom | Cause | Fix |
|---|---|---|
| Random Arabic letters | drawn before the font loaded | `display: "block"`, placeholder until `load()` |
| A line overflows | glyphs wider at this size | line fit (§3.7) |
| Fonts blocked | no CORS | serve through the Worker |
| Works for you, not for users in Turkey | `*.r2.dev` blocked | Worker / custom domain |
| No sound on iPhone | play not started inside a tap | preload the index, call play in the handler |
| Stale data after an update | overwritten immutable files | new version folder |
| Wrong audio near page breaks | audio file located via the mushaf index | locate via the reciter index (`buildQueue`) |
| Rebuilding page data from QUL fails at 2:181, 8:6, 13:37 | QUL splits «بَعْدَ مَا» into two words | one word, both glyphs |

Do not modify the font files. Do not re-host the recordings publicly without reading the sources' terms.

## Thanks

This work stands on the shoulders of others, and we thank them sincerely: the **King Fahd Glorious Qur'an Printing
Complex** (the Madinah mushaf and its page fonts, used unmodified); **Tarteel — Quranic Universal Library (QUL)** (the
page layout and word-by-word glyph data, the surah header font); **Quran.com / Quran Foundation** (word ids);
**EveryAyah.com** (the ayah recordings); and the reciters Mahmoud Khalil Al-Husary, Mohamed Siddiq El-Minshawi, Saud
Al-Shuraim, Maher Al-Muaiqly, Yasser Al-Dosari, Mishary Rashid Alafasy, Abdul Basit Abdul Samad and Ali Jaber. All
rights to the fonts, page data and recordings belong to their owners; they are shared here freely as a non-commercial
service. Commercial users: read each source's terms first. The MIT licence covers this repository's code and guides.
