import { NextResponse } from 'next/server';
import { DatabaseService } from '../../../../backend/services/databaseService';
import { transformDatabaseMarkets } from '../../../../backend/utils/transformers';

/**
 * @swagger
 * /api/markets/top:
 *   get:
 *     tags:
 *       - Markets
 *     summary: Get top markets by volume
 *     description: Returns the top 50 markets sorted by trading volume
 *     responses:
 *       200:
 *         description: Top markets by volume
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
 *       500:
 *         description: Server error
 */
export async function GET() {
  try {
    const markets = await DatabaseService.getMarketsByVolume(0, 50);
    
    return NextResponse.json({
      success: true,
      data: transformDatabaseMarkets(markets),
      count: markets.length,
      message: 'Top markets retrieved successfully'
    });
  } catch (error) {
    console.error('Error fetching top markets:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch top markets',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 