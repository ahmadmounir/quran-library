import { useState, useEffect } from "react";

/** The mushaf's desktop breakpoint (lg): dual-page spread + nav arrows. */
const DESKTOP_BREAKPOINT = 1024;

export function useIsDesktop() {
  // Read at once, so the first render already picks the desktop book or the phone pages (no remount)
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== "undefined" && window.matchMedia(`(min-width: ${DESKTOP_BREAKPOINT}px)`).matches,
  );

  useEffect(() => {
    const mql = window.matchMedia(`(min-width: ${DESKTOP_BREAKPOINT}px)`);
    const onChange = () => setIsDesktop(mql.matches);
    mql.addEventListener("change", onChange);
    setIsDesktop(mql.matches);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isDesktop;
}
