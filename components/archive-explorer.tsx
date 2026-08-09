"use client";

import * as React from "react";
import {
  BookOpen,
  Layers,
  LayoutGrid,
  RefreshCcwDot,
  RefreshCw,
  Search,
  SlidersHorizontal,
  TrendingUp,
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
import type { ArchiveSnapshot, Paper } from "@/lib/arxiv";
import { CATEGORIES } from "@/lib/categories";
import { REVALIDATE_SECONDS } from "@/lib/config";
import { cn } from "@/lib/utils";

type SortKey = "newest" | "oldest" | "authors";
type Status = "loading" | "ready" | "error";

const SORTS: Array<{ key: SortKey; label: string }> = [
  { key: "newest", label: "Newest" },
  { key: "oldest", label: "Oldest" },
  { key: "authors", label: "Most authors" },
];

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

function matches(paper: Paper, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    paper.title.toLowerCase().includes(q) ||
    paper.abstract.toLowerCase().includes(q) ||
    paper.authors.some((a) => a.toLowerCase().includes(q)) ||
    paper.summary.topics.some((t) => t.toLowerCase().includes(q)) ||
    paper.arxivId.toLowerCase().includes(q)
  );
}

async function fetchSnapshot(
  refresh: boolean,
  signal?: AbortSignal,
): Promise<ArchiveSnapshot> {
  const res = await fetch(`/api/papers${refresh ? "?refresh=1" : ""}`, {
    cache: "no-store",
    signal,
  });
  if (!res.ok) throw new Error(`Request failed with ${res.status}`);

  const data = (await res.json()) as ArchiveSnapshot & { error?: string };
  if (data.error) throw new Error(data.error);
  return data;
}

function describeError(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Could not reach the arXiv API";
}

export function ArchiveExplorer() {
  const [snapshot, setSnapshot] = React.useState<ArchiveSnapshot | null>(null);
  const [status, setStatus] = React.useState<Status>("loading");
  const [errorMessage, setErrorMessage] = React.useState("");
  const [refreshing, setRefreshing] = React.useState(false);

  const [query, setQuery] = React.useState("");
  const [sort, setSort] = React.useState<SortKey>("newest");
  const [tab, setTab] = React.useState("latest");

  // State is only touched after the await, so the initial load does not cascade
  // renders. Aborting on unmount keeps a slow arXiv from setting state late.
  React.useEffect(() => {
    const controller = new AbortController();

    void (async () => {
      try {
        const data = await fetchSnapshot(false, controller.signal);
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

  /** Retry and Refresh run from event handlers, where setState is fine. */
  const reload = async (forceRefresh: boolean) => {
    if (forceRefresh) setRefreshing(true);
    else setStatus("loading");

    try {
      const data = await fetchSnapshot(forceRefresh);
      setSnapshot(data);
      setStatus("ready");
    } catch (error) {
      setErrorMessage(describeError(error));
      setStatus("error");
    } finally {
      setRefreshing(false);
    }
  };

  const feedMap = React.useMemo(() => {
    const map = new Map<string, Paper[]>();
    for (const feed of snapshot?.feeds ?? []) map.set(feed.categoryId, feed.papers);
    return map;
  }, [snapshot]);

  const visible = React.useCallback(
    (papers: Paper[]) => sortPapers(papers.filter((p) => matches(p, query)), sort),
    [query, sort],
  );

  if (status === "loading") return <ExplorerSkeleton />;

  if (status === "error" || !snapshot) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-8 text-center">
        <TriangleAlert className="mx-auto size-6 text-destructive" />
        <p className="mt-3 font-medium text-foreground">Could not load papers</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          {errorMessage}. arXiv occasionally throttles requests — trying again
          usually works.
        </p>
        <Button className="mt-4" onClick={() => void reload(false)}>
          <RefreshCw />
          Try again
        </Button>
      </div>
    );
  }

  const latestVisible = visible(snapshot.latest);
  const failed = snapshot.feeds.filter((f) => f.error).length;

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
          label="Subject classes"
          value={`${CATEGORIES.length - failed} / ${CATEGORIES.length}`}
        />
        <StatCard
          icon={<TrendingUp className="size-4" />}
          label="Newest submission"
          value={
            snapshot.latest[0] ? (
              <RelativeTime iso={snapshot.latest[0].published} />
            ) : (
              "—"
            )
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
            placeholder="Search titles, abstracts, authors, topics…"
            className="pl-9 pr-9"
            aria-label="Search papers"
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
          onClick={() => void reload(true)}
          disabled={refreshing}
        >
          <RefreshCw className={cn(refreshing && "animate-spin")} />
          {refreshing ? "Refreshing" : "Refresh"}
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <TabsList className="w-max">
            <TabsTrigger value="latest">
              <LayoutGrid className="size-3.5" />
              Latest
              <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[10px]">
                {latestVisible.length}
              </Badge>
            </TabsTrigger>
            {CATEGORIES.map((category) => (
              <TabsTrigger key={category.id} value={category.id}>
                <span
                  className="size-2 rounded-full"
                  style={{ background: category.accent }}
                />
                {category.name}
                <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[10px]">
                  {visible(feedMap.get(category.id) ?? []).length}
                </Badge>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="latest">
          <p className="mb-4 text-sm text-muted-foreground">
            Most recent submissions across every q-fin subject class.
          </p>
          <PaperGrid papers={latestVisible} query={query} />
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
              <PaperGrid papers={visible(feed?.papers ?? [])} query={query} />
            </TabsContent>
          );
        })}
      </Tabs>

      <p className="pt-1 text-xs text-muted-foreground">
        Upstream responses are cached for {Math.round(REVALIDATE_SECONDS / 60)}{" "}
        minutes. Use Refresh to bypass the cache.
      </p>
    </div>
  );
}

function PaperGrid({ papers, query }: { papers: Paper[]; query: string }) {
  if (!papers.length) {
    return (
      <div className="rounded-xl border border-dashed border-border py-16 text-center">
        <p className="text-sm text-muted-foreground">
          {query
            ? `No papers match “${query}”.`
            : "No papers returned for this subject class right now."}
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
      {papers.map((paper, i) => (
        <PaperCard key={paper.id} paper={paper} index={i} />
      ))}
    </div>
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

function ExplorerSkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[74px] rounded-xl" />
        ))}
      </div>
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
