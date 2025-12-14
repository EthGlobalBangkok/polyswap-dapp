import { NextRequest, NextResponse } from 'next/server';
import { DatabaseService } from '../../../../backend/services/databaseService';
import { PolymarketAPIService } from '../../../../backend/services/polymarketAPIService';
import { transformDatabaseMarket } from '../../../../backend/utils/transformers';

/**
 * @swagger
 * /api/markets/{identifier}:
 *   get:
 *     tags:
 *       - Markets
 *     summary: Get market by identifier
 *     description: Get a specific market by condition ID or market ID
 *     parameters:
 *       - name: identifier
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: Market condition ID (0x...) or market ID
 *     responses:
 *       200:
 *         description: Market details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Market'
 *       400:
 *         description: Missing identifier
 *       404:
 *         description: Market not found
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ identifier: string }> }
) {
  try {
    const { identifier } = await params;
    const UPDATE_INTERVAL = (process.env.MARKET_UPDATE_INTERVAL_MINUTES ?
      parseInt(process.env.MARKET_UPDATE_INTERVAL_MINUTES) : 5) * 60 * 1000;
    
          if (!identifier) {
        return NextResponse.json({
          success: false,
          error: 'Missing identifier',
          message: 'Please provide a market ID or condition ID'
        }, { status: 400 });
      }
    
    let market;
    
    // Try to find by condition ID first (longer hex string starting with 0x)
    if (identifier.startsWith('0x') && identifier.length == 66) {
      // First try to get from database
      market = await DatabaseService.getMarketByConditionId(identifier);
      
      // If not found in database or is older than update interval time, fetch from Polymarket API
      if (!market || !market.updated_at || market.updated_at?.getTime() < Date.now() - UPDATE_INTERVAL) {
        const polymarketMarket = await PolymarketAPIService.getMarketByConditionId(identifier);
        if (polymarketMarket) {
          // Save to database
          await DatabaseService.insertMarket(polymarketMarket);
          // Get the saved market from database to ensure consistent format
          market = await DatabaseService.getMarketByConditionId(identifier);
        }
      }
    } else {
      // Try to get from database by ID
      market = await DatabaseService.getMarketById(identifier);
      
      // If not found in database, fetch from Polymarket API
      if (!market || !market.updated_at || market.updated_at?.getTime() < Date.now() - UPDATE_INTERVAL) {
        const polymarketMarket = await PolymarketAPIService.getMarketById(identifier);
        if (polymarketMarket) {
          // Save to database
          await DatabaseService.insertMarket(polymarketMarket);
          // Get the saved market from database to ensure consistent format
          market = await DatabaseService.getMarketById(identifier);
        }
      }
    }
    
    if (!market) {
      return NextResponse.json({
        success: false,
        error: 'Market not found',
        message: `No market found with ID or condition ID: ${identifier}`
      }, { status: 404 });
    }
    
    return NextResponse.json({
      success: true,
      data: transformDatabaseMarket(market),
      message: 'Market retrieved successfully'
    });
  } catch (error) {
    console.error('Error fetching market:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch market',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 