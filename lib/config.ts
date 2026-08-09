/**
 * Shared between the server data layer and client components. Kept apart from
 * `lib/arxiv.ts` so importing a constant does not pull the whole arXiv client
 * into the browser bundle.
 */
export const REVALIDATE_SECONDS = 1800;

export type RangeKey = "recent" | "1m" | "6m" | "1y";

export interface RangeConfig {
  key: RangeKey;
  label: string;
  /** Size of the submission window; null means "newest, no date filter". */
  days: number | null;
  /**
   * Newest N across every q-fin class in the window. arXiv publishes far more
   * q-fin work in a year than is useful to ship to a browser — roughly 4,000 —
   * so wide windows load the newest slice and the UI says what was left out.
   */
  bulk: number;
  /** Second pass for econ.GN, which q-fin.EC aliases and `cat:q-fin*` misses. */
  econ: number;
  /** Only used by the single-class endpoint. */
  perCategory: number;
  budgetMs: number;
  requestTimeoutMs: number;
}

export const RANGES: Record<RangeKey, RangeConfig> = {
  recent: {
    key: "recent",
    label: "Recent",
    days: null,
    bulk: 200,
    econ: 60,
    perCategory: 25,
    budgetMs: 30_000,
    requestTimeoutMs: 20_000,
  },
  "1m": {
    key: "1m",
    label: "1 month",
    days: 30,
    bulk: 350,
    econ: 110,
    perCategory: 80,
    budgetMs: 40_000,
    requestTimeoutMs: 25_000,
  },
  "6m": {
    key: "6m",
    label: "6 months",
    days: 182,
    bulk: 500,
    econ: 160,
    perCategory: 120,
    budgetMs: 45_000,
    requestTimeoutMs: 25_000,
  },
  "1y": {
    key: "1y",
    label: "1 year",
    days: 365,
    bulk: 650,
    econ: 200,
    perCategory: 160,
    budgetMs: 45_000,
    requestTimeoutMs: 25_000,
  },
};

export const RANGE_ORDER: RangeKey[] = ["recent", "1m", "6m", "1y"];
export const DEFAULT_RANGE: RangeKey = "recent";

export function isRangeKey(value: string): value is RangeKey {
  return value in RANGES;
}
