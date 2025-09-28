import { NextRequest, NextResponse } from 'next/server';
import { DatabaseService } from '../../../../../../../backend/services/databaseService';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orderHash: string }> }
) {
  try {
    const { orderHash } = await params;

    // Validate order hash format
    if (!orderHash || !/^0x[a-fA-F0-9]{64}$/.test(orderHash)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid order hash',
        message: 'Order hash must be a valid 66-character hex string (0x + 64 chars)'
      }, { status: 400 });
    }

    // Get the draft order from database
    const order = await DatabaseService.getPolyswapOrderByHash(orderHash);
    
    if (!order) {
      return NextResponse.json({
        success: false,
        error: 'Order not found',
        message: `No order found with hash: ${orderHash}`
      }, { status: 404 });
    }

    // Check if order has a Polymarket order hash
    if (!order.polymarket_order_hash || order.polymarket_order_hash === '0x0000000000000000000000000000000000000000000000000000000000000000') {
      return NextResponse.json({
        success: false,
        error: 'Missing Polymarket order',
        message: 'Polymarket order must be created before getting transaction data'
      }, { status: 400 });
    }

    // TODO: Generate actual transaction data for signing
    // This would involve encoding the createWithContext call data for ComposableCoW
    const transactionData = {
      to: process.env.COMPOSABLE_COW,
      data: "0x", // TODO: Encode the actual createWithContext call data
      value: "0",
      chainId: parseInt(process.env.CHAIN_ID || "137")
    };

    return NextResponse.json({
      success: true,
      data: {
        transaction: transactionData,
        orderHash: order.order_hash,
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
  { params }: { params: Promise<{ orderHash: string }> }
) {
  try {
    const { orderHash } = await params;
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

    // Validate order hash format
    if (!orderHash || !/^0x[a-fA-F0-9]{64}$/.test(orderHash)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid order hash',
        message: 'Order hash must be a valid 66-character hex string (0x + 64 chars)'
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

    // Get the draft order from database
    const order = await DatabaseService.getPolyswapOrderByHash(orderHash);
    
    if (!order) {
      return NextResponse.json({
        success: false,
        error: 'Order not found',
        message: `No order found with hash: ${orderHash}`
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
    const updated = await DatabaseService.updateOrderTransactionHash(orderHash, transactionHash);
    
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
        orderHash,
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