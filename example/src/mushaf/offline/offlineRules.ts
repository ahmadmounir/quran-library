/**
 * The rules of the whole-mushaf download and its update (no browser access here, so they can be unit-tested).
 *
 * The mushaf never downloads by itself: a page is kept on the device when it is opened (the service worker,
 * public/sw.js), and the whole of it only when the reader presses download in the offline sheet.
 */

/** Free space that must remain on the device after a scheduled update. */
export const SPARE_BYTES = 50_000_000;

/** The subset of the Network Information API that matters (Android Chrome has it; iPhones do not). */
export interface ConnectionInfo {
  type?: string;
  saveData?: boolean;
}

/**
 * The scheduled update downloads only when the network allows it: online, never with "Data Saver" on, and never on a
 * mobile network when the browser can tell.
 */
export function networkAllows(connection: ConnectionInfo | undefined, online: boolean): boolean {
  if (!online) return false;
  if (connection?.saveData) return false;
  const type = connection?.type;
  return !type || ["wifi", "ethernet", "wimax", "other", "unknown"].includes(type);
}

/** How often a downloaded mushaf is checked and completed (what the browser cleared, a new version of the data). */
export type MushafUpdateEvery = "once" | "biweekly" | "monthly";

export const UPDATE_EVERY_DAYS: Record<MushafUpdateEvery, number | null> = { once: null, biweekly: 14, monthly: 30 };

const DAY_MS = 24 * 60 * 60 * 1000;

/** The stored choice; anything unknown is "once" (nothing runs by itself). */
export const parseUpdateEvery = (raw: string | null): MushafUpdateEvery =>
  raw === "biweekly" || raw === "monthly" ? raw : "once";

/**
 * Whether the downloaded mushaf is due to be checked now: only when the reader downloaded it themselves (`wanted`),
 * chose an update period, and that period has passed since it was last found complete. Checking reads the device
 * only; what is missing then downloads (on a network `networkAllows`).
 */
export function updateDue(input: {
  every: MushafUpdateEvery;
  wanted: boolean;
  checkedAt: number | null;
  now: number;
}): boolean {
  const days = UPDATE_EVERY_DAYS[input.every];
  if (days === null || !input.wanted) return false;
  return input.checkedAt === null || input.now - input.checkedAt >= days * DAY_MS;
}
