import { useEffect } from "react";
import { KEEP_AWAKE_VIDEO } from "@/lib/keepAwakeVideo";

/**
 * iOS before 18.4 answers the Screen Wake Lock API inside an app added to the home screen, but the screen still
 * turns off there (WebKit bug 254545). iPadOS reports itself as a Mac with an old OS number, so it lands here too.
 */
export const wakeLockFailsSilently = (userAgent: string, standalone: boolean, touchMac: boolean): boolean => {
  const apple = /\b(iPhone|iPad|iPod)\b/.test(userAgent) || touchMac;
  if (!standalone || !apple) return false;
  const version = userAgent.match(/OS (\d+)[_.](\d+)/);
  if (!version) return true;
  const major = Number(version[1]);
  const minor = Number(version[2]);
  return major < 18 || (major === 18 && minor < 4);
};

const isStandalone = () =>
  (navigator as Navigator & { standalone?: boolean }).standalone === true ||
  window.matchMedia("(display-mode: standalone)").matches;

const GESTURES = ["pointerdown", "touchend", "keydown"] as const;

/**
 * Keeps the screen on while `active` (the mushaf is open), so a phone lying on the table during a recitation does
 * not go dark after a few seconds.
 *
 * - The Screen Wake Lock API where the browser has it. The browser drops the lock whenever the page is hidden (another
 *   app, the phone locked), so it is taken again each time the page becomes visible; it is released on leaving.
 * - Where the API is missing (older iPhones, many in-app browsers), refused, or known to do nothing (iOS home-screen
 *   apps before 18.4): a tiny silent video plays in a loop — a playing video with sound keeps a phone awake. A
 *   browser only lets it start from a tap, so it starts on the reader's first touch or key and again after the page
 *   was hidden. It is 4 s long, so phones show no media notification for it.
 */
export function useScreenWakeLock(active = true): void {
  useEffect(() => {
    if (!active || typeof document === "undefined") return;

    let disposed = false;
    let sentinel: WakeLockSentinel | null = null;
    let requesting = false;
    let video: HTMLVideoElement | null = null;
    let useVideo =
      !("wakeLock" in navigator) ||
      wakeLockFailsSilently(navigator.userAgent, isStandalone(), navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

    const playVideo = () => {
      if (disposed || document.visibilityState !== "visible") return;
      if (!video) {
        video = document.createElement("video");
        video.src = KEEP_AWAKE_VIDEO;
        video.loop = true;
        video.playsInline = true;
        video.disableRemotePlayback = true;
        video.setAttribute("playsinline", "");
        video.setAttribute("webkit-playsinline", "");
        video.setAttribute("aria-hidden", "true");
        video.tabIndex = -1;
        // In the page (some phones ignore a video outside it), but too small and faint to be seen
        Object.assign(video.style, {
          position: "fixed",
          bottom: "0",
          left: "0",
          width: "1px",
          height: "1px",
          opacity: "0.01",
          pointerEvents: "none",
          zIndex: "-1",
        });
        document.body.appendChild(video);
      }
      if (!video.paused) return;
      // Refused without a tap: the next touch starts it (the gesture listeners stay until it plays)
      video.play().then(stopWaitingForTap, () => undefined);
    };

    const takeLock = async (fromGesture: boolean) => {
      if (disposed || useVideo || sentinel || requesting || document.visibilityState !== "visible") return;
      requesting = true;
      try {
        const lock = await navigator.wakeLock.request("screen");
        if (disposed) {
          await lock.release();
          return;
        }
        sentinel = lock;
        lock.addEventListener("release", () => {
          if (sentinel === lock) sentinel = null;
        });
        stopWaitingForTap();
      } catch {
        // Refused. Some browsers want a tap first: try again on the next one. Refused even then (battery saver, an
        // embedding page's policy…): the video.
        if (fromGesture) {
          useVideo = true;
          playVideo();
        } else {
          waitForTap();
        }
      } finally {
        requesting = false;
      }
    };

    const keepAwake = (fromGesture = false) => {
      if (useVideo) playVideo();
      else void takeLock(fromGesture);
    };

    const onGesture = () => keepAwake(true);
    let waitingForTap = true;
    function stopWaitingForTap() {
      if (!waitingForTap) return;
      waitingForTap = false;
      for (const type of GESTURES) document.removeEventListener(type, onGesture, true);
    }
    const waitForTap = () => {
      if (waitingForTap) return;
      waitingForTap = true;
      for (const type of GESTURES) document.addEventListener(type, onGesture, true);
    };
    for (const type of GESTURES) document.addEventListener(type, onGesture, true);

    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      // Coming back: the lock was dropped and the video paused while hidden. Retake it now; a video that needs a
      // tap starts on the next one.
      waitForTap();
      keepAwake();
    };
    document.addEventListener("visibilitychange", onVisibility);

    keepAwake();

    return () => {
      disposed = true;
      stopWaitingForTap();
      document.removeEventListener("visibilitychange", onVisibility);
      void sentinel?.release().catch(() => undefined);
      sentinel = null;
      if (video) {
        video.pause();
        video.removeAttribute("src");
        video.load();
        video.remove();
        video = null;
      }
    };
  }, [active]);
}
