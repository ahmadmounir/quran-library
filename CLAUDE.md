# CLAUDE.md

This repository is a library + guide for building a Quran mushaf (1421H Madinah print, King Fahd Complex page fonts,
word by word, reciters' audio, Cloudflare hosting). **Read [AGENTS.md](AGENTS.md) first**: it is the specification.

Working on this repository itself:

- The data, tools and guides need no build. The example (`example/`) is a Vite + React + Tailwind app — the mushaf
  of the Hafiz platform without accounts or server: `cd example && npm install && npm run dev` (port 5175; it serves
  `../data` at `/data`), and `npm run build` must pass. Audio for local tests: `VITE_AUDIO_BASE` in
  `example/.env.local` (git-ignored), never in a file in git.
- The example's look follows the Hafiz mushaf one to one; a change there should be carried over here (and the
  reading rules in AGENTS.md §8.1 kept). The mark «صوت المصحف» is in `example/src/brand/` (copied numbers, not
  generated here).
- `data/` is the published data. Never modify the font files. The MP3s under `data/audio/<id>/` are build output
  (git-ignored); only `index.json` and `reciters.json` are committed.
- Audio tools need Node 20+ and ffmpeg: `node tools/audio/build-reciter.mjs <id …|all>` downloads the recordings from
  EveryAyah and builds the MP3s (`PAGES=1-3` for a quick test into `sources/test/`). A rebuild must give the same
  `index.json` as the committed one (the tool compares and says so).
- R2 keys live only in `.env` (git-ignored); see `.env.example`.
- The guides exist in three languages (`docs/ar`, `docs/en`, `docs/tr`) and the READMEs too: change all three
  together. Every Markdown file ends with the "Thanks" section.

## Thanks

This work stands on the shoulders of others, and we thank them sincerely: the King Fahd Glorious Qur'an Printing
Complex, Tarteel — Quranic Universal Library (QUL), Quran.com / Quran Foundation, EveryAyah.com, and the reciters. All
rights to the fonts, page data and recordings belong to their owners; they are shared freely as a non-commercial
service.
