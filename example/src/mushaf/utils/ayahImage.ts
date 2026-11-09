/**
 * The picture an ayah is shared as, styled like a fine printed mushaf: a page of mushaf paper laid on a deep green
 * cover (a faint gold star lattice on the green), framed by a gold rule and a hairline with eight-pointed stars at the
 * corners. On the page: the print's own ornamental surah frame as the title, the ayah number in gold, then the ayah
 * drawn with the King Fahd Complex page fonts (exactly as printed, the number medallion in gold). On the green band
 * under the page: the mark «صوت المصحف» (paper bars, gold spine) and the app's name (`mushaf:ayahActions.brandLine`).
 * 1080 px wide (what social apps show at full size); as tall as the ayah needs, at least square.
 */
import { BARS, BRAND_TONES, MARK_H, MARK_W, SPINE_INDEX } from "@/brand/mark";
import { loadPageFont, loadSurahHeaderFont, pageFontFamily, SURAH_HEADER_FAMILY, surahHeaderGlyph } from "./mushafFonts";
import { breakLines, lineWidth, type PlacedWord } from "./ayahShare";

export interface AyahImageTexts {
  /** Under the surah frame: «الآية ٢٥٥» */
  ayahLabel: string;
  /** The title when the surah-frame font cannot be loaded: «سورة البقرة» */
  surahTitle: string;
  /** Next to the logo on the green band: the app's name («مكتبة القرآن») */
  brandLine: string;
  /** The labels' direction (the app's language) */
  rtl: boolean;
}

const WIDTH = 1080;
/** The green cover around the page, and the taller green band under it that carries the logo */
const COVER = 44;
const FOOTER = 180;
/** From the page's edge: the gold rule, then the hairline */
const RULE_INSET = 24;
const HAIRLINE_INSET = 36;
/** The text's margin from the picture's edge */
const MARGIN = 120;
const TOP_PAD = 78;
const BOTTOM_PAD = 86;

const INK = "#1f1b14";
const GREEN = "#0d3429";
const GOLD = "#b69445";
const GOLD_DEEP = "#8a6d2f";
const CREAM = "#efe5c8";
const UI_FONT = '"IBM Plex Sans Arabic", "IBM Plex Sans", sans-serif';
/** The mark «صوت المصحف» on the green band: its height, and its width from the mark's box */
const MARK_HEIGHT = 56;
const MARK_WIDTH = (MARK_HEIGHT * MARK_W) / MARK_H;

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** An eight-pointed star (two squares, one turned 45°) as a path centered on x, y. */
function starPath(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  // The inner corners of two overlapping squares sit at r · cos 45° / cos 22.5°
  const inner = r * 0.7654;
  ctx.beginPath();
  for (let i = 0; i < 16; i++) {
    const angle = (i * Math.PI) / 8 - Math.PI / 2;
    const radius = i % 2 === 0 ? r : inner;
    const px = x + radius * Math.cos(angle);
    const py = y + radius * Math.sin(angle);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

/** Gold leaf: a gold that catches the light twice across the picture. */
function foil(ctx: CanvasRenderingContext2D, height: number): CanvasGradient {
  const gradient = ctx.createLinearGradient(0, 0, WIDTH, height);
  gradient.addColorStop(0, "#9a7a35");
  gradient.addColorStop(0.28, "#d6b96f");
  gradient.addColorStop(0.5, "#b69445");
  gradient.addColorStop(0.72, "#dcc07a");
  gradient.addColorStop(1, "#9a7a35");
  return gradient;
}

/** A gold star with a fine rule on each side that fades away, centered on y. */
function ornament(ctx: CanvasRenderingContext2D, y: number, half: number, gold: CanvasGradient) {
  const center = WIDTH / 2;
  for (const side of [-1, 1]) {
    const rule = ctx.createLinearGradient(center + side * 24, 0, center + side * half, 0);
    rule.addColorStop(0, GOLD);
    rule.addColorStop(1, "rgba(182, 148, 69, 0)");
    ctx.strokeStyle = rule;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(center + side * 24, y);
    ctx.lineTo(center + side * half, y);
    ctx.stroke();
  }
  ctx.fillStyle = gold;
  starPath(ctx, center, y, 11);
  ctx.fill();
}

export async function renderAyahImage(words: PlacedWord[], surah: number, texts: AyahImageTexts): Promise<Blob> {
  if (words.length === 0) throw new Error("No words to draw");

  // The page fonts (an ayah can run over two pages), the surah frame, and the app's own font for the labels
  const pages = [...new Set(words.map((w) => w.page))];
  await Promise.all(pages.map((page) => loadPageFont(page)));
  const hasFrame = await loadSurahHeaderFont(pages[0]).then(
    () => true,
    () => false,
  );
  await Promise.all([document.fonts.load(`600 36px ${UI_FONT}`), document.fonts.load(`700 56px ${UI_FONT}`)]).catch(
    () => undefined,
  );

  // ---- Measure (a canvas resets when its size is set, so the layout is worked out first) ----
  const measure = document.createElement("canvas").getContext("2d");
  if (!measure) throw new Error("Canvas is not available");
  const maxWidth = WIDTH - MARGIN * 2;
  const glyphFont = (page: number, size: number) => `${size}px "${pageFontFamily(page)}"`;
  const metricsAt = (size: number) =>
    words.map(({ word, page }) => {
      measure.font = glyphFont(page, size);
      const m = measure.measureText(word.g);
      return { width: m.width, ascent: m.actualBoundingBoxAscent, descent: m.actualBoundingBoxDescent };
    });

  // Large for a short ayah; smaller (never under 40 px) until the ayah fits about seven lines, then the picture grows
  let size = 72;
  let metrics = metricsAt(size);
  let lines = breakLines(metrics.map((m) => m.width), maxWidth, size * 0.3);
  while (size > 40 && lines.length > 7) {
    size -= 4;
    metrics = metricsAt(size);
    lines = breakLines(metrics.map((m) => m.width), maxWidth, size * 0.3);
  }
  const gap = size * 0.3;
  const lineHeight = size * 1.9;

  const glyph = surahHeaderGlyph(surah);
  let frameSize = 0;
  let frameAscent = 0;
  let frameDescent = 0;
  if (hasFrame) {
    measure.font = `100px "${SURAH_HEADER_FAMILY}"`;
    const unit = measure.measureText(glyph).width / 100;
    frameSize = Math.min(240, (maxWidth * 0.86) / Math.max(unit, 0.01));
    measure.font = `${frameSize}px "${SURAH_HEADER_FAMILY}"`;
    const m = measure.measureText(glyph);
    frameAscent = m.actualBoundingBoxAscent;
    frameDescent = m.actualBoundingBoxDescent;
  }
  const titleHeight = hasFrame ? frameAscent + frameDescent : 64;

  // Title, the ayah number (32 px + room) and the ornament (+ room), above the ayah
  const header = COVER + TOP_PAD + titleHeight + 24 + 60 + 62;
  const ayahBlock = lines.length * lineHeight;
  const natural = header + ayahBlock + BOTTOM_PAD + FOOTER;
  const height = Math.max(WIDTH, Math.round(natural));
  // A short ayah sits in the middle of the free space
  const spare = height - natural;

  // ---- Draw ----
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available");
  const gold = foil(ctx, height);

  // The cover: deep green, a little lighter where the page lies, and a faint lattice of gold stars
  const cover = ctx.createRadialGradient(WIDTH / 2, height * 0.42, 0, WIDTH / 2, height * 0.42, height * 0.8);
  cover.addColorStop(0, "#145040");
  cover.addColorStop(0.55, GREEN);
  cover.addColorStop(1, "#071d16");
  ctx.fillStyle = cover;
  ctx.fillRect(0, 0, WIDTH, height);
  ctx.strokeStyle = "rgba(201, 162, 74, 0.09)";
  ctx.lineWidth = 1.2;
  const step = 54;
  for (let row = 0; row * step < height + step; row++) {
    for (let col = 0; col * step < WIDTH + step; col++) {
      starPath(ctx, col * step + (row % 2 ? step / 2 : 0), row * step, 9);
      ctx.stroke();
    }
  }

  // The page, lifted off the cover by a soft shadow
  const paperX = COVER;
  const paperY = COVER;
  const paperW = WIDTH - COVER * 2;
  const paperH = height - COVER - FOOTER;
  const paper = ctx.createRadialGradient(
    WIDTH / 2,
    paperY + paperH * 0.45,
    0,
    WIDTH / 2,
    paperY + paperH * 0.45,
    Math.max(paperW, paperH) * 0.72,
  );
  paper.addColorStop(0, "#fefbf4");
  paper.addColorStop(0.6, "#fbf6ea");
  paper.addColorStop(1, "#f2e7cf");
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.38)";
  ctx.shadowBlur = 36;
  ctx.shadowOffsetY = 10;
  ctx.fillStyle = paper;
  roundedRect(ctx, paperX, paperY, paperW, paperH, 22);
  ctx.fill();
  ctx.restore();

  // The page's frame: a gold rule, a hairline inside it, an eight-pointed star where the hairlines meet
  ctx.strokeStyle = gold;
  ctx.lineWidth = 2.5;
  roundedRect(ctx, paperX + RULE_INSET, paperY + RULE_INSET, paperW - RULE_INSET * 2, paperH - RULE_INSET * 2, 12);
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.7;
  ctx.strokeRect(
    paperX + HAIRLINE_INSET,
    paperY + HAIRLINE_INSET,
    paperW - HAIRLINE_INSET * 2,
    paperH - HAIRLINE_INSET * 2,
  );
  ctx.globalAlpha = 1;
  for (const [x, y] of [
    [paperX + HAIRLINE_INSET, paperY + HAIRLINE_INSET],
    [paperX + paperW - HAIRLINE_INSET, paperY + HAIRLINE_INSET],
    [paperX + HAIRLINE_INSET, paperY + paperH - HAIRLINE_INSET],
    [paperX + paperW - HAIRLINE_INSET, paperY + paperH - HAIRLINE_INSET],
  ]) {
    ctx.fillStyle = "#f6eedb";
    ctx.beginPath();
    ctx.arc(x, y, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = gold;
    starPath(ctx, x, y, 11);
    ctx.fill();
  }

  // Title: the print's surah frame (or the surah's name), then the ayah number and an ornament
  let y = COVER + TOP_PAD;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = GREEN;
  if (hasFrame) {
    ctx.direction = "ltr";
    ctx.font = `${frameSize}px "${SURAH_HEADER_FAMILY}"`;
    ctx.fillText(glyph, WIDTH / 2, y + frameAscent);
  } else {
    ctx.direction = "rtl";
    ctx.font = `700 56px ${UI_FONT}`;
    ctx.fillText(texts.surahTitle, WIDTH / 2, y + 52);
  }
  y += titleHeight + 24;
  ctx.direction = texts.rtl ? "rtl" : "ltr";
  ctx.fillStyle = GOLD_DEEP;
  ctx.font = `600 32px ${UI_FONT}`;
  ctx.fillText(texts.ayahLabel, WIDTH / 2, y + 32);
  y += 60;
  ornament(ctx, y + 10, 170, gold);
  y += 62 + spare / 2;

  // The ayah, line by line from the right, each line centered; the number medallion in gold
  ctx.direction = "ltr";
  ctx.textAlign = "left";
  for (const line of lines) {
    const lineMetrics = line.map((i) => metrics[i]);
    const ascent = Math.max(...lineMetrics.map((m) => m.ascent));
    const descent = Math.max(...lineMetrics.map((m) => m.descent));
    const baseline = y + (lineHeight - (ascent + descent)) / 2 + ascent;
    let x = WIDTH / 2 + lineWidth(lineMetrics.map((m) => m.width), gap) / 2;
    for (const i of line) {
      const { word, page } = words[i];
      x -= metrics[i].width;
      ctx.font = glyphFont(page, size);
      ctx.fillStyle = word.end === 1 ? GOLD_DEEP : INK;
      ctx.fillText(word.g, x, baseline);
      x -= gap;
    }
    y += lineHeight;
  }

  // The green band under the page: the mark in gold foil, a hairline, the app's name — one centered line
  const bandCenter = paperY + paperH + (height - (paperY + paperH)) / 2 + 2;
  ctx.direction = texts.rtl ? "rtl" : "ltr";
  ctx.font = `600 36px ${UI_FONT}`;
  const textWidth = ctx.measureText(texts.brandLine).width;
  const space = 26;
  const total = MARK_WIDTH + space + 1 + space + textWidth;
  const start = (WIDTH - total) / 2;
  const markX = texts.rtl ? start + total - MARK_WIDTH : start;
  const dividerX = texts.rtl ? markX - space : start + MARK_WIDTH + space;
  const textX = texts.rtl ? dividerX - space : dividerX + 1 + space;

  // The mark in its two colors on the deep green: paper bars and the gold spine
  ctx.save();
  ctx.translate(markX, bandCenter - MARK_HEIGHT / 2);
  ctx.scale(MARK_HEIGHT / MARK_H, MARK_HEIGHT / MARK_H);
  BARS.forEach(([x, y, h], i) => {
    roundedRect(ctx, x, y, 24, h, 12);
    ctx.fillStyle = i === SPINE_INDEX ? BRAND_TONES.onDark.spine : BRAND_TONES.onDark.bars;
    ctx.fill();
  });
  ctx.restore();

  ctx.fillStyle = "rgba(201, 162, 74, 0.55)";
  ctx.fillRect(dividerX, bandCenter - 26, 1, 52);

  ctx.textAlign = texts.rtl ? "right" : "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = CREAM;
  ctx.fillText(texts.brandLine, textX, bandCenter + 2);

  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not make the picture"))), "image/png"),
  );
}
