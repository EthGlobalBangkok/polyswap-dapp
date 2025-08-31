import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';
import { DatabaseService } from '../../../../../backend/services/databaseService';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate required fields
    const requiredFields = [
      'sellToken', 'buyToken', 'sellAmount', 'minBuyAmount', 
      'selectedOutcome', 'betPercentage', 'startDate', 'deadline', 'marketId', 'owner'
    ];
    
    for (const field of requiredFields) {
      if (!body[field]) {
        return NextResponse.json({
          success: false,
          error: `Missing required field: ${field}`,
          message: `Please provide ${field}`
        }, { status: 400 });
      }
    }

    // Validate token addresses and owner address (should be valid Ethereum addresses)
    const ethereumAddressRegex = /^0x[a-fA-F0-9]{40}$/;
    if (!ethereumAddressRegex.test(body.sellToken) || !ethereumAddressRegex.test(body.buyToken)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid token addresses',
        message: 'Token addresses must be valid Ethereum addresses'
      }, { status: 400 });
    }

    // Validate owner address (Safe address)
    if (!ethereumAddressRegex.test(body.owner)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid owner address',
        message: 'Owner address must be a valid Ethereum address (Safe address)'
      }, { status: 400 });
    }

    // Validate amounts (should be positive numbers)
    if (parseFloat(body.sellAmount) <= 0 || parseFloat(body.minBuyAmount) <= 0) {
      return NextResponse.json({
        success: false,
        error: 'Invalid amounts',
        message: 'Sell amount and minimum buy amount must be positive'
      }, { status: 400 });
    }

    // Validate and process dates
    let startDate: Date;
    if (body.startDate === 'now') {
      startDate = new Date();
    } else {
      startDate = new Date(body.startDate);
    }

    const deadline = new Date(body.deadline);
    const now = new Date();
    
    if (startDate < now) {
      return NextResponse.json({
        success: false,
        error: 'Invalid start date',
        message: 'Start date must be in the future'
      }, { status: 400 });
    }
    
    if (deadline <= startDate) {
      return NextResponse.json({
        success: false,
        error: 'Invalid deadline',
        message: 'Deadline must be after start date'
      }, { status: 400 });
    }

    // Validate bet percentage
    const betPercentage = parseFloat(body.betPercentage);
    if (betPercentage <= 0 || betPercentage > 100) {
      return NextResponse.json({
        success: false,
        error: 'Invalid bet percentage',
        message: 'Bet percentage must be between 1 and 100'
      }, { status: 400 });
    }

    // TODO: Initialize and create Polymarket order here
    // For now, using hardcoded data as placeholders
    const polymarketOrderHash = '0xb90339c2d581c7ea40005c38efbc88145494015133c687e8c74ccac1891acf3f';

    // Create polyswap order data for database
    const orderData = {
      sellToken: body.sellToken,
      buyToken: body.buyToken,
      sellAmount: body.sellAmount,
      minBuyAmount: body.minBuyAmount,
      selectedOutcome: body.selectedOutcome,
      betPercentage: body.betPercentage,
      startDate: startDate.toISOString(),
      deadline: deadline.toISOString(),
      marketId: body.marketId,
      polymarketOrderHash: polymarketOrderHash,
      owner: body.owner,
    };

    // Save to database
    let orderHash: string;
    try {
      orderHash = await DatabaseService.insertPolyswapOrderFromForm(orderData);
    } catch (error) {
      console.error('Failed to save order to database:', error);
      return NextResponse.json({
        success: false,
        error: 'Failed to save order to database',
        message: error instanceof Error ? error.message : 'Unknown error saving order'
      }, { status: 500 });
    }
    
    // Create transaction data for conditional order creation
    // This is a simplified example - in production, you'd construct the actual ComposableCoW transaction sent to a safe
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
        polymarketOrder: {
          hash: polymarketOrderHash,
          status: 'placeholder' // TODO: Replace with actual Polymarket order status
        }
      },
    });

  } catch (error) {
    console.error('Error creating polyswap order:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to create polyswap order',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}