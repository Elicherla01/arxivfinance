import { ArrowUpRight, BookOpen, Layers, RefreshCcwDot, TrendingUp } from "lucide-react";

import { ArchiveExplorer } from "@/components/archive-explorer";
import { RelativeTime } from "@/components/relative-time";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { fetchArchiveSnapshot, REVALIDATE_SECONDS } from "@/lib/arxiv";
import { CATEGORIES } from "@/lib/categories";

export const revalidate = 1800;

export default async function Home() {
  const snapshot = await fetchArchiveSnapshot();
  const failed = snapshot.feeds.filter((f) => f.error).length;

  const newestPublished = snapshot.latest[0]?.published ?? "";

  return (
    <main className="mx-auto w-full max-w-[1600px] px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-8">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="gap-1.5">
            <TrendingUp className="size-3" />
            arXiv Quantitative Finance
          </Badge>
          <a
            href="https://arxiv.org/archive/q-fin"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
          >
            arxiv.org/archive/q-fin
            <ArrowUpRight className="size-3" />
          </a>
        </div>

        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
          q-fin Digest
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          Latest submissions from every Quantitative Finance subject class, with an
          auto-generated summary, key findings and topic tags for each paper.
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
              newestPublished ? <RelativeTime iso={newestPublished} /> : "—"
            }
          />
          <StatCard
            icon={<RefreshCcwDot className="size-4" />}
            label="Cache window"
            value={`${Math.round(REVALIDATE_SECONDS / 60)} min`}
          />
        </div>
      </header>

      <ArchiveExplorer snapshot={snapshot} />

      <footer className="mt-12 border-t border-border pt-6 text-xs text-muted-foreground">
        <p>
          Data from the arXiv API. Summaries are generated locally by extractive
          ranking of each abstract — always read the source paper before citing.
          Thank you to arXiv for use of its open access interoperability.
        </p>
        <p className="mt-1">
          Fetched <RelativeTime iso={snapshot.fetchedAt} />.
        </p>
      </footer>
    </main>
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
