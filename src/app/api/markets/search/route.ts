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

/**
 * Parse a non-negative number from a raw query-param string.
 * Returns the fallback when raw is null, null when the value is invalid.
 */
function parseNonNegativeNumber(raw: string | null, fallback: number): number | null {
  if (raw === null) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

/**
 * Parse a positive integer from a raw query-param string.
 * Returns the fallback when raw is null, null when the value is out-of-range.
 */
function parsePositiveInt(raw: string | null, fallback: number, max: number): number | null {
  if (raw === null) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1 || n > max) return null;
  return n;
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;

  const q = sp.get("q") ?? undefined;
  const category = sp.get("category") ?? undefined;
  const categoriesRaw = sp.get("categories");
  const categories = categoriesRaw
    ? categoriesRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : undefined;

  const volumeMin = parseNonNegativeNumber(sp.get("volumeMin"), 0);
  if (volumeMin === null)
    return NextResponse.json({ success: false, error: "invalid volumeMin" }, { status: 400 });

  const liquidityMin = parseNonNegativeNumber(sp.get("liquidityMin"), 0);
  if (liquidityMin === null)
    return NextResponse.json({ success: false, error: "invalid liquidityMin" }, { status: 400 });

  const limit = parsePositiveInt(sp.get("limit"), 50, 100);
  if (limit === null)
    return NextResponse.json({ success: false, error: "invalid limit" }, { status: 400 });

  const rawOffset = parseNonNegativeNumber(sp.get("offset"), 0);
  if (rawOffset === null)
    return NextResponse.json({ success: false, error: "invalid offset" }, { status: 400 });
  const offset = Math.floor(rawOffset);

  const sortRaw = sp.get("sort") ?? "volume";
  const sort: "volume" | "liquidity" | "end_date" | "interest" =
    sortRaw === "liquidity" || sortRaw === "end_date" || sortRaw === "interest"
      ? sortRaw
      : "volume";

  try {
    const filterOpts = { q, category, categories, volumeMin, liquidityMin };
    const [markets, total] = await Promise.all([
      DatabaseService.searchMarkets({ ...filterOpts, sort, limit, offset }),
      DatabaseService.countMarkets(filterOpts),
    ]);

    return NextResponse.json({
      success: true,
      data: { markets, count: markets.length, total },
    });
  } catch (err) {
    console.error("Market search error:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "search failed" },
      { status: 500 }
    );
  }
}
