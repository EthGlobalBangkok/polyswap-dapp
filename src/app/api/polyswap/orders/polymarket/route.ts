import { NextRequest, NextResponse } from 'next/server';
import { DatabaseService } from '../../../../../backend/services/databaseService';
import { getPolymarketOrderService } from '../../../../../backend/services/polymarketOrderService';

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { orderId } = body; // Changed from orderHash to orderId

    // Validate required fields
    if (!orderId) {
      return NextResponse.json({
        success: false,
        error: 'Missing order ID',
        message: 'Please provide the order ID'
      }, { status: 400 });
    }

    // Validate order ID format (should be a positive integer)
    const orderIdNum = parseInt(orderId);
    if (isNaN(orderIdNum) || orderIdNum <= 0) {
      return NextResponse.json({
        success: false,
        error: 'Invalid order ID',
        message: 'Order ID must be a positive integer'
      }, { status: 400 });
    }

    // Get the draft order from database by numerical ID
    const order = await DatabaseService.getPolyswapOrderById(orderIdNum);
    
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
        message: 'Polymarket order can only be created for draft orders'
      }, { status: 400 });
    }

    // Check if order has a market_id
    if (!order.market_id) {
      return NextResponse.json({
        success: false,
        error: 'Missing market ID',
        message: 'Order must be associated with a market to create Polymarket order'
      }, { status: 400 });
    }

    // Check if order has outcome_selected and bet_percentage
    if (order.outcome_selected === null || order.bet_percentage === null) {
      return NextResponse.json({
        success: false,
        error: 'Missing order data',
        message: 'Order must have outcome selected and bet percentage to create Polymarket order'
      }, { status: 400 });
    }

    // Get the market data from database
    const market = await DatabaseService.getMarketById(order.market_id);
    
    if (!market) {
      return NextResponse.json({
        success: false,
        error: 'Market not found',
        message: `No market found with ID: ${order.market_id}`
      }, { status: 404 });
    }

    // Parse CLOB token IDs from market data
    let clobTokenIds: string[] = [];
    try {
      clobTokenIds = Array.isArray(market.clob_token_ids) 
        ? market.clob_token_ids 
        : JSON.parse(market.clob_token_ids as unknown as string);
    } catch (parseError) {
      console.error('Failed to parse CLOB token IDs:', parseError);
      return NextResponse.json({
        success: false,
        error: 'Invalid market data',
        message: 'Failed to parse CLOB token IDs from market data'
      }, { status: 500 });
    }

    // Validate we have CLOB token IDs
    if (!clobTokenIds || clobTokenIds.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Missing CLOB token IDs',
        message: 'Market does not have any CLOB token IDs'
      }, { status: 400 });
    }

    // Validate outcome selected (is the value of an outcome like yes/no so search in array the outcome and save the array index)
    // Parse outcomes from market data
    let outcomes: string[] = [];
    try {
      outcomes = Array.isArray(market.outcomes) 
        ? market.outcomes 
        : JSON.parse(market.outcomes as unknown as string);
    } catch (parseError) {
      console.error('Failed to parse outcomes:', parseError);
      return NextResponse.json({
        success: false,
        error: 'Invalid market data',
        message: 'Failed to parse outcomes from market data'
      }, { status: 500 });
    }

    // Validate we have outcomes
    if (!outcomes || outcomes.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Missing outcomes',
        message: 'Market does not have any outcomes'
      }, { status: 400 });
    }

    // Find the index of the selected outcome in the outcomes array
    const outcomeIndex = outcomes.indexOf(order.outcome_selected);
    if (outcomeIndex === -1) {
      return NextResponse.json({
        success: false,
        error: 'Invalid outcome selected',
        message: `Outcome '${order.outcome_selected}' is not valid for this market. Valid outcomes are: ${outcomes.join(', ')}`
      }, { status: 400 });
    }

    // Validate that we have a CLOB token ID for the selected outcome
    if (outcomeIndex >= clobTokenIds.length) {
      return NextResponse.json({
        success: false,
        error: 'Missing CLOB token ID',
        message: `No CLOB token ID found for outcome '${order.outcome_selected}'`
      }, { status: 500 });
    }

    // Get the token ID for the selected outcome
    const tokenId = clobTokenIds[outcomeIndex];

    // Calculate the price based on bet percentage (convert from percentage to decimal)
    const price = order.bet_percentage / 100;

    // Get singleton instance of Polymarket service
    const polymarketOrderService = getPolymarketOrderService();
    
    // Initialize Polymarket service
    try {
      console.log('Initializing Polymarket service...');
      await polymarketOrderService.initialize();
      
    } catch (initError) {
      console.error('Failed to initialize Polymarket service:', initError);
      return NextResponse.json({
        success: false,
        error: 'Service initialization failed',
        message: `Failed to initialize Polymarket service: ${initError instanceof Error ? initError.message : 'Unknown error'}`
      }, { status: 500 });
    }

    try {
      const orderResult = await polymarketOrderService.postGTCOrder({
        tokenID: tokenId,
        price: price, // Use the calculated price from bet percentage
        side: 'BUY',
        size: 5,
      });
      
      console.log('Polymarket order result:', orderResult);
      // Extract the order hash from the response
      const polymarketOrderHash = orderResult.response.orderID;
      console.log('Polymarket order created with hash:', polymarketOrderHash);
      
      if (!polymarketOrderHash) {
        return NextResponse.json({
          success: false,
          error: 'Missing Polymarket order hash',
          message: 'Polymarket did not return an order hash'
        }, { status: 500 });
      }
      
      // Update the order with the Polymarket order hash using the numerical ID
      const updated = await DatabaseService.updateOrderPolymarketHashById(orderIdNum, polymarketOrderHash);
      
      if (!updated) {
        return NextResponse.json({
          success: false,
          error: 'Failed to update order',
          message: 'Failed to associate Polymarket order hash with draft order'
        }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        data: {
          orderId: orderIdNum,
          polymarketOrderHash: polymarketOrderHash,
          txs: orderResult.response.transactionsHashes,
          message: 'Polymarket order created successfully'
        }
      });
    } catch (orderError) {
      console.error('Failed to create Polymarket order:', orderError);
      return NextResponse.json({
        success: false,
        error: 'Failed to create Polymarket order',
        message: orderError instanceof Error ? orderError.message : 'Failed to create Polymarket order'
      }, { status: 500 });
    }

  } catch (error) {
    console.error('Error creating Polymarket order:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to create Polymarket order',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}