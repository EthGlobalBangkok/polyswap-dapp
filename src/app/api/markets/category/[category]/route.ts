import { NextRequest, NextResponse } from "next/server";
import { DatabaseService } from "../../../../../backend/services/databaseService";
import { transformDatabaseMarkets } from "../../../../../backend/utils/transformers";

/**
 * @swagger
 * /api/markets/category/{category}:
 *   get:
 *     tags:
 *       - Markets
 *     summary: Get markets by category
 *     description: Returns markets filtered by category
 *     parameters:
 *       - name: category
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: Market category (e.g., "Sports", "Politics", "Crypto")
 *       - name: limit
 *         in: query
 *         schema:
 *           type: integer
 *           default: 100
 *         description: Number of markets to return (max 500)
 *       - name: offset
 *         in: query
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Offset for pagination
 *     responses:
 *       200:
 *         description: Markets in the specified category
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Market'
 *                 count:
 *                   type: integer
 *                 category:
 *                   type: string
 *                 pagination:
 *                   type: object
 *       400:
 *         description: Missing category parameter
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ category: string }> }
) {
  try {
    const { category } = await params;
    const { searchParams } = new URL(request.url);
    const limit = searchParams.get("limit") || "100";
    const offset = searchParams.get("offset") || "0";

    if (!category) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing category parameter",
          message: "Please provide a category",
        },
        { status: 400 }
      );
    }

    const limitNum = Math.min(parseInt(limit) || 100, 500);
    const offsetNum = Math.max(parseInt(offset) || 0, 0);

    const markets = await DatabaseService.getMarketsByCategory(category, limitNum, offsetNum);

    return NextResponse.json({
      success: true,
      data: transformDatabaseMarkets(markets),
      count: markets.length,
      category: category,
      pagination: {
        limit: limitNum,
        offset: offsetNum,
        hasMore: markets.length === limitNum,
      },
      message: `Found ${markets.length} markets in ${category} category`,
    });
  } catch (error) {
    console.error("Error fetching markets by category:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch markets by category",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
