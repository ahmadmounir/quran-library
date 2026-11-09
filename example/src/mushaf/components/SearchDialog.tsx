import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/i18n";
import { Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
} from "@/ui";
import type { Chapter } from "@/lib/quranData";
import { getChapterName } from "@/lib/quranData";
import { surahMatches } from "@/lib/arabicSearch";
import {
  getSearchCorpus,
  searchVerses,
  type SearchResult,
} from "../utils/mushafData";

interface SearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chapters: Chapter[];
  /** Navigate to the result's page and flash the ayah */
  onSelect: (result: SearchResult) => void;
  /** Open a surah found by its name or number */
  onSurahSelect: (chapter: Chapter) => void;
}

/** At most this many surahs above the ayat (a short name like «ال» would list them all). */
const MAX_SURAHS = 6;

/**
 * Instant search over the surahs' names and all 6,236 ayat: with or without harakat and hamza, any alef, ى / ي,
 * ة / ه (shared/utils/arabicSearch). Matching surahs first, then the ayat and how many there are.
 */
export function SearchDialog({
  open,
  onOpenChange,
  chapters,
  onSelect,
  onSurahSelect,
}: SearchDialogProps) {
  const { t, language } = useI18n();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [total, setTotal] = useState(0);
  const [corpusFailed, setCorpusFailed] = useState(false);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      setTotal(0);
      return;
    }
    // Warm the corpus as soon as the dialog opens
    getSearchCorpus().catch(() => setCorpusFailed(true));
  }, [open]);

  useEffect(() => {
    let cancelled = false;
    if (!query.trim()) {
      setResults([]);
      setTotal(0);
      return;
    }
    getSearchCorpus()
      .then((corpus) => {
        if (cancelled) return;
        const found = searchVerses(corpus, query);
        setResults(found.results);
        setTotal(found.total);
      })
      .catch(() => {
        if (!cancelled) setCorpusFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [query]);

  const surahs = useMemo(
    () => (query.trim() ? chapters.filter((chapter) => surahMatches(chapter, query)).slice(0, MAX_SURAHS) : []),
    [chapters, query],
  );

  const searched = query.trim().length >= 2 || surahs.length > 0;
  const nothing = searched && surahs.length === 0 && results.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("mushaf:search")}</DialogTitle>
          <DialogDescription className="sr-only"></DialogDescription>
        </DialogHeader>

        <div className="relative" dir="rtl">
          <Search className="absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            dir="rtl"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("mushaf:searchPlaceholder")}
            className="pe-9"
          />
        </div>

        <div className="max-h-[50dvh] space-y-1 overflow-y-auto">
          {corpusFailed && surahs.length === 0 ? (
            <p className="py-6 text-center text-muted-foreground">
              {t("mushaf:failedToLoadMessage")}
            </p>
          ) : nothing ? (
            <p className="py-6 text-center text-muted-foreground">
              {t("mushaf:noResults")}
            </p>
          ) : (
            <>
              {surahs.length > 0 && (
                <section aria-label={t("mushaf:searchSurahs")} className="pb-1">
                  <p className="px-3 pb-1 pt-1 text-muted-foreground">{t("mushaf:searchSurahs")}</p>
                  {surahs.map((chapter) => (
                    <button
                      key={chapter.id}
                      type="button"
                      onClick={() => onSurahSelect(chapter)}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-start transition-colors hover:bg-muted cursor-pointer"
                    >
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 font-medium tabular-nums text-primary">
                        {chapter.id}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium text-foreground">{chapter.name_arabic}</span>
                        <span className="block truncate text-muted-foreground">
                          {chapter.name_simple} · {t("mushaf:searchAyatCount", { count: chapter.verses_count })}
                        </span>
                      </span>
                    </button>
                  ))}
                </section>
              )}

              {results.length > 0 && (
                <section aria-label={t("mushaf:searchAyat")}>
                  <p className="px-3 pb-1 pt-1 text-muted-foreground">
                    {t("mushaf:searchResultsCount", { count: total })}
                  </p>
                  {results.map((result) => (
                    <button
                      key={`${result.surah}:${result.ayah}`}
                      type="button"
                      onClick={() => onSelect(result)}
                      className="w-full rounded-lg px-3 py-2.5 text-start transition-colors hover:bg-muted cursor-pointer"
                    >
                      <span dir="rtl" className="block text-lg leading-8">
                        {result.text}
                      </span>
                      <span className="block text-muted-foreground">
                        {getChapterName(chapters, result.surah, language)} · {result.ayah}
                      </span>
                    </button>
                  ))}
                  {total > results.length && (
                    <p className="px-3 py-2 text-center text-muted-foreground">
                      {t("mushaf:searchShowingFirst", { shown: results.length })}
                    </p>
                  )}
                </section>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
