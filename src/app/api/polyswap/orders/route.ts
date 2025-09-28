import { NextRequest, NextResponse } from 'next/server';
import { DatabaseService } from '../../../../backend/services/databaseService';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = searchParams.get('limit') || '100';
    const offset = searchParams.get('offset') || '0';
    const fromBlock = searchParams.get('fromBlock');
    const toBlock = searchParams.get('toBlock');
    const sellToken = searchParams.get('sellToken');
    const buyToken = searchParams.get('buyToken');

    const limitNum = Math.min(parseInt(limit) || 100, 500);
    const offsetNum = Math.max(parseInt(offset) || 0, 0);

    let orders;

    if (fromBlock && toBlock) {
      const fromBlockNum = parseInt(fromBlock);
      const toBlockNum = parseInt(toBlock);
      
      if (isNaN(fromBlockNum) || isNaN(toBlockNum) || fromBlockNum > toBlockNum) {
        return NextResponse.json({
          success: false,
          error: 'Invalid block range',
          message: 'Please provide valid fromBlock and toBlock numbers'
        }, { status: 400 });
      }
      
      orders = await DatabaseService.getPolyswapOrdersByBlockRange(fromBlockNum, toBlockNum);
    } else {
      // For now, get all orders. In the future, we can add more filters
      orders = await DatabaseService.getPolyswapOrdersByOwner('', limitNum, offsetNum);
    }

    return NextResponse.json({
      success: true,
      data: orders,
      count: orders.length,
      pagination: {
        limit: limitNum,
        offset: offsetNum,
        hasMore: orders.length === limitNum
      },
      filters: {
        fromBlock: fromBlock ? parseInt(fromBlock) : undefined,
        toBlock: toBlock ? parseInt(toBlock) : undefined,
        sellToken,
        buyToken
      },
      message: 'Orders retrieved successfully'
    });

  } catch (error) {
    console.error('Error fetching orders:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch orders',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 