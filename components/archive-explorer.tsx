"use client";

import * as React from "react";
import { LayoutGrid, RefreshCw, Search, SlidersHorizontal, X } from "lucide-react";

import { PaperCard } from "@/components/paper-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CATEGORIES } from "@/lib/categories";
import type { ArchiveSnapshot, Paper } from "@/lib/arxiv";
import { cn } from "@/lib/utils";

type SortKey = "newest" | "oldest" | "authors";

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

export function ArchiveExplorer({ snapshot }: { snapshot: ArchiveSnapshot }) {
  const [query, setQuery] = React.useState("");
  const [sort, setSort] = React.useState<SortKey>("newest");
  const [tab, setTab] = React.useState("latest");
  const [refreshing, setRefreshing] = React.useState(false);

  const feedMap = React.useMemo(() => {
    const map = new Map<string, Paper[]>();
    for (const feed of snapshot.feeds) map.set(feed.categoryId, feed.papers);
    return map;
  }, [snapshot.feeds]);

  const visible = React.useCallback(
    (papers: Paper[]) => sortPapers(papers.filter((p) => matches(p, query)), sort),
    [query, sort],
  );

  const refresh = async () => {
    setRefreshing(true);
    try {
      await fetch("/api/papers?refresh=1", { cache: "no-store" });
      window.location.reload();
    } catch {
      setRefreshing(false);
    }
  };

  const latestVisible = visible(snapshot.latest);

  return (
    <div className="space-y-5">
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

        <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing}>
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
            {CATEGORIES.map((category) => {
              const count = visible(feedMap.get(category.id) ?? []).length;
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
                    {count}
                  </Badge>
                </TabsTrigger>
              );
            })}
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
          const papers = visible(feed?.papers ?? []);
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
              <PaperGrid papers={papers} query={query} />
            </TabsContent>
          );
        })}
      </Tabs>
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
