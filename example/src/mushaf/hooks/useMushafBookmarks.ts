import { useSyncExternalStore } from "react";
import {
  bookmarkedAmong,
  readBookmarks,
  removeBookmarks,
  saveBookmarks,
  toggleBookmark,
  type PageBookmark,
} from "../utils/bookmarks";

interface Snapshot {
  /** Bookmarks can be kept (always, here: they live on the device) */
  available: boolean;
  bookmarks: readonly PageBookmark[];
}

// One copy for every header button and the index drawer, read again from storage after each change and when another
// tab changes it, so what is shown is always what is stored (a full storage keeps nothing, and the button says so).
let snapshot: Snapshot | null = null;
const listeners = new Set<() => void>();

const load = (): Snapshot => ({ available: true, bookmarks: readBookmarks() });

/** Reads storage again; true when something changed (the snapshot is then a new object). */
function refresh(): boolean {
  const next = load();
  if (snapshot && JSON.stringify(next) === JSON.stringify(snapshot)) return false;
  snapshot = next;
  return true;
}

function reload(): void {
  if (refresh()) listeners.forEach((listener) => listener());
}

const onStorage = () => reload();

function subscribe(listener: () => void): () => void {
  // The first one in reads afresh (React reads the snapshot again after subscribing)
  if (listeners.size === 0) {
    refresh();
    window.addEventListener("storage", onStorage);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
}

const getSnapshot = (): Snapshot => (snapshot ??= load());

function change(update: (list: readonly PageBookmark[]) => readonly PageBookmark[]): void {
  const current = getSnapshot().bookmarks;
  const next = update(current);
  if (next === current) return;
  saveBookmarks(next);
  reload();
}

/** The page bookmarks of this device, shared by every component that shows them. */
export function useMushafBookmarks() {
  const { available, bookmarks } = useSyncExternalStore(subscribe, getSnapshot);
  return {
    available,
    bookmarks,
    /** The header button: see `toggleBookmark` */
    toggle: (shown: readonly number[], page: number) => change((list) => toggleBookmark(list, shown, page, Date.now())),
    remove: (page: number) => change((list) => removeBookmarks(list, [page])),
  };
}

/**
 * The bookmark button of a mushaf header: whether the pages on screen (one page, or the open book's two) are
 * bookmarked, and the action.
 */
export function usePageBookmark(shown: readonly number[], page: number) {
  const { available, bookmarks, toggle } = useMushafBookmarks();
  return {
    available,
    marked: bookmarkedAmong(bookmarks, shown).length > 0,
    toggle: () => toggle(shown, page),
  };
}
