import { NextRequest, NextResponse } from 'next/server';
import { DatabaseService } from '../../../../../backend/services/databaseService';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ owner: string }> }
) {
  try {
    const { owner } = await params;
    const { searchParams } = new URL(request.url);
    const limit = searchParams.get('limit') || '100';
    const offset = searchParams.get('offset') || '0';

    // Validate Ethereum address format
    if (!owner || !/^0x[a-fA-F0-9]{40}$/.test(owner)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid owner address',
        message: 'Please provide a valid Ethereum address (0x followed by 40 hex characters)'
      }, { status: 400 });
    }

    const limitNum = Math.min(parseInt(limit) || 100, 500);
    const offsetNum = Math.max(parseInt(offset) || 0, 0);

    const orders = await DatabaseService.getPolyswapOrdersByOwner(owner, limitNum, offsetNum);

    return NextResponse.json({
      success: true,
      data: orders,
      count: orders.length,
      pagination: {
        limit: limitNum,
        offset: offsetNum,
        hasMore: orders.length === limitNum
      },
      message: 'Orders retrieved successfully from blockchain events'
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