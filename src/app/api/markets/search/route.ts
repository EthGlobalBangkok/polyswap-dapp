import { NextRequest, NextResponse } from "next/server";
import { DatabaseService } from "../../../../backend/services/databaseService";
import { transformDatabaseMarkets } from "../../../../backend/utils/transformers";
import { DatabaseMarket } from "@/backend/interfaces/Database";

/**
 * @swagger
 * /api/markets/search:
 *   get:
 *     tags:
 *       - Markets
 *     summary: Search markets
 *     description: Search markets by question text with multi-word support
 *     parameters:
 *       - name: q
 *         in: query
 *         schema:
 *           type: string
 *         description: Search query (space-separated keywords)
 *       - name: type
 *         in: query
 *         schema:
 *           type: string
 *           enum: [all, any, slug]
 *           default: all
 *         description: Search type (all=AND, any=OR, slug=exact slug match)
 *       - name: category
 *         in: query
 *         schema:
 *           type: string
 *         description: Filter by category
 *       - name: limit
 *         in: query
 *         schema:
 *           type: integer
 *           default: 100
 *         description: Number of results to return (max 500)
 *       - name: offset
 *         in: query
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Offset for pagination
 *     responses:
 *       200:
 *         description: Search results
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
 *                 searchType:
 *                   type: string
 *                 keywords:
 *                   type: array
 *                   items:
 *                     type: string
 *       400:
 *         description: Missing search parameters
 *       404:
 *         description: No markets found
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q");
    const type = searchParams.get("type") || "all"; // Default to 'all' for better multi-word search
    const category = searchParams.get("category");
    const limit = searchParams.get("limit") || "100";
    const offset = searchParams.get("offset") || "0";

    // Allow category-only search (no query required)
    if (!q && !category) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing search parameters",
          message: "Please provide either a search query (q) or a category",
        },
        { status: 400 }
      );
    }

    // Parse search query into keywords (split by spaces for multi-word search)
    const keywords = q
      ? q
          .split(/\s+/)
          .map((keyword: string) => keyword.trim())
          .filter(Boolean)
      : [];
    const maxResults = Math.min(parseInt(limit) || 100, 500); // Cap at 500
    const offsetNum = Math.max(parseInt(offset) || 0, 0);

    let markets: DatabaseMarket[] = [];

    if (category) {
      if (keywords.length === 0) {
        // Category-only search
        markets = await DatabaseService.getMarketsByCategory(category, maxResults, offsetNum);
      } else {
        // Search by keywords AND category
        if (type === "all") {
          markets = await DatabaseService.searchMarketsByKeywordsAndCategory(
            keywords,
            category,
            maxResults,
            offsetNum
          );
        } else {
          markets = await DatabaseService.searchMarketsByAnyKeywordAndCategory(
            keywords,
            category,
            maxResults,
            offsetNum
          );
        }
      }
    } else {
      // Search by keywords only
      if (keywords.length === 0) {
        return NextResponse.json(
          {
            success: false,
            error: "No valid keywords provided",
            message: "Please provide at least one keyword",
          },
          { status: 400 }
        );
      }
      if (type === "slug") {
        const market = await DatabaseService.getMarketBySlug(keywords[0]);
        if (market) {
          markets.push(market);
        }
      } else if (type === "all") {
        markets = await DatabaseService.searchMarketsByKeywords(keywords, maxResults, offsetNum);
      } else {
        markets = await DatabaseService.searchMarketsByAnyKeyword(keywords, maxResults, offsetNum);
      }
    }
    if (!markets) {
      return NextResponse.json(
        {
          success: false,
          error: "No markets found",
          message: "No markets found",
        },
        { status: 404 }
      );
    }
    return NextResponse.json({
      success: true,
      data: transformDatabaseMarkets(markets),
      count: markets.length,
      searchType: type,
      keywords: keywords,
      category: category || null,
      pagination: {
        limit: maxResults,
        offset: offsetNum,
        hasMore: markets.length === maxResults,
      },
      message: `Found ${markets.length} markets`,
    });
  } catch (error) {
    console.error("Error searching markets:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to search markets",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
