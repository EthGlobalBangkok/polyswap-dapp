import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';
import { DatabaseService } from '../../../../../../../backend/services/databaseService';
import { TransactionEncodingService } from '../../../../../../../backend/services/transactionEncodingService';
import { SafeBatchService } from '../../../../../../../services/safeBatchService';
import { PolyswapOrderData } from '../../../../../../../backend/interfaces/PolyswapOrder';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { ownerAddress, rpcUrl } = body;
    
    // Validate required fields
    if (!ownerAddress || !rpcUrl) {
      return NextResponse.json({
        success: false,
        error: 'Missing required fields',
        message: 'ownerAddress and rpcUrl are required'
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

    // Get the draft order from database by numerical ID
    const order = await DatabaseService.getPolyswapOrderById(orderId);
    
    if (!order) {
      return NextResponse.json({
        success: false,
        error: 'Order not found',
        message: `No order found with ID: ${orderId}`
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

    // if order.app_data is null and process.env.app_data is also null, return error
    if (!order.app_data && !process.env.APP_DATA) {
      return NextResponse.json({
        success: false,
        error: 'Missing app data',
        message: 'App data must be provided in order or environment variable'
      }, { status: 500 });
    }

    // Validate required fields and provide defaults
    const sellToken = order.sell_token;
    const buyToken = order.buy_token;
    const sellAmount = order.sell_amount;
    const minBuyAmount = order.min_buy_amount || '0';
    const polymarketOrderHash = order.polymarket_order_hash;
    const appData = order.app_data || process.env.APP_DATA;

    if (!sellToken || !buyToken || !sellAmount || !polymarketOrderHash) {
      return NextResponse.json({
        success: false,
        error: 'Invalid order data',
        message: 'Order is missing required fields'
      }, { status: 400 });
    }

    // Create provider for blockchain calls
    const provider = new ethers.JsonRpcProvider(rpcUrl);

    // Convert database order to PolyswapOrderData format
    const polyswapOrderData: PolyswapOrderData = {
      sellToken: sellToken,
      buyToken: buyToken,
      receiver: order.owner,
      sellAmount: sellAmount,
      minBuyAmount: minBuyAmount,
      t0: Math.floor(order.start_time.getTime() / 1000).toString(),
      t: Math.floor(order.end_time.getTime() / 1000).toString(),
      polymarketOrderHash: polymarketOrderHash,
      appData: appData as string
    };

    // Generate main transaction data
    const mainTransactionData = TransactionEncodingService.createTransaction(polyswapOrderData);

    console.log('Preparing batch transaction with approval check:', {
      sellToken,
      ownerAddress,
      sellAmount,
      mainTransaction: mainTransactionData
    });

    // Validate user balance first
    const balanceValidation = await SafeBatchService.validateUserBalance(
      sellToken,
      ownerAddress,
      sellAmount,
      provider
    );

    if (!balanceValidation.isValid) {
      return NextResponse.json({
        success: false,
        error: 'insufficient_balance',
        message: `Insufficient balance. Required: ${balanceValidation.formatted.required}, Available: ${balanceValidation.formatted.balance}`,
        data: {
          required: balanceValidation.required,
          balance: balanceValidation.balance,
          formatted: balanceValidation.formatted
        }
      }, { status: 400 });
    }

    // Prepare batch transaction with approval check
    const batchResult = await SafeBatchService.prepareBatchTransaction(
      sellToken,
      ownerAddress,
      sellAmount,
      mainTransactionData,
      provider
    );

    // Create transaction summary
    const summary = SafeBatchService.createTransactionSummary(batchResult);

    // Estimate gas costs
    let gasEstimate;
    try {
      gasEstimate = await SafeBatchService.estimateBatchGas(
        batchResult,
        provider,
        ownerAddress
      );
    } catch (gasError) {
      console.warn('Gas estimation failed, using defaults:', gasError);
      gasEstimate = {
        totalGasEstimate: BigInt(batchResult.transactions.length * 200000),
        individualEstimates: batchResult.transactions.map(() => BigInt(200000)),
        estimatedCost: '0.01'
      };
    }

    return NextResponse.json({
      success: true,
      data: {
        batchTransaction: batchResult,
        summary: summary,
        gasEstimate: {
          totalGas: gasEstimate.totalGasEstimate.toString(),
          individualGasEstimates: gasEstimate.individualEstimates.map(g => g.toString()),
          estimatedCost: gasEstimate.estimatedCost
        },
        balanceValidation: balanceValidation,
        orderId: order.id,
        polymarketOrderHash: order.polymarket_order_hash,
        message: batchResult.needsApproval 
          ? 'Batch transaction prepared with ERC20 approval'
          : 'Single transaction prepared (approval not needed)'
      }
    });

  } catch (error) {
    console.error('Error generating batch transaction:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to generate batch transaction',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}