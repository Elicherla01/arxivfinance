import { NextResponse } from "next/server";

import { fetchArchiveSnapshot, fetchCategory, REVALIDATE_SECONDS } from "@/lib/arxiv";
import { CATEGORY_MAP, type CategoryId } from "@/lib/categories";
import { DEFAULT_RANGE, isRangeKey, RANGES } from "@/lib/config";

/** Wide windows make several upstream calls; the default 10s is not enough. */
export const maxDuration = 60;

/**
 * Last line of defence under maxDuration. The fetch layer has its own budget,
 * but arXiv has stalled past it before, and a function killed by the platform
 * returns nothing at all — an explicit error the client can retry is better.
 */
const HARD_LIMIT_MS = 50_000;

function withHardLimit<T>(work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    work,
    new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error("arXiv did not respond in time")),
        HARD_LIMIT_MS,
      );
    }),
  ]).finally(() => clearTimeout(timer)) as Promise<T>;
}

/**
 * GET /api/papers                    → full snapshot (all q-fin classes)
 * GET /api/papers?range=1y           → widen the submission window
 * GET /api/papers?category=q-fin.TR  → single subject class
 * GET /api/papers?refresh=1          → bypass the cache
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");
  const rangeParam = searchParams.get("range") ?? DEFAULT_RANGE;
  const refresh = searchParams.get("refresh") === "1";
  const revalidate = refresh ? 0 : REVALIDATE_SECONDS;

  if (!isRangeKey(rangeParam)) {
    return NextResponse.json(
      { error: `Unknown range: ${rangeParam}` },
      { status: 400 },
    );
  }
  const range = RANGES[rangeParam];

  try {
    if (category) {
      if (!CATEGORY_MAP.has(category)) {
        return NextResponse.json(
          { error: `Unknown category: ${category}` },
          { status: 400 },
        );
      }

      const limit = Number(searchParams.get("limit"));
      const { papers, total } = await withHardLimit(
        fetchCategory(
          category as CategoryId,
          Number.isFinite(limit) && limit > 0
            ? { ...range, perCategory: limit }
            : range,
          revalidate,
        ),
      );
      return NextResponse.json({
        category,
        range: rangeParam,
        count: papers.length,
        totalAvailable: total,
        papers,
      });
    }

    return NextResponse.json(
      await withHardLimit(fetchArchiveSnapshot(rangeParam, revalidate)),
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "arXiv fetch failed" },
      { status: 502 },
    );
  }
}
