import { NextRequest, NextResponse } from 'next/server';
import { TokenPriceService } from '@/backend/services/tokenPriceService';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const { tokenAddress, chainId } = body;

    // Validate required fields
    if (!tokenAddress) {
      return NextResponse.json(
        {
          success: false,
          error: 'missing_token_address',
          message: 'Missing required field: tokenAddress'
        },
        { status: 400 }
      );
    }

    // Default to Polygon if chainId not provided
    const networkChainId = chainId || 137;

    // Validate token address format (basic check)
    if (!/^0x[a-fA-F0-9]{40}$/.test(tokenAddress)) {
      return NextResponse.json(
        {
          success: false,
          error: 'invalid_token_address',
          message: 'Invalid token address format'
        },
        { status: 400 }
      );
    }

    // Get USD price from BFF API
    const price = await TokenPriceService.getTokenUsdPrice(tokenAddress, networkChainId);

    if (price === null) {
      return NextResponse.json(
        {
          success: false,
          error: 'price_unavailable',
          message: 'USD price not available for this token'
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        tokenAddress,
        chainId: networkChainId,
        usdPrice: price
      }
    });

  } catch (error) {
    console.error('Error in token price API:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return NextResponse.json(
      {
        success: false,
        error: 'price_fetch_failed',
        message: `Failed to fetch token price: ${errorMessage}`
      },
      { status: 500 }
    );
  }
}
