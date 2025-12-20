import { NextRequest, NextResponse } from "next/server";
import { DatabaseService } from "../../../../backend/services/databaseService";

/**
 * @swagger
 * /api/polyswap/orders:
 *   get:
 *     tags:
 *       - Orders
 *     summary: Get all orders
 *     description: Returns all Polyswap orders with optional filters
 *     parameters:
 *       - name: limit
 *         in: query
 *         schema:
 *           type: integer
 *           default: 100
 *         description: Number of orders to return (max 500)
 *       - name: offset
 *         in: query
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Offset for pagination
 *       - name: fromBlock
 *         in: query
 *         schema:
 *           type: integer
 *         description: Filter orders from this block number
 *       - name: toBlock
 *         in: query
 *         schema:
 *           type: integer
 *         description: Filter orders up to this block number
 *       - name: sellToken
 *         in: query
 *         schema:
 *           type: string
 *         description: Filter by sell token address
 *       - name: buyToken
 *         in: query
 *         schema:
 *           type: string
 *         description: Filter by buy token address
 *     responses:
 *       200:
 *         description: List of orders
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
 *                     $ref: '#/components/schemas/Order'
 *                 count:
 *                   type: integer
 *       400:
 *         description: Invalid block range
 *       500:
 *         description: Server error
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = searchParams.get("limit") || "100";
    const offset = searchParams.get("offset") || "0";
    const fromBlock = searchParams.get("fromBlock");
    const toBlock = searchParams.get("toBlock");
    const sellToken = searchParams.get("sellToken");
    const buyToken = searchParams.get("buyToken");

    const limitNum = Math.min(parseInt(limit) || 100, 500);
    const offsetNum = Math.max(parseInt(offset) || 0, 0);

    let orders;

    if (fromBlock && toBlock) {
      const fromBlockNum = parseInt(fromBlock);
      const toBlockNum = parseInt(toBlock);

      if (isNaN(fromBlockNum) || isNaN(toBlockNum) || fromBlockNum > toBlockNum) {
        return NextResponse.json(
          {
            success: false,
            error: "Invalid block range",
            message: "Please provide valid fromBlock and toBlock numbers",
          },
          { status: 400 }
        );
      }

      orders = await DatabaseService.getPolyswapOrdersByBlockRange(fromBlockNum, toBlockNum);
    } else {
      // For now, get all orders. In the future, we can add more filters
      orders = await DatabaseService.getPolyswapOrdersByOwner("", limitNum, offsetNum);
    }

    return NextResponse.json({
      success: true,
      data: orders,
      count: orders.length,
      pagination: {
        limit: limitNum,
        offset: offsetNum,
        hasMore: orders.length === limitNum,
      },
      filters: {
        fromBlock: fromBlock ? parseInt(fromBlock) : undefined,
        toBlock: toBlock ? parseInt(toBlock) : undefined,
        sellToken,
        buyToken,
      },
      message: "Orders retrieved successfully",
    });
  } catch (error) {
    console.error("Error fetching orders:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch orders",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
