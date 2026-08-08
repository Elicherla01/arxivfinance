"use client";

import * as React from "react";
import {
  ArrowUpRight,
  ChevronDown,
  Clock3,
  FileText,
  Sparkles,
  Users,
} from "lucide-react";

import { RelativeTime } from "@/components/relative-time";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { CATEGORY_MAP, categoryAccent } from "@/lib/categories";
import type { Paper } from "@/lib/arxiv";
import { cn, formatAuthors, formatDate } from "@/lib/utils";

export function PaperCard({ paper, index = 0 }: { paper: Paper; index?: number }) {
  const [open, setOpen] = React.useState(false);
  const accent = categoryAccent(paper.qfinCategories[0] ?? paper.primaryCategory);

  return (
    <Card
      className="animate-fade-rise overflow-hidden transition-colors hover:border-primary/40"
      style={{ animationDelay: `${Math.min(index, 12) * 25}ms` }}
    >
      <div className="h-0.5 w-full" style={{ background: accent }} />

      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {paper.qfinCategories.slice(0, 3).map((cat) => (
            <Badge
              key={cat}
              variant="outline"
              style={{ color: categoryAccent(cat), borderColor: `${categoryAccent(cat)}55` }}
            >
              {CATEGORY_MAP.get(cat)?.name ?? cat}
            </Badge>
          ))}
          <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
            <Clock3 className="size-3" />
            <RelativeTime iso={paper.published} />
          </span>
        </div>

        <a
          href={paper.absUrl}
          target="_blank"
          rel="noreferrer"
          className="group mt-1 block text-base font-semibold leading-snug tracking-tight text-foreground hover:text-primary"
        >
          {paper.title}
          <ArrowUpRight className="ml-1 inline size-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
        </a>

        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Users className="size-3 shrink-0" />
          <span className="truncate">{formatAuthors(paper.authors)}</span>
        </p>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
          <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-primary">
            <Sparkles className="size-3" />
            Summary
          </p>
          <p className="text-sm leading-relaxed text-foreground/90">
            {paper.summary.tldr}
          </p>
        </div>

        {paper.summary.highlights.length > 0 && (
          <ul className="space-y-1.5">
            {paper.summary.highlights.map((line, i) => (
              <li key={i} className="flex gap-2 text-sm text-muted-foreground">
                <span
                  className="mt-1.5 size-1.5 shrink-0 rounded-full"
                  style={{ background: accent }}
                />
                <span className="leading-relaxed">{line}</span>
              </li>
            ))}
          </ul>
        )}

        {paper.summary.topics.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {paper.summary.topics.map((topic) => (
              <Badge key={topic} variant="secondary" className="font-normal">
                {topic}
              </Badge>
            ))}
          </div>
        )}

        <Separator />

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="font-mono">{paper.arxivId}</span>
          <span aria-hidden>·</span>
          <span>{formatDate(paper.published)}</span>
          <span aria-hidden>·</span>
          <span>{paper.summary.readingMinutes} min abstract</span>

          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
            >
              Abstract
              <ChevronDown
                className={cn("transition-transform", open && "rotate-180")}
              />
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href={paper.pdfUrl} target="_blank" rel="noreferrer">
                <FileText />
                PDF
              </a>
            </Button>
          </div>
        </div>

        {open && (
          <div className="animate-fade-rise space-y-2 rounded-lg bg-secondary/40 p-3">
            <p className="text-sm leading-relaxed text-muted-foreground">
              {paper.abstract}
            </p>
            {(paper.comment || paper.journalRef) && (
              <p className="text-xs text-muted-foreground/80">
                {paper.journalRef ? `${paper.journalRef} · ` : ""}
                {paper.comment}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
