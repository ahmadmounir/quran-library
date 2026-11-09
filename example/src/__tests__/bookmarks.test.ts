import { describe, expect, it } from "vitest";
import { bookmarkedAmong, cleanBookmarks, toggleBookmark } from "@/mushaf/utils/bookmarks";

describe("page bookmarks", () => {
  it("keeps real pages only, newest first, one per page", () => {
    expect(
      cleanBookmarks([
        { page: 3, savedAt: 10 },
        { page: 0, savedAt: 20 },
        { page: 605, savedAt: 20 },
        { page: 3, savedAt: 30 },
        { page: 50, savedAt: 25 },
        "page 7",
        null,
      ]),
    ).toEqual([
      { page: 3, savedAt: 30 },
      { page: 50, savedAt: 25 },
    ]);
    expect(cleanBookmarks({ page: 1 })).toEqual([]);
  });

  it("toggles: removes the pages on screen that have one, or bookmarks the reader's page", () => {
    const empty = toggleBookmark([], [1, 2], 1, 100);
    expect(empty).toEqual([{ page: 1, savedAt: 100 }]);
    // The open book: a bookmark on either page of the spread counts, and pressing removes it
    const marked = [{ page: 2, savedAt: 5 }];
    expect(bookmarkedAmong(marked, [1, 2])).toEqual([2]);
    expect(toggleBookmark(marked, [1, 2], 1, 100)).toEqual([]);
  });
});
