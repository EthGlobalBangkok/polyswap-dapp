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

    console.log('🗑️ Remove order request:', {
      orderHash,
      ownerAddress
    });

    // Validate that the order exists and is owned by the user
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

    console.log('🔧 Generated remove transaction:', {
      to: removeTransaction.to,
      data: removeTransaction.data,
      orderHash
    });

    // Step 1: Cancel the Polymarket order if it exists
    let polymarketCanceled = false;
    if (order.polymarket_order_hash && order.polymarket_order_hash !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
      try {
        console.log('🚫 Canceling Polymarket order:', order.polymarket_order_hash);

        const polymarketOrderService = getPolymarketOrderService();
        await polymarketOrderService.initialize();

        const cancelResult = await polymarketOrderService.cancelOrder(order.polymarket_order_hash);
        console.log('✅ Polymarket order canceled successfully:', cancelResult);
        polymarketCanceled = true;
      } catch (polymarketError) {
        console.error('❌ Failed to cancel Polymarket order:', polymarketError);
        // Don't fail the entire request - continue with CoW Protocol cancellation
        // but log the error for debugging
      }
    } else {
      console.log('ℹ️ No Polymarket order to cancel (order hash is null or empty)');
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

    console.log('🔄 Update order cancellation request:', {
      orderHash,
      transactionHash,
      confirmed
    });

    // Validate that the order exists
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
      console.log('✅ Order status updated to canceled successfully:', {
        orderHash,
        transactionHash
      });

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