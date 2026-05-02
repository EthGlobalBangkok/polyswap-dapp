import { type NextRequest, NextResponse } from "next/server";
import { DatabaseService } from "@/backend/services/databaseService";

/**
 * GET /api/markets/search
 *
 * Unified market search endpoint. Replaces the old /markets, /markets/top,
 * /markets/search, /markets/[identifier] and /markets/category/[cat] routes.
 *
 * Query parameters:
 *   q            – Full-text search query (Postgres tsvector / plainto_tsquery)
 *   category     – Exact category filter
 *   volumeMin    – Minimum volume (default 0)
 *   liquidityMin – Minimum liquidity (default 0)
 *   sort         – "volume" | "liquidity" | "end_date" (default "volume")
 *   limit        – Max results, capped at 100 (default 50)
 *   offset       – Pagination offset (default 0)
 *
 * Response: { success: true, data: { markets: DatabaseMarket[], count: number } }
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;

  const q = sp.get("q") ?? undefined;
  const category = sp.get("category") ?? undefined;
  const volumeMin = sp.get("volumeMin") ? Number(sp.get("volumeMin")) : 0;
  const liquidityMin = sp.get("liquidityMin") ? Number(sp.get("liquidityMin")) : 0;

  const sortRaw = sp.get("sort") ?? "volume";
  const sort: "volume" | "liquidity" | "end_date" =
    sortRaw === "liquidity" || sortRaw === "end_date" ? sortRaw : "volume";

  const limit = Math.min(Number(sp.get("limit") ?? 50), 100);
  const offset = Math.max(Number(sp.get("offset") ?? 0), 0);

  try {
    const markets = await DatabaseService.searchMarkets({
      q,
      category,
      volumeMin,
      liquidityMin,
      sort,
      limit,
      offset,
    });

    return NextResponse.json({
      success: true,
      data: { markets, count: markets.length },
    });
  } catch (err) {
    console.error("Market search error:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "search failed" },
      { status: 500 }
    );
  }
}
