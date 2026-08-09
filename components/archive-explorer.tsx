"use client";

import * as React from "react";
import {
  BookOpen,
  CalendarRange,
  Layers,
  LayoutGrid,
  RefreshCcwDot,
  RefreshCw,
  Search,
  SlidersHorizontal,
  TriangleAlert,
  X,
} from "lucide-react";

import { PaperCard } from "@/components/paper-card";
import { RelativeTime } from "@/components/relative-time";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ArchiveSnapshot, Paper, SearchResult } from "@/lib/arxiv";
import { CATEGORIES } from "@/lib/categories";
import {
  DEFAULT_RANGE,
  RANGES,
  RANGE_ORDER,
  REVALIDATE_SECONDS,
  type RangeKey,
} from "@/lib/config";
import { cn } from "@/lib/utils";

type SortKey = "newest" | "oldest" | "authors";
type Status = "loading" | "ready" | "error";

const SORTS: Array<{ key: SortKey; label: string }> = [
  { key: "newest", label: "Newest" },
  { key: "oldest", label: "Oldest" },
  { key: "authors", label: "Most authors" },
];

/** Cards added per "Show more" click, so a year of papers stays responsive. */
const PAGE_SIZE = 48;
const SEARCH_DEBOUNCE_MS = 400;
const MIN_QUERY_LENGTH = 2;

interface SearchState {
  query: string;
  range: RangeKey;
  papers: Paper[];
  total: number;
  error?: string;
}

function sortPapers(papers: Paper[], key: SortKey): Paper[] {
  const copy = [...papers];
  if (key === "newest") {
    return copy.sort((a, b) => b.published.localeCompare(a.published));
  }
  if (key === "oldest") {
    return copy.sort((a, b) => a.published.localeCompare(b.published));
  }
  return copy.sort((a, b) => b.authors.length - a.authors.length);
}

async function fetchSnapshot(
  range: RangeKey,
  refresh: boolean,
  signal?: AbortSignal,
): Promise<ArchiveSnapshot> {
  const params = new URLSearchParams({ range });
  if (refresh) params.set("refresh", "1");

  const res = await fetch(`/api/papers?${params}`, {
    cache: "no-store",
    signal,
  });
  if (!res.ok) throw new Error(`Request failed with ${res.status}`);

  const data = (await res.json()) as ArchiveSnapshot & { error?: string };
  if (data.error) throw new Error(data.error);
  // A snapshot with nothing in it means every upstream call failed; show that
  // as an error rather than an empty grid the reader cannot explain.
  if (!data.totalPapers && data.warning) throw new Error(data.warning);
  return data;
}

async function fetchSearch(
  query: string,
  range: RangeKey,
  signal?: AbortSignal,
): Promise<SearchResult> {
  const params = new URLSearchParams({ q: query, range });
  const res = await fetch(`/api/search?${params}`, { signal });

  const data = (await res.json()) as SearchResult & { error?: string };
  if (!res.ok || data.error) {
    throw new Error(data.error ?? `Search failed with ${res.status}`);
  }
  return data;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : "Could not reach the arXiv API";
}

export function ArchiveExplorer() {
  const [snapshot, setSnapshot] = React.useState<ArchiveSnapshot | null>(null);
  const [status, setStatus] = React.useState<Status>("loading");
  const [errorMessage, setErrorMessage] = React.useState("");
  const [refreshing, setRefreshing] = React.useState(false);
  const [range, setRange] = React.useState<RangeKey>(DEFAULT_RANGE);

  const [query, setQuery] = React.useState("");
  const [search, setSearch] = React.useState<SearchState | null>(null);
  const [sort, setSort] = React.useState<SortKey>("newest");
  const [tab, setTab] = React.useState("latest");

  React.useEffect(() => {
    const controller = new AbortController();

    void (async () => {
      try {
        const data = await fetchSnapshot(DEFAULT_RANGE, false, controller.signal);
        setSnapshot(data);
        setStatus("ready");
      } catch (error) {
        if (controller.signal.aborted) return;
        setErrorMessage(describeError(error));
        setStatus("error");
      }
    })();

    return () => controller.abort();
  }, []);

  const load = async (nextRange: RangeKey, forceRefresh: boolean) => {
    if (forceRefresh) setRefreshing(true);
    else setStatus("loading");
    setRange(nextRange);

    try {
      const data = await fetchSnapshot(nextRange, forceRefresh);
      setSnapshot(data);
      setStatus("ready");
    } catch (error) {
      setErrorMessage(describeError(error));
      setStatus("error");
    } finally {
      setRefreshing(false);
    }
  };

  const trimmed = query.trim();
  const searching = trimmed.length >= MIN_QUERY_LENGTH;

  // Searches go to arXiv rather than filtering the loaded window, so they reach
  // the whole q-fin archive — including papers that were never on screen.
  React.useEffect(() => {
    if (trimmed.length < MIN_QUERY_LENGTH) return;

    const controller = new AbortController();
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const data = await fetchSearch(trimmed, range, controller.signal);
          setSearch({ query: trimmed, range, papers: data.papers, total: data.total });
        } catch (error) {
          if (controller.signal.aborted) return;
          setSearch({
            query: trimmed,
            range,
            papers: [],
            total: 0,
            error: describeError(error),
          });
        }
      })();
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmed, range]);

  const searchReady =
    search !== null && search.query === trimmed && search.range === range;

  const visible = React.useCallback(
    (papers: Paper[]) => sortPapers(papers, sort),
    [sort],
  );

  // Changing any of these should start the list over. Feeding it as a key
  // remounts PaperGrid, which resets its own paging without an effect.
  const viewKey = `${searching ? `search:${query}` : tab}|${sort}|${range}`;

  if (status === "loading") return <ExplorerSkeleton range={range} />;

  if (status === "error" || !snapshot) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-8 text-center">
        <TriangleAlert className="mx-auto size-6 text-destructive" />
        <p className="mt-3 font-medium text-foreground">Could not load papers</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          {errorMessage}. arXiv occasionally throttles requests — trying again
          usually works.
        </p>
        <Button className="mt-4" onClick={() => void load(range, false)}>
          <RefreshCw />
          Try again
        </Button>
      </div>
    );
  }

  const activeRange = RANGES[snapshot.range] ?? RANGES[DEFAULT_RANGE];
  const windowLabel =
    activeRange.days === null
      ? "the latest submissions"
      : `the last ${activeRange.label.toLowerCase()}`;
  const truncated =
    activeRange.days !== null && snapshot.windowTotal > snapshot.totalPapers;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<BookOpen className="size-4" />}
          label="Papers loaded"
          value={String(snapshot.totalPapers)}
        />
        <StatCard
          icon={<Layers className="size-4" />}
          label={
            activeRange.days === null ? "In q-fin archive" : "On arXiv in window"
          }
          value={snapshot.windowTotal ? String(snapshot.windowTotal) : "—"}
        />
        <StatCard
          icon={<CalendarRange className="size-4" />}
          label="Window"
          value={
            activeRange.days === null
              ? "Latest"
              : `Last ${activeRange.label.toLowerCase()}`
          }
        />
        <StatCard
          icon={<RefreshCcwDot className="size-4" />}
          label="Updated"
          value={<RelativeTime iso={snapshot.fetchedAt} />}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the entire arXiv q-fin archive — titles, abstracts, authors…"
            className="pl-9 pr-9"
            aria-label="Search the entire arXiv q-fin archive"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1 rounded-lg bg-secondary/60 p-1">
          <CalendarRange className="ml-1.5 size-3.5 text-muted-foreground" />
          {RANGE_ORDER.map((key) => (
            <button
              key={key}
              onClick={() => void load(key, false)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                range === key
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {RANGES[key].label}
            </button>
          ))}
        </div>

        <div
          className={cn(
            "flex items-center gap-1 rounded-lg bg-secondary/60 p-1",
            // Search results arrive ranked by relevance; re-sorting them by
            // date would throw that ranking away.
            searching && "hidden",
          )}
        >
          <SlidersHorizontal className="ml-1.5 size-3.5 text-muted-foreground" />
          {SORTS.map((s) => (
            <button
              key={s.key}
              onClick={() => setSort(s.key)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                sort === s.key
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => void load(range, true)}
          disabled={refreshing}
        >
          <RefreshCw className={cn(refreshing && "animate-spin")} />
          {refreshing ? "Refreshing" : "Refresh"}
        </Button>
      </div>

      {searching ? (
        <section>
          <div className="mb-4 flex flex-wrap items-baseline gap-2">
            <h2 className="text-base font-semibold text-foreground">
              {searchReady
                ? `${search.total} match${search.total === 1 ? "" : "es"} for “${trimmed}”`
                : `Searching arXiv for “${trimmed}”…`}
            </h2>
            <p className="text-sm text-muted-foreground">
              Searching the entire q-fin archive — titles, abstracts, authors and
              comments — from {windowLabel}, ranked by relevance.
              {searchReady && search.total > search.papers.length
                ? ` Showing the top ${search.papers.length}.`
                : ""}
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto"
              onClick={() => setQuery("")}
            >
              <X />
              Clear search
            </Button>
          </div>

          {!searchReady ? (
            <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-72 rounded-xl" />
              ))}
            </div>
          ) : search.error ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {search.error}
            </p>
          ) : (
            <PaperGrid key={viewKey} papers={search.papers} query={trimmed} />
          )}
        </section>
      ) : (
        <Tabs value={tab} onValueChange={setTab}>
          <div className="-mx-1 overflow-x-auto px-1 pb-1">
            <TabsList className="w-max">
              <TabsTrigger value="latest">
                <LayoutGrid className="size-3.5" />
                Latest
                <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[10px]">
                  {snapshot.latest.length}
                </Badge>
              </TabsTrigger>
              {CATEGORIES.map((category) => {
                const feed = snapshot.feeds.find(
                  (f) => f.categoryId === category.id,
                );
                return (
                  <TabsTrigger key={category.id} value={category.id}>
                    <span
                      className="size-2 rounded-full"
                      style={{ background: category.accent }}
                    />
                    {category.name}
                    <Badge
                      variant="secondary"
                      className="ml-1 px-1.5 py-0 text-[10px]"
                    >
                      {feed?.papers.length ?? 0}
                    </Badge>
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </div>

          <TabsContent value="latest">
            <p className="mb-4 text-sm text-muted-foreground">
              Most recent submissions across every q-fin subject class.
              {truncated &&
                ` Loaded the ${snapshot.totalPapers} newest of ${snapshot.windowTotal} submitted in ${windowLabel} — widen or narrow the window to change the slice.`}
            </p>
            <PaperGrid key={viewKey} papers={visible(snapshot.latest)} query="" />
          </TabsContent>

          {CATEGORIES.map((category) => {
            const feed = snapshot.feeds.find((f) => f.categoryId === category.id);

            return (
              <TabsContent key={category.id} value={category.id}>
                <div className="mb-4 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <h2 className="text-base font-semibold text-foreground">
                    {category.name}
                  </h2>
                  <code className="rounded bg-secondary/70 px-1.5 py-0.5 text-[11px] text-muted-foreground">
                    {category.id}
                  </code>
                  <p className="w-full text-sm text-muted-foreground">
                    {category.blurb}
                  </p>
                </div>
                {feed?.error && (
                  <p className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    Could not load this class: {feed.error}
                  </p>
                )}
                <PaperGrid
                  key={viewKey}
                  papers={visible(feed?.papers ?? [])}
                  query=""
                />
              </TabsContent>
            );
          })}
        </Tabs>
      )}

      <p className="pt-1 text-xs text-muted-foreground">
        Upstream responses are cached for {Math.round(REVALIDATE_SECONDS / 60)}{" "}
        minutes. Use Refresh to bypass the cache. Wider windows take longer to
        load, since each subject class is fetched separately.
      </p>
    </div>
  );
}

function PaperGrid({ papers, query }: { papers: Paper[]; query: string }) {
  const [shown, setShown] = React.useState(PAGE_SIZE);

  if (!papers.length) {
    return (
      <div className="rounded-xl border border-dashed border-border py-16 text-center">
        <p className="text-sm text-muted-foreground">
          {query
            ? `Nothing in the q-fin archive matches “${query}” in this window. Try a wider window or fewer words.`
            : "No papers returned for this subject class right now."}
        </p>
      </div>
    );
  }

  const page = papers.slice(0, shown);

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {page.map((paper, i) => (
          <PaperCard key={paper.id} paper={paper} index={i} />
        ))}
      </div>

      {page.length < papers.length && (
        <div className="mt-6 flex flex-col items-center gap-2">
          <p className="text-xs text-muted-foreground">
            Showing {page.length} of {papers.length}
          </p>
          <Button variant="outline" onClick={() => setShown((n) => n + PAGE_SIZE)}>
            Show more
          </Button>
        </div>
      )}
    </>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="rounded-lg bg-primary/10 p-2 text-primary">{icon}</div>
        <div className="min-w-0">
          <p className="truncate text-xs text-muted-foreground">{label}</p>
          <p className="text-lg font-semibold tracking-tight">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function ExplorerSkeleton({ range }: { range: RangeKey }) {
  const config = RANGES[range] ?? RANGES[DEFAULT_RANGE];

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[74px] rounded-xl" />
        ))}
      </div>
      {config.days !== null && (
        <p className="text-center text-xs text-muted-foreground">
          Fetching the last {config.label.toLowerCase()} from all nine subject
          classes — this takes longer than the default window.
        </p>
      )}
      <Skeleton className="h-9 w-full rounded-md" />
      <Skeleton className="h-11 w-full max-w-3xl rounded-lg" />
      <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-72 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
