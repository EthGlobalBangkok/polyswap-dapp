import { NextRequest, NextResponse } from 'next/server';
import { DatabaseService } from '../../../../../../../backend/services/databaseService';
import { TransactionEncodingService } from '../../../../../../../backend/services/transactionEncodingService';
import { TransactionEventService } from '../../../../../../../backend/services/transactionEventService';
import { PolyswapOrderData } from '../../../../../../../backend/interfaces/PolyswapOrder';

/**
 * @swagger
 * /api/polyswap/orders/id/{id}/transaction:
 *   get:
 *     tags:
 *       - Orders
 *     summary: Get transaction data for order
 *     description: Generates transaction data for signing a Polyswap order
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: integer
 *         description: Order numerical ID
 *     responses:
 *       200:
 *         description: Transaction data for signing
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     transaction:
 *                       type: object
 *                       properties:
 *                         to:
 *                           type: string
 *                         data:
 *                           type: string
 *                         value:
 *                           type: string
 *                     orderId:
 *                       type: integer
 *                     polymarketOrderHash:
 *                       type: string
 *       400:
 *         description: Invalid order ID or missing Polymarket order
 *       404:
 *         description: Order not found
 *   put:
 *     tags:
 *       - Orders
 *     summary: Update order transaction details
 *     description: Updates order with transaction hash after signing
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: integer
 *         description: Order numerical ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - transactionHash
 *             properties:
 *               transactionHash:
 *                 type: string
 *                 description: Transaction hash (0x + 64 hex chars)
 *     responses:
 *       200:
 *         description: Transaction details updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     orderId:
 *                       type: integer
 *                     transactionHash:
 *                       type: string
 *                     blockNumber:
 *                       type: integer
 *                     orderHash:
 *                       type: string
 *                     orderUid:
 *                       type: string
 *       400:
 *         description: Invalid request
 *       404:
 *         description: Order not found
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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
  { params }: { params: Promise<{ id: string }> }
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

    // Fetch transaction event details from the blockchain
    let eventDetails;
    try {
      console.log(`🔍 Fetching transaction event details for hash: ${transactionHash}`);
      eventDetails = await TransactionEventService.getTransactionEventDetails(transactionHash);

      if (!eventDetails) {
        return NextResponse.json({
          success: false,
          error: 'Transaction event not found',
          message: 'Could not find ConditionalOrderCreated event in the transaction. Please ensure the transaction was successful and contains the expected event.'
        }, { status: 400 });
      }

      console.log(`✅ Retrieved event details:`, {
        blockNumber: eventDetails.blockNumber,
        logIndex: eventDetails.logIndex,
        handler: eventDetails.handler,
        orderHash: eventDetails.orderHash
      });

    } catch (eventError) {
      console.error('❌ Error fetching transaction event details:', eventError);
      return NextResponse.json({
        success: false,
        error: 'Failed to fetch transaction details',
        message: `Could not retrieve transaction event details: ${eventError instanceof Error ? eventError.message : 'Unknown error'}`
      }, { status: 500 });
    }

    // Calculate order UID using the confirmed event data
    let orderUid: string | undefined;
    try {
      const { OrderUidCalculationService } = await import('../../../../../../../backend/services/orderUidCalculationService');
      const { ethers } = await import('ethers');

      // Initialize provider
      const RPC_URL = process.env.RPC_URL;
      if (!RPC_URL) {
        throw new Error('RPC_URL environment variable not set');
      }
      const provider = new ethers.JsonRpcProvider(RPC_URL);
      OrderUidCalculationService.initialize(provider);

      // Create PolyswapOrderData from the order
      const polyswapOrderData = {
        sellToken: order.sell_token,
        buyToken: order.buy_token,
        receiver: order.owner,
        sellAmount: order.sell_amount.toString(),
        minBuyAmount: order.min_buy_amount.toString(),
        t0: Math.floor(order.start_time.getTime() / 1000).toString(),
        t: Math.floor(order.end_time.getTime() / 1000).toString(),
        polymarketOrderHash: order.polymarket_order_hash!,
        appData: eventDetails.appData, // Use appData from the event
      };

      // Calculate order UID
      orderUid = await OrderUidCalculationService.calculateCompleteOrderUidOnChain(
        polyswapOrderData,
        order.owner
      );

      console.log(`✅ Calculated order UID for order ${orderId}: ${orderUid}`);
    } catch (uidError) {
      console.error(`⚠️ Could not calculate order UID for order ${orderId}:`, uidError);
      // Continue without order UID - it can be calculated later if needed
    }

    // Update the order with complete transaction details including order UID
    const updated = await DatabaseService.updateOrderTransactionDetails(
      orderId,
      transactionHash,
      eventDetails.blockNumber,
      eventDetails.logIndex,
      eventDetails.handler,
      eventDetails.appData,
      eventDetails.orderHash,
      orderUid
    );

    if (!updated) {
      return NextResponse.json({
        success: false,
        error: 'Failed to update order',
        message: 'Failed to update transaction details for order'
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: {
        orderId,
        transactionHash,
        blockNumber: eventDetails.blockNumber,
        logIndex: eventDetails.logIndex,
        handler: eventDetails.handler,
        appData: eventDetails.appData,
        orderHash: eventDetails.orderHash,
        orderUid: orderUid,
        message: 'Transaction details updated successfully'
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