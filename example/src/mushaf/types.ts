/** One word (or ayah-end marker) of a page file (data/mushaf/pages, the 1421H print) */
export interface MushafWord {
  /** Global word id (Quran.com's word ids) */
  id: number;
  surah: number;
  ayah: number;
  /** Word position within the ayah (location = `${surah}:${ayah}:${pos}`) */
  pos: number;
  /** Uthmani text in Unicode (not drawn: the page shows `g`) */
  text: string;
  /** 1 when this entry is the ayah-end number glyph */
  end: 0 | 1;
  /** The word's glyph code(s) in its page's QCF V2 font — what is drawn; `text` is the same word in Unicode */
  g: string;
}

export type MushafLine =
  /** `centered`: a short line the print centers (end of a surah, the last page) instead of filling it */
  | { line: number; type: "words"; words: MushafWord[]; centered?: boolean }
  | { line: number; type: "header"; surah: number }
  /** `g` is drawn with the font of page `fontPage` (Al-Fatihah's first ayah) */
  | { line: number; type: "basmala"; g: string; fontPage: number };

export interface MushafPageData {
  page: number;
  /** "qcf-v2": the 1421H print, built from QUL's KFGQPC V2 layout + "QPC V2 Glyph - Word by Word" */
  script: string;
  lines: MushafLine[];
}

/** data/mushaf/mushaf_index.json */
export interface MushafIndex {
  /** Per page (index = page-1): [firstSurah, juz, hizb] */
  pageInfo: [number, number, number][];
  /** surah -> page of each ayah (index = ayah-1) */
  ayahPages: Record<string, number[]>;
}

/** How the reader moves between pages: book-like swiping or one long scroll */
export type MushafViewMode = "swipe" | "scroll";

