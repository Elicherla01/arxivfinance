/**
 * arXiv q-fin reader.
 *
 * Source archive page: https://arxiv.org/archive/q-fin
 * Data is pulled from the official Atom API (export.arxiv.org/api/query),
 * which is the supported machine-readable view of the same listings.
 */

import { CATEGORIES, type CategoryId } from "./categories";
import { summarizeAbstract, type PaperSummary } from "./summarize";

const API_BASE = "https://export.arxiv.org/api/query";
const USER_AGENT = "148-arxiv-qfin/1.0 (Next.js reader; contact via repo)";

/** arXiv asks clients to keep request rates modest. */
const BATCH_SIZE = 3;
const BATCH_DELAY_MS = 350;
export const REVALIDATE_SECONDS = 1800;

/**
 * arXiv throttles cloud IPs and can leave a request hanging. Without these
 * bounds a single stalled response blocks the prerender until the host's build
 * timeout kills it, so both a per-request timeout and a whole-snapshot budget
 * are enforced. Running out of budget degrades to a thinner page that the next
 * revalidation fills in — never a failed build.
 */
const REQUEST_TIMEOUT_MS = 12_000;
const REQUEST_ATTEMPTS = 2;
const SNAPSHOT_BUDGET_MS = 40_000;

export interface Paper {
  id: string;
  arxivId: string;
  title: string;
  abstract: string;
  authors: string[];
  published: string;
  updated: string;
  absUrl: string;
  pdfUrl: string;
  primaryCategory: string;
  categories: string[];
  qfinCategories: string[];
  comment?: string;
  journalRef?: string;
  doi?: string;
  summary: PaperSummary;
}

export interface CategoryFeed {
  categoryId: CategoryId;
  papers: Paper[];
  error?: string;
}

export interface ArchiveSnapshot {
  fetchedAt: string;
  feeds: CategoryFeed[];
  latest: Paper[];
  totalPapers: number;
}

function decodeEntities(input: string): string {
  return input
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      String.fromCharCode(parseInt(code, 16)),
    )
    .replace(/&amp;/g, "&");
}

function tidy(input: string | undefined): string {
  if (!input) return "";
  return decodeEntities(input).replace(/\s+/g, " ").trim();
}

function firstTag(xml: string, tag: string): string | undefined {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return match?.[1];
}

function allAttributes(xml: string, tag: string, attr: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<${tag}\\b[^>]*\\b${attr}="([^"]*)"[^>]*/?>`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) out.push(decodeEntities(m[1]));
  return out;
}

function linkByAttr(xml: string, attr: string, value: string): string | undefined {
  const re = new RegExp(`<link\\b[^>]*${attr}="${value}"[^>]*>`, "i");
  const tag = xml.match(re)?.[0];
  return tag?.match(/href="([^"]+)"/)?.[1];
}

function parseEntry(entryXml: string): Paper | null {
  const rawId = tidy(firstTag(entryXml, "id"));
  const title = tidy(firstTag(entryXml, "title"));
  const abstract = tidy(firstTag(entryXml, "summary"));
  if (!rawId || !title) return null;

  const arxivId = rawId.replace(/^https?:\/\/arxiv\.org\/abs\//, "");
  const authors = (entryXml.match(/<author>[\s\S]*?<\/author>/g) ?? [])
    .map((block) => tidy(firstTag(block, "name")))
    .filter(Boolean);

  const categories = Array.from(new Set(allAttributes(entryXml, "category", "term")));
  const primaryCategory =
    entryXml.match(/<arxiv:primary_category[^>]*term="([^"]+)"/)?.[1] ??
    categories[0] ??
    "";

  const qfinCategories = categories.filter((c) => c.startsWith("q-fin."));

  return {
    id: rawId,
    arxivId,
    title,
    abstract,
    authors,
    published: tidy(firstTag(entryXml, "published")),
    updated: tidy(firstTag(entryXml, "updated")),
    absUrl:
      linkByAttr(entryXml, "rel", "alternate") ?? `https://arxiv.org/abs/${arxivId}`,
    pdfUrl:
      linkByAttr(entryXml, "title", "pdf") ?? `https://arxiv.org/pdf/${arxivId}`,
    primaryCategory,
    categories,
    qfinCategories,
    comment: tidy(firstTag(entryXml, "arxiv:comment")) || undefined,
    journalRef: tidy(firstTag(entryXml, "arxiv:journal_ref")) || undefined,
    doi: tidy(firstTag(entryXml, "arxiv:doi")) || undefined,
    summary: summarizeAbstract(abstract, title),
  };
}

export function parseAtomFeed(xml: string): Paper[] {
  const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) ?? [];
  return entries
    .map(parseEntry)
    .filter((p): p is Paper => p !== null);
}

async function queryArxiv(
  searchQuery: string,
  maxResults: number,
  revalidate: number,
): Promise<Paper[]> {
  const url =
    `${API_BASE}?search_query=${encodeURIComponent(searchQuery)}` +
    `&sortBy=submittedDate&sortOrder=descending&start=0&max_results=${maxResults}`;

  let lastError: unknown;

  for (let attempt = 1; attempt <= REQUEST_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/atom+xml" },
        next: { revalidate },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (!res.ok) throw new Error(`arXiv responded ${res.status}`);
      return parseAtomFeed(await res.text());
    } catch (error) {
      lastError =
        error instanceof Error && error.name === "TimeoutError"
          ? new Error(`arXiv timed out after ${REQUEST_TIMEOUT_MS / 1000}s`)
          : error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("arXiv fetch failed");
}

/**
 * q-fin.EC is an alias for econ.GN, so papers are only ever tagged with the
 * econ code — querying `cat:q-fin.EC` directly returns nothing.
 */
const QUERY_ALIASES: Partial<Record<CategoryId, string>> = {
  "q-fin.EC": "econ.GN",
};

export async function fetchCategory(
  categoryId: CategoryId,
  maxResults = 15,
  revalidate = REVALIDATE_SECONDS,
): Promise<Paper[]> {
  const term = QUERY_ALIASES[categoryId] ?? categoryId;
  const papers = await queryArxiv(`cat:${term}`, maxResults, revalidate);

  if (term === categoryId) return papers;
  return papers.map((paper) => ({
    ...paper,
    qfinCategories: paper.qfinCategories.length
      ? paper.qfinCategories
      : [categoryId],
  }));
}

export async function fetchLatestAcrossQfin(
  maxResults = 40,
  revalidate = REVALIDATE_SECONDS,
): Promise<Paper[]> {
  return queryArxiv("cat:q-fin*", maxResults, revalidate);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Pull every q-fin subject class plus a combined "latest" stream. */
export async function fetchArchiveSnapshot(
  perCategory = 12,
  revalidate = REVALIDATE_SECONDS,
): Promise<ArchiveSnapshot> {
  const feeds: CategoryFeed[] = [];
  const deadline = Date.now() + SNAPSHOT_BUDGET_MS;

  for (let i = 0; i < CATEGORIES.length; i += BATCH_SIZE) {
    const batch = CATEGORIES.slice(i, i + BATCH_SIZE);

    if (Date.now() >= deadline) {
      feeds.push(
        ...batch.map((category) => ({
          categoryId: category.id,
          papers: [],
          error: "Skipped: arXiv was too slow to answer in time",
        })),
      );
      continue;
    }

    const settled = await Promise.all(
      batch.map(async (category): Promise<CategoryFeed> => {
        try {
          const papers = await fetchCategory(category.id, perCategory, revalidate);
          return { categoryId: category.id, papers };
        } catch (error) {
          return {
            categoryId: category.id,
            papers: [],
            error: error instanceof Error ? error.message : "Fetch failed",
          };
        }
      }),
    );
    feeds.push(...settled);
    if (i + BATCH_SIZE < CATEGORIES.length) await sleep(BATCH_DELAY_MS);
  }

  /** Merge the per-category feeds when the bulk query fails or is skipped. */
  const mergedLatest = () => {
    const seen = new Set<string>();
    return feeds
      .flatMap((f) => f.papers)
      .filter((p) => (seen.has(p.arxivId) ? false : seen.add(p.arxivId)))
      .sort((a, b) => b.published.localeCompare(a.published))
      .slice(0, 40);
  };

  let latest: Paper[] = [];
  if (Date.now() >= deadline) {
    latest = mergedLatest();
  } else {
    try {
      latest = await fetchLatestAcrossQfin(40, revalidate);
    } catch {
      latest = mergedLatest();
    }
  }

  const unique = new Set<string>();
  for (const feed of feeds) for (const p of feed.papers) unique.add(p.arxivId);
  for (const p of latest) unique.add(p.arxivId);

  return {
    fetchedAt: new Date().toISOString(),
    feeds,
    latest,
    totalPapers: unique.size,
  };
}
