import { NextRequest, NextResponse } from 'next/server';
import { DatabaseService } from '../../../../../backend/services/databaseService';
import { getPolymarketOrderService } from '../../../../../backend/services/polymarketOrderService';
import { ethers } from 'ethers';
import composableCowABI from '../../../../../abi/composableCoW.json';

export async function POST(request: NextRequest) {
  try {
    const { orderHash, ownerAddress } = await request.json();

    if (!orderHash || !ownerAddress) {
      return NextResponse.json(
        { success: false, message: 'Missing required fields: orderHash, ownerAddress' },
        { status: 400 }
      );
    }

    const order = await DatabaseService.getPolyswapOrderByHashAndOwner(orderHash, ownerAddress.toLowerCase());
    if (!order) {
      return NextResponse.json(
        { success: false, message: 'Order not found or not owned by this address' },
        { status: 404 }
      );
    }

    if (order.status !== 'live') {
      return NextResponse.json(
        { success: false, message: `Cannot remove order with status: ${order.status}` },
        { status: 400 }
      );
    }

    // Create the remove transaction
    const composableCowAddress = process.env.COMPOSABLE_COW!;

    // Create contract interface to encode function call
    const contractInterface = new ethers.Interface(composableCowABI);

    // Encode the remove function call
    const removeCalldata = contractInterface.encodeFunctionData('remove', [orderHash]);

    const removeTransaction = {
      to: composableCowAddress,
      data: removeCalldata,
      value: '0'
    };

    let polymarketCanceled = false;
    if (order.polymarket_order_hash && order.polymarket_order_hash !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
      try {
        const polymarketOrderService = getPolymarketOrderService();
        await polymarketOrderService.initialize();
        await polymarketOrderService.cancelOrder(order.polymarket_order_hash);
        polymarketCanceled = true;
      } catch (polymarketError) {
        console.error('Failed to cancel Polymarket order:', polymarketError);
      }
    }

    // Return transaction data for frontend execution
    return NextResponse.json({
      success: true,
      data: {
        transaction: removeTransaction,
        polymarketCanceled: polymarketCanceled,
        message: polymarketCanceled
          ? 'Polymarket order canceled. Please sign the CoW Protocol removal transaction.'
          : 'Polymarket cancellation failed or not needed. Please sign the CoW Protocol removal transaction.'
      }
    });

  } catch (error) {
    console.error('❌ Error in remove order endpoint:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

    return NextResponse.json(
      { success: false, message: `Server error: ${errorMessage}` },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { orderHash, transactionHash, confirmed } = await request.json();

    if (!orderHash || !transactionHash || !confirmed) {
      return NextResponse.json(
        { success: false, message: 'Missing required fields: orderHash, transactionHash, confirmed' },
        { status: 400 }
      );
    }

    const order = await DatabaseService.getPolyswapOrderByHash(orderHash);
    if (!order) {
      return NextResponse.json(
        { success: false, message: 'Order not found' },
        { status: 404 }
      );
    }

    // Update the order status to canceled
    const result = await DatabaseService.updateOrderStatus(
      orderHash,
      'canceled'
    );

    if (result) {
      return NextResponse.json({
        success: true,
        message: 'Order cancellation confirmed and database updated',
        data: {
          orderHash,
          transactionHash,
          status: 'canceled'
        }
      });
    } else {
      console.error('❌ Failed to update order status in database');
      return NextResponse.json(
        { success: false, message: 'Failed to update order status in database' },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('❌ Error in PUT remove order endpoint:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

    return NextResponse.json(
      { success: false, message: `Server error: ${errorMessage}` },
      { status: 500 }
    );
  }
}