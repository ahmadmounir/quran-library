/**
 * The mark «صوت المصحف» (geometry in mark.ts): nine bars of a reciting voice drawing an open mushaf, the gold bar in
 * the middle is its spine — always two colours. The colours come from --mark-bars / --mark-spine (styles/index.css):
 * "auto" follows light / dark, a BrandTone pins one background's colours.
 */
import type { CSSProperties } from "react";
import { cn } from "@/lib/cn";
import { BARS, MARK_H, MARK_W, SPINE_INDEX, type BrandTone } from "./mark";

export type LogoTone = "auto" | BrandTone;

const toneClass = (tone: LogoTone) => (tone === "auto" ? undefined : `mark-tone-${tone}`);

function Bars({ animated = false }: { animated?: boolean }) {
  return (
    <>
      {BARS.map(([x, y, h], i) => (
        <rect
          key={i}
          x={x}
          y={y}
          width={24}
          height={h}
          rx={12}
          fill={i === SPINE_INDEX ? "var(--mark-spine)" : "var(--mark-bars)"}
          className={animated ? "mark-loader-bar" : undefined}
          style={animated ? ({ "--ring": Math.abs(i - SPINE_INDEX) } as CSSProperties) : undefined}
        />
      ))}
    </>
  );
}

/** The mark alone */
export function LogoMark({ className, tone = "auto" }: { className?: string; tone?: LogoTone }) {
  return (
    <svg viewBox={`0 0 ${MARK_W} ${MARK_H}`} className={cn("h-6 w-auto", toneClass(tone), className)} aria-hidden="true">
      <Bars />
    </svg>
  );
}

/** The app icon: the mark in paper and gold on the deep green tile */
export function LogoTile({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "mark-tone-onDark inline-flex size-9 shrink-0 items-center justify-center rounded-[22%] bg-brand-ink",
        className,
      )}
    >
      <svg viewBox={`0 0 ${MARK_W} ${MARK_H}`} className="h-auto w-[64%]" aria-hidden="true">
        <Bars />
      </svg>
    </span>
  );
}

const LOADER_SIDE = MARK_W * 1.12;

/** The loader «التلاوة»: the bars dip and rise from the spine outward. Still for reduced motion (styles/index.css). */
export function MarkLoader({ className, tone = "auto" }: { className?: string; tone?: LogoTone }) {
  return (
    <svg
      viewBox={`${(-(LOADER_SIDE - MARK_W) / 2).toFixed(1)} ${(-(LOADER_SIDE - MARK_H) / 2).toFixed(1)} ${LOADER_SIDE.toFixed(1)} ${LOADER_SIDE.toFixed(1)}`}
      className={cn("size-16", toneClass(tone), className)}
      aria-hidden="true"
    >
      <Bars animated />
    </svg>
  );
}
