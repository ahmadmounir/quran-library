import { useEffect, useState } from "react";

/**
 * A phone turned sideways: a touch screen in landscape that is short (a phone on its side is 320–480 CSS px high;
 * a tablet on its side is 600 or more). Width is not part of it on purpose: a phone on its side can be wider than the
 * desktop breakpoint (1024px) and must still get the phone's landscape mushaf, never the open book. A laptop window
 * made short has a mouse (`pointer: fine`), so it keeps its view.
 */
export const PHONE_LANDSCAPE_QUERY = "(orientation: landscape) and (max-height: 540px) and (pointer: coarse)";

const matches = () => typeof window !== "undefined" && window.matchMedia(PHONE_LANDSCAPE_QUERY).matches;

/** True while the mushaf is read on a phone held sideways (MushafLandscapeView). */
export function usePhoneLandscape(): boolean {
  // Read at once, so the first render already picks the right view (no remount)
  const [landscape, setLandscape] = useState(matches);

  useEffect(() => {
    const mql = window.matchMedia(PHONE_LANDSCAPE_QUERY);
    const onChange = () => setLandscape(mql.matches);
    mql.addEventListener("change", onChange);
    setLandscape(mql.matches);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return landscape;
}
