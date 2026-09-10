import { type NextRequest, NextResponse } from "next/server";
import { DatabaseService } from "@/backend/services/databaseService";
import { createApiErrorResponder } from "@/lib/apiError";

const apiError = createApiErrorResponder("api-market-counts");

/**
 * @swagger
 * /api/markets/counts:
 *   get:
 *     tags: [Markets]
 *     summary: Per-category market counts
 *     description: Returns a map of category → market count plus the overall total.
 *     parameters:
 *       - { name: categories, in: query, required: true, schema: { type: string }, description: "Comma-separated list (max 50)" }
 *     responses:
 *       200: { description: Counts payload }
 *       400: { description: Missing or oversized categories list }
 *       500: { description: Server error }
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const raw = sp.get("categories");
  const categories = raw
    ? raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  if (categories.length === 0) {
    return apiError({
      status: 400,
      error: "Invalid categories",
      message: "categories query param is required (comma-separated)",
    });
  }
  if (categories.length > 50) {
    return apiError({
      status: 400,
      error: "Invalid categories",
      message: "too many categories (max 50)",
    });
  }

  try {
    const [byCategory, total] = await Promise.all([
      DatabaseService.getMarketCountsByCategory(categories),
      DatabaseService.countMarkets({ categories }),
    ]);
    return NextResponse.json({ success: true, data: { byCategory, total } });
  } catch (err) {
    return apiError({ status: 500, error: "Market counts failed", cause: err });
  }
}
