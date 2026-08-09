import { NextResponse } from "next/server";

import { REVALIDATE_SECONDS, searchArchive } from "@/lib/arxiv";
import { DEFAULT_RANGE, isRangeKey } from "@/lib/config";

export const maxDuration = 30;

const MAX_RESULTS = 100;

/**
 * GET /api/search?q=deep+hedging&range=1y
 *
 * Queries arXiv itself, so results cover the entire q-fin archive rather than
 * whatever the browser happens to have loaded.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = (searchParams.get("q") ?? "").trim();
  const rangeParam = searchParams.get("range") ?? DEFAULT_RANGE;

  if (!query) {
    return NextResponse.json({ error: "Missing search query" }, { status: 400 });
  }
  if (!isRangeKey(rangeParam)) {
    return NextResponse.json(
      { error: `Unknown range: ${rangeParam}` },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(
      await searchArchive(query, rangeParam, MAX_RESULTS, REVALIDATE_SECONDS),
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "arXiv search failed" },
      { status: 502 },
    );
  }
}
