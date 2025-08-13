import { NextRequest, NextResponse } from 'next/server';
import { DatabaseService } from '../../../../backend/services/databaseService';
import { PolymarketAPIService } from '../../../../backend/services/polymarketAPIService';
import { transformDatabaseMarket } from '../../../../backend/utils/transformers';

export async function GET(
  request: NextRequest,
  { params }: { params: { identifier: string } }
) {
  try {
    const { identifier } = await params;
    
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
      
      // If not found in database, fetch from Polymarket API
      if (!market) {
        const polymarketMarket = await PolymarketAPIService.getMarketByConditionId(identifier);
        if (polymarketMarket) {
          // Save to database
          await DatabaseService.insertMarket(polymarketMarket);
          // Get the saved market from database to ensure consistent format
          market = await DatabaseService.getMarketByConditionId(identifier);
        }
      }
    } else {
      // First try to get from database by ID
      market = await DatabaseService.getMarketById(identifier);
      
      // If not found in database, fetch from Polymarket API
      if (!market) {
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
        message: `No market found with identifier: ${identifier}`
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