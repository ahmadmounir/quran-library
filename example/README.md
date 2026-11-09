# The example: the mushaf app

[العربية](../README.ar.md) · [English](../README.md) · [Türkçe](../README.tr.md) — the full explanation is the guide,
[`docs/en/GUIDE.md`](../docs/en/GUIDE.md) (also [`ar`](../docs/ar/GUIDE.md), [`tr`](../docs/tr/GUIDE.md)).

The mushaf of our Hafiz platform as a small app of its own (React 19 + Vite + Tailwind v4), with no account and no
server: an open book with a 3D page turn on a computer, one page at a time on a phone, a scrolling mushaf on a phone
held sideways, the index, search, eight reciters, a long press to hear or share an ayah, bookmarks, the reader's
settings (day / night / automatic, page colour, language …) and the whole mushaf offline on request.

```bash
npm install
npm run dev        # http://localhost:5175 — the repository's data/ is served at /data
npm test           # the pure modules (book spreads, bands, queue, player, search, offline rules, translations)
npm run build      # example/dist/: static files for any host
```

## Settings

Copy `.env.example` to `.env.local` (git-ignored):

| Variable | What | Default |
|---|---|---|
| `VITE_FILES_BASE` | the folder laid out like `data/` (mushaf, fonts, audio): your Worker or domain, e.g. `https://files.example.com/v1` | `/data` (the dev server serves `../data`) |
| `VITE_AUDIO_BASE` | the reciters, if not under `VITE_FILES_BASE/audio` | `VITE_FILES_BASE/audio` |

The MP3s are not in git: build them with `node tools/audio/build-reciter.mjs husary` from the repository's root, or
point `VITE_AUDIO_BASE` at audio you host yourself. Never point an app at someone else's Worker or bucket.

The name shown on the share picture and the lock screen is `common:appName` / `mushaf:ayahActions.brandLine` in
`src/i18n/locales/*/` — put your own there.

## Where things are

| Path (`src/`) | What |
|---|---|
| `config.ts` | the files' address |
| `mushaf/MushafPage.tsx` | the page that ties it together: which view, the bars, the sheets |
| `mushaf/components/` | a page (`QuranPageView`), the open book, the phone views, header, index, search, ayah sheet |
| `mushaf/audio/` | reciters, play list, player (framework-free), the ayah band, the player bar |
| `mushaf/utils/` | page data, fonts (framework-free queue), book spreads, hizb quarters, the share picture, bookmarks |
| `mushaf/offline/` | the whole-mushaf download and its schedule |
| `settings/` | the reader's settings and their sheet |
| `brand/` | the mark «صوت المصحف» |
| `styles/index.css` | the theme, and every `.mushaf-*` rule (the page colours are `--mushaf-*` variables) |
| `../public/sw.js` | the service worker (production builds only) |

## Thanks

This work stands on the shoulders of others, and we thank them sincerely: the King Fahd Glorious Qur'an Printing
Complex (the Madinah mushaf and its page fonts, used unmodified), Tarteel — Quranic Universal Library (QUL) (page
layout and word-by-word glyph data, surah header font), Quran.com / Quran Foundation (word ids), EveryAyah.com (the
ayah recordings) and the reciters. All rights to the fonts, page data and recordings belong to their owners; they are
shared freely as a non-commercial service — commercial users must read each source's terms first.
