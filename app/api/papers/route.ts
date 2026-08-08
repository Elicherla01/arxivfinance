import { NextResponse } from "next/server";

import { fetchArchiveSnapshot, fetchCategory, REVALIDATE_SECONDS } from "@/lib/arxiv";
import { CATEGORY_MAP, type CategoryId } from "@/lib/categories";

/**
 * GET /api/papers                    → full snapshot (all q-fin classes)
 * GET /api/papers?category=q-fin.TR  → single subject class
 * GET /api/papers?refresh=1          → bypass the ISR cache
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");
  const refresh = searchParams.get("refresh") === "1";
  const limit = Number(searchParams.get("limit") ?? 12);
  const revalidate = refresh ? 0 : REVALIDATE_SECONDS;

  try {
    if (category) {
      if (!CATEGORY_MAP.has(category)) {
        return NextResponse.json(
          { error: `Unknown category: ${category}` },
          { status: 400 },
        );
      }
      const papers = await fetchCategory(
        category as CategoryId,
        Number.isFinite(limit) ? limit : 12,
        revalidate,
      );
      return NextResponse.json({ category, count: papers.length, papers });
    }

    const snapshot = await fetchArchiveSnapshot(
      Number.isFinite(limit) ? limit : 12,
      revalidate,
    );
    return NextResponse.json(snapshot);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "arXiv fetch failed" },
      { status: 502 },
    );
  }
}
