/**
 * Page bookmarks of the mushaf (the bookmark button in every mushaf header, the Bookmarks tab of the index).
 *
 * They are kept on this device only (localStorage). Nothing goes to any server.
 *
 * The list operations are pure; readBookmarks / saveBookmarks are the only ones touching storage.
 */
import { TOTAL_PAGES } from "@/lib/quranData";

export interface PageBookmark {
  page: number;
  /** When it was bookmarked (ms since 1970) */
  savedAt: number;
}

const STORE_KEY = "quran-library:bookmarks";

const isPage = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= TOTAL_PAGES;

/** A stored value as a list: real pages with a time only, newest first, one bookmark per page (the newest). */
export function cleanBookmarks(raw: unknown): PageBookmark[] {
  if (!Array.isArray(raw)) return [];
  const valid = raw.flatMap((item): PageBookmark[] => {
    if (typeof item !== "object" || item === null) return [];
    const { page, savedAt } = item as Record<string, unknown>;
    return isPage(page) && typeof savedAt === "number" && Number.isFinite(savedAt) ? [{ page, savedAt }] : [];
  });
  valid.sort((a, b) => b.savedAt - a.savedAt);
  const seen = new Set<number>();
  return valid.filter((bookmark) => !seen.has(bookmark.page) && seen.add(bookmark.page));
}

/** The pages among `pages` that are bookmarked. */
export const bookmarkedAmong = (list: readonly PageBookmark[], pages: readonly number[]): number[] =>
  pages.filter((page) => list.some((bookmark) => bookmark.page === page));

/** The page on top of the list; the same list when it is there already. */
export function addBookmark(list: readonly PageBookmark[], page: number, now: number): readonly PageBookmark[] {
  return list.some((bookmark) => bookmark.page === page) ? list : [{ page, savedAt: now }, ...list];
}

/** The list without these pages; the same list when none of them is in it. */
export function removeBookmarks(list: readonly PageBookmark[], pages: readonly number[]): readonly PageBookmark[] {
  const next = list.filter((bookmark) => !pages.includes(bookmark.page));
  return next.length === list.length ? list : next;
}

/**
 * The header button: removes the bookmarks of the pages on screen (`shown`: one page, or both pages of the open
 * book), or, when none of them has one, bookmarks the reader's page.
 */
export function toggleBookmark(
  list: readonly PageBookmark[],
  shown: readonly number[],
  page: number,
  now: number,
): readonly PageBookmark[] {
  const marked = bookmarkedAmong(list, shown);
  return marked.length > 0 ? removeBookmarks(list, marked) : addBookmark(list, page, now);
}

/** The bookmarks on this device (none when storage is blocked). */
export function readBookmarks(): PageBookmark[] {
  try {
    return cleanBookmarks(JSON.parse(localStorage.getItem(STORE_KEY) ?? "[]"));
  } catch {
    return [];
  }
}

/** Saves the bookmarks (a full or blocked storage keeps nothing, and the button then shows it). */
export function saveBookmarks(list: readonly PageBookmark[]): void {
  try {
    if (list.length === 0) localStorage.removeItem(STORE_KEY);
    else localStorage.setItem(STORE_KEY, JSON.stringify(list));
  } catch {
    // Private mode or full storage
  }
}
