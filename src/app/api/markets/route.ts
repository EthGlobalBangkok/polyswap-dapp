import { NextRequest, NextResponse } from "next/server";
import { DatabaseService } from "../../../backend/services/databaseService";
import { transformDatabaseMarkets } from "../../../backend/utils/transformers";

/**
 * @swagger
 * /api/markets:
 *   get:
 *     tags:
 *       - Markets
 *     summary: Get all markets
 *     description: Returns a paginated list of prediction markets
 *     parameters:
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
 *       - name: minVolume
 *         in: query
 *         schema:
 *           type: number
 *         description: Filter by minimum trading volume
 *       - name: endAfter
 *         in: query
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter markets ending after this date
 *     responses:
 *       200:
 *         description: List of markets
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
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     limit:
 *                       type: integer
 *                     offset:
 *                       type: integer
 *                     hasMore:
 *                       type: boolean
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = searchParams.get("limit") || "100";
    const offset = searchParams.get("offset") || "0";
    const minVolume = searchParams.get("minVolume");
    const endAfter = searchParams.get("endAfter");

    const limitNum = Math.min(parseInt(limit) || 100, 500);
    const offsetNum = Math.max(parseInt(offset) || 0, 0);

    let markets;

    if (minVolume) {
      const minVol = parseFloat(minVolume);
      markets = await DatabaseService.getMarketsByVolume(minVol, limitNum, offsetNum);
    } else if (endAfter) {
      const endDate = new Date(endAfter);
      if (isNaN(endDate.getTime())) {
        return NextResponse.json(
          {
            success: false,
            error: "Invalid date format",
            message: "Please provide a valid ISO date string for endAfter parameter",
          },
          { status: 400 }
        );
      }
      markets = await DatabaseService.getMarketsEndingAfter(endDate, limitNum, offsetNum);
    } else {
      markets = await DatabaseService.getAllMarkets(limitNum, offsetNum);
    }

    return NextResponse.json({
      success: true,
      data: transformDatabaseMarkets(markets),
      count: markets.length,
      pagination: {
        limit: limitNum,
        offset: offsetNum,
        hasMore: markets.length === limitNum,
      },
      message: "Markets retrieved successfully",
    });
  } catch (error) {
    console.error("Error fetching markets:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch markets",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
