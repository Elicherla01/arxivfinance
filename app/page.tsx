import { ArrowUpRight, TrendingUp } from "lucide-react";

import { ArchiveExplorer } from "@/components/archive-explorer";
import { SiteFooter } from "@/components/site-footer";
import { Badge } from "@/components/ui/badge";

/**
 * Deliberately free of data fetching: the shell is fully static so a deploy can
 * never depend on arXiv being reachable or fast. Papers are loaded from
 * /api/papers in the browser, which caches upstream responses for 30 minutes.
 */
export default function Home() {
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
      </header>

      <ArchiveExplorer />

      <SiteFooter />
    </main>
  );
}
