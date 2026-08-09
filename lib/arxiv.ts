/**
 * arXiv q-fin reader.
 *
 * Source archive page: https://arxiv.org/archive/q-fin
 * Data is pulled from the official Atom API (export.arxiv.org/api/query),
 * which is the supported machine-readable view of the same listings.
 */

import { CATEGORIES, type CategoryId } from "./categories";
import {
  DEFAULT_RANGE,
  RANGES,
  REVALIDATE_SECONDS,
  type RangeConfig,
  type RangeKey,
} from "./config";
export { REVALIDATE_SECONDS };

const API_BASE = "https://export.arxiv.org/api/query";
const USER_AGENT = "148-arxiv-qfin/1.0 (Next.js reader; contact via repo)";

/** arXiv asks for one connection at a time and ~one request every 3 seconds. */
const REQUEST_GAP_MS = 3_000;
const RETRY_BACKOFF_MS = 1_500;
const RATE_LIMIT_BACKOFF_MS = 6_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`arXiv timed out after ${Math.round(ms / 1000)}s`)),
        ms,
      );
    }),
  ]).finally(() => clearTimeout(timer)) as Promise<T>;
}

/**
 * arXiv throttles cloud IPs and can leave a request hanging. Without these
 * bounds a single stalled response blocks the prerender until the host's build
 * timeout kills it, so both a per-request timeout and a whole-snapshot budget
 * are enforced. Running out of budget degrades to a thinner page that the next
 * revalidation fills in — never a failed build.
 */
const REQUEST_ATTEMPTS = 2;

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
}

export interface CategoryFeed {
  categoryId: CategoryId;
  papers: Paper[];
  error?: string;
}

export interface ArchiveSnapshot {
  fetchedAt: string;
  range: RangeKey;
  feeds: CategoryFeed[];
  latest: Paper[];
  totalPapers: number;
  /** Submissions in the window upstream, so the UI can show what was left out. */
  windowTotal: number;
  warning?: string;
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
  };
}

export function parseAtomFeed(xml: string): Paper[] {
  const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) ?? [];
  return entries
    .map(parseEntry)
    .filter((p): p is Paper => p !== null);
}

interface QueryResult {
  papers: Paper[];
  /** Matches in the whole window, which can exceed what was requested. */
  total: number;
}

/** arXiv wants `submittedDate:[YYYYMMDDHHMM TO YYYYMMDDHHMM]`. */
function submittedDateFilter(days: number): string {
  const stamp = (d: Date, endOfDay: boolean) =>
    [
      d.getUTCFullYear(),
      String(d.getUTCMonth() + 1).padStart(2, "0"),
      String(d.getUTCDate()).padStart(2, "0"),
      endOfDay ? "2359" : "0000",
    ].join("");

  const now = new Date();
  const from = new Date(now.getTime() - days * 24 * 60 * 60_000);
  return `submittedDate:[${stamp(from, false)} TO ${stamp(now, true)}]`;
}

async function queryArxiv(
  searchQuery: string,
  maxResults: number,
  revalidate: number,
  timeoutMs: number,
  deadline = Number.POSITIVE_INFINITY,
  sortBy: "submittedDate" | "relevance" = "submittedDate",
): Promise<QueryResult> {
  // Deep `start` offsets are dramatically slower than one larger request, so
  // results are always taken from a single page.
  const url =
    `${API_BASE}?search_query=${encodeURIComponent(searchQuery)}` +
    `&sortBy=${sortBy}&sortOrder=descending&start=0&max_results=${maxResults}`;

  let lastError: unknown;
  let rateLimited = false;

  for (let attempt = 1; attempt <= REQUEST_ATTEMPTS; attempt++) {
    // Never let a retry run past the caller's budget; a serverless function
    // that overruns is killed with no response at all.
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;

    const limit = Math.min(timeoutMs, remaining);

    try {
      // Raced rather than relying on the abort signal alone: under Next's
      // cached fetch an aborted request has been observed to keep running,
      // which is how a 45s budget once turned into a 101s response.
      const res = await withTimeout(
        fetch(url, {
          headers: { "User-Agent": USER_AGENT, Accept: "application/atom+xml" },
          next: { revalidate },
          signal: AbortSignal.timeout(limit),
        }),
        limit,
      );

      if (res.status === 429) {
        rateLimited = true;
        throw new Error("arXiv rate limited this request (429)");
      }
      if (!res.ok) throw new Error(`arXiv responded ${res.status}`);

      const xml = await withTimeout(res.text(), limit);
      const papers = parseAtomFeed(xml);
      const total = Number(
        xml.match(/<opensearch:totalResults[^>]*>(\d+)</)?.[1] ?? papers.length,
      );
      return { papers, total };
    } catch (error) {
      lastError =
        error instanceof Error && error.name === "TimeoutError"
          ? new Error(`arXiv timed out after ${timeoutMs / 1000}s`)
          : error;

      // Retrying a throttled request immediately just earns another 429.
      if (attempt < REQUEST_ATTEMPTS) {
        await sleep(rateLimited ? RATE_LIMIT_BACKOFF_MS : RETRY_BACKOFF_MS);
        rateLimited = false;
      }
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
  range: RangeConfig = RANGES[DEFAULT_RANGE],
  revalidate = REVALIDATE_SECONDS,
): Promise<QueryResult> {
  const term = QUERY_ALIASES[categoryId] ?? categoryId;
  const searchQuery =
    range.days === null
      ? `cat:${term}`
      : `cat:${term} AND ${submittedDateFilter(range.days)}`;

  const result = await queryArxiv(
    searchQuery,
    range.perCategory,
    revalidate,
    range.requestTimeoutMs,
  );

  if (term === categoryId) return result;
  return {
    ...result,
    papers: result.papers.map((paper) => ({
      ...paper,
      qfinCategories: paper.qfinCategories.length
        ? paper.qfinCategories
        : [categoryId],
    })),
  };
}

/** Everything q-fin, including the econ.GN papers that q-fin.EC aliases. */
const QFIN_SCOPE = "(cat:q-fin* OR cat:econ.GN)";

export interface SearchResult {
  query: string;
  range: RangeKey;
  papers: Paper[];
  /** Matches in the archive, which can exceed the number returned. */
  total: number;
}

/**
 * Search the whole q-fin archive rather than the loaded window. arXiv's `all:`
 * field covers titles, abstracts, authors and comments, so this reaches papers
 * the reader has never had on screen.
 */
export async function searchArchive(
  rawQuery: string,
  rangeKey: RangeKey = DEFAULT_RANGE,
  limit = 100,
  revalidate = REVALIDATE_SECONDS,
): Promise<SearchResult> {
  const range = RANGES[rangeKey] ?? RANGES[DEFAULT_RANGE];

  // Field prefixes, quotes and boolean operators would change the meaning of
  // the query we build, so the user's text is reduced to plain terms.
  const cleaned = rawQuery
    .replace(/[^\p{L}\p{N}\s.\-']/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) {
    return { query: rawQuery, range: range.key, papers: [], total: 0 };
  }

  const term = cleaned.includes(" ") ? `all:"${cleaned}"` : `all:${cleaned}`;
  const parts = [term, QFIN_SCOPE];
  if (range.days !== null) parts.push(submittedDateFilter(range.days));

  const { papers, total } = await queryArxiv(
    parts.join(" AND "),
    limit,
    revalidate,
    range.requestTimeoutMs,
    Date.now() + range.requestTimeoutMs,
    "relevance",
  );

  return { query: rawQuery, range: range.key, papers, total };
}

function withWindow(term: string, days: number | null): string {
  return days === null
    ? `cat:${term}`
    : `cat:${term} AND ${submittedDateFilter(days)}`;
}

/**
 * Pull a window of q-fin papers and bucket them into subject classes.
 *
 * arXiv asks for a single connection and roughly one request every three
 * seconds, so this deliberately makes two sequential requests rather than one
 * per subject class: a fan-out across all nine gets the caller throttled with
 * 429s, which is exactly what happened before this was rewritten.
 */
export async function fetchArchiveSnapshot(
  rangeKey: RangeKey = DEFAULT_RANGE,
  revalidate = REVALIDATE_SECONDS,
): Promise<ArchiveSnapshot> {
  const range = RANGES[rangeKey] ?? RANGES[DEFAULT_RANGE];
  const deadline = Date.now() + range.budgetMs;

  const collected: Paper[] = [];
  const errors: string[] = [];
  let windowTotal = 0;
  const started = Date.now();

  try {
    const bulk = await queryArxiv(
      withWindow("q-fin*", range.days),
      range.bulk,
      revalidate,
      range.requestTimeoutMs,
      deadline,
    );
    collected.push(...bulk.papers);
    windowTotal += bulk.total;
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "q-fin fetch failed");
  }

  // econ.GN is what q-fin.EC aliases; those papers carry no q-fin code at all,
  // so `cat:q-fin*` never returns them and they need their own pass.
  if (Date.now() < deadline) {
    await sleep(REQUEST_GAP_MS);
    try {
      const econ = await queryArxiv(
        withWindow("econ.GN", range.days),
        range.econ,
        revalidate,
        range.requestTimeoutMs,
        deadline,
      );
      collected.push(
        ...econ.papers.map((paper) => ({
          ...paper,
          qfinCategories: paper.qfinCategories.length
            ? paper.qfinCategories
            : ["q-fin.EC"],
        })),
      );
      windowTotal += econ.total;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "econ fetch failed");
    }
  }

  const seen = new Set<string>();
  const papers = collected
    .filter((p) => (seen.has(p.arxivId) ? false : seen.add(p.arxivId)))
    .sort((a, b) => b.published.localeCompare(a.published));

  const feeds: CategoryFeed[] = CATEGORIES.map((category) => ({
    categoryId: category.id,
    papers: papers.filter((p) => p.qfinCategories.includes(category.id)),
  }));

  // arXiv latency swings from 100ms to a minute depending on how it is feeling
  // about your IP, so keep a breadcrumb for diagnosing slow loads.
  console.log(
    `[arxiv] ${range.key}: ${papers.length} papers in ${Date.now() - started}ms` +
      (errors.length ? ` (${errors.join("; ")})` : ""),
  );

  return {
    fetchedAt: new Date().toISOString(),
    range: range.key,
    feeds,
    latest: papers,
    totalPapers: papers.length,
    windowTotal,
    warning: papers.length === 0 && errors.length ? errors[0] : undefined,
  };
}
