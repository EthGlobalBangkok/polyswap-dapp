import { NextRequest, NextResponse } from 'next/server';
import { DatabaseService } from '../../../../backend/services/databaseService';
import { transformDatabaseMarkets } from '../../../../backend/utils/transformers';

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