import { NextRequest, NextResponse } from 'next/server';
import { DatabaseService } from '../../../../../../../backend/services/databaseService';
import { TransactionEncodingService } from '../../../../../../../backend/services/transactionEncodingService';
import { PolyswapOrderData } from '../../../../../../../backend/interfaces/PolyswapOrder';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = await params;
    
    // Validate order ID format (should be a positive integer)
    const orderId = parseInt(id);
    if (isNaN(orderId) || orderId <= 0) {
      return NextResponse.json({
        success: false,
        error: 'Invalid order ID',
        message: 'Order ID must be a positive integer'
      }, { status: 400 });
    }

    // Get the draft order from database by numerical ID
    const order = await DatabaseService.getPolyswapOrderById(orderId);
    
    if (!order) {
      return NextResponse.json({
        success: false,
        error: 'Order not found',
        message: `No order found with ID: ${orderId}`
      }, { status: 404 });
    }

    // Debug: log the order data
    console.log('Order data from database:', {
      id: order.id,
      sell_token: order.sell_token,
      buy_token: order.buy_token,
      sell_amount: order.sell_amount,
      min_buy_amount: order.min_buy_amount,
      polymarket_order_hash: order.polymarket_order_hash,
      app_data: order.app_data,
      start_time: order.start_time,
      end_time: order.end_time
    });

    // Check if order has a Polymarket order hash
    if (!order.polymarket_order_hash || order.polymarket_order_hash === '0x0000000000000000000000000000000000000000000000000000000000000000') {
      return NextResponse.json({
        success: false,
        error: 'Missing Polymarket order',
        message: 'Polymarket order must be created before getting transaction data'
      }, { status: 400 });
    }

    // Validate required fields and provide defaults
    const sellToken = order.sell_token || '';
    const buyToken = order.buy_token || '';
    const sellAmount = order.sell_amount || '0';
    const minBuyAmount = order.min_buy_amount || '0';
    const polymarketOrderHash = order.polymarket_order_hash;
    const appData = order.app_data || '0x0000000000000000000000000000000000000000000000000000000000000000';

    // Additional validation
    if (!sellToken || !buyToken || !polymarketOrderHash) {
      return NextResponse.json({
        success: false,
        error: 'Invalid order data',
        message: 'Order is missing required fields (sellToken, buyToken, or polymarketOrderHash)'
      }, { status: 400 });
    }

    // Convert database order to PolyswapOrderData format
    const polyswapOrderData: PolyswapOrderData = {
      sellToken: sellToken,
      buyToken: buyToken,
      receiver: order.owner,
      sellAmount: sellAmount,
      minBuyAmount: minBuyAmount,
      t0: Math.floor(order.start_time.getTime() / 1000).toString(), // Convert to timestamp
      t: Math.floor(order.end_time.getTime() / 1000).toString(), // Convert to timestamp
      polymarketOrderHash: polymarketOrderHash,
      appData: appData
    };

    // Generate transaction data for signing
    const transactionData = TransactionEncodingService.createTransaction(polyswapOrderData);

    return NextResponse.json({
      success: true,
      data: {
        transaction: transactionData,
        orderId: order.id,
        polymarketOrderHash: order.polymarket_order_hash,
        message: 'Transaction data generated successfully'
      }
    });

  } catch (error) {
    console.error('Error generating transaction data:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to generate transaction data',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { transactionHash } = body;

    // Validate required fields
    if (!transactionHash) {
      return NextResponse.json({
        success: false,
        error: 'Missing transaction hash',
        message: 'Please provide the transaction hash'
      }, { status: 400 });
    }

    // Validate order ID format (should be a positive integer)
    const orderId = parseInt(id);
    if (isNaN(orderId) || orderId <= 0) {
      return NextResponse.json({
        success: false,
        error: 'Invalid order ID',
        message: 'Order ID must be a positive integer'
      }, { status: 400 });
    }

    // Validate transaction hash format
    if (!/^0x[a-fA-F0-9]{64}$/.test(transactionHash)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid transaction hash',
        message: 'Transaction hash must be a valid 66-character hex string (0x + 64 chars)'
      }, { status: 400 });
    }

    // Get the draft order from database by numerical ID
    const order = await DatabaseService.getPolyswapOrderById(orderId);
    
    if (!order) {
      return NextResponse.json({
        success: false,
        error: 'Order not found',
        message: `No order found with ID: ${orderId}`
      }, { status: 404 });
    }

    // Check if order is in draft status
    if (order.status !== 'draft') {
      return NextResponse.json({
        success: false,
        error: 'Invalid order status',
        message: 'Transaction can only be updated for draft orders'
      }, { status: 400 });
    }

    // Check if order has a Polymarket order hash
    if (!order.polymarket_order_hash || order.polymarket_order_hash === '0x0000000000000000000000000000000000000000000000000000000000000000') {
      return NextResponse.json({
        success: false,
        error: 'Missing Polymarket order',
        message: 'Polymarket order must be created before updating transaction hash'
      }, { status: 400 });
    }

    // Update the order with the transaction hash
    const updated = await DatabaseService.updateOrderTransactionHashById(orderId, transactionHash);
    
    if (!updated) {
      return NextResponse.json({
        success: false,
        error: 'Failed to update order',
        message: 'Failed to update transaction hash for order'
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: {
        orderId,
        transactionHash,
        message: 'Transaction hash updated successfully'
      }
    });

  } catch (error) {
    console.error('Error updating transaction hash:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to update transaction hash',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}