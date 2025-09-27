import { ethers } from 'ethers';
import dotenv from 'dotenv';
import { DatabaseService } from '../src/backend/services/databaseService';
import { OrderUidCalculationService } from '../src/backend/services/orderUidCalculationService';

// Load environment variables
dotenv.config();

const RPC_URL = process.env.RPC_URL!;

/**
 * Script to debug order data before sending to contract
 */
async function debugOrderData() {
  try {
    // Initialize provider and OrderUidCalculationService
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    OrderUidCalculationService.initialize(provider);

    // Get first live order from database
    const liveOrders = await DatabaseService.getLiveOrders();

    if (liveOrders.length === 0) {
      console.log('No live orders found in database');
      return;
    }

    const order = liveOrders[0];
    console.log('🔍 Debugging first order:');
    console.log('Raw DB Order:', JSON.stringify(order, null, 2));
    console.log('---');

    // Create PolyswapOrder data from database record
    const polyswapOrderData = OrderUidCalculationService.createPolyswapOrderDataFromDbOrder(order);
    console.log('PolyswapOrder Data:', JSON.stringify(polyswapOrderData, null, 2));
    console.log('---');

    // Check individual fields
    console.log('Field Analysis:');
    console.log(`Owner: ${polyswapOrderData.owner} (length: ${polyswapOrderData.owner.length})`);
    console.log(`Handler: ${polyswapOrderData.handler} (length: ${polyswapOrderData.handler.length})`);
    console.log(`SellToken: ${polyswapOrderData.sellToken} (length: ${polyswapOrderData.sellToken.length})`);
    console.log(`BuyToken: ${polyswapOrderData.buyToken} (length: ${polyswapOrderData.buyToken.length})`);
    console.log(`SellAmount: ${polyswapOrderData.sellAmount} (typeof: ${typeof polyswapOrderData.sellAmount})`);
    console.log(`MinBuyAmount: ${polyswapOrderData.minBuyAmount} (typeof: ${typeof polyswapOrderData.minBuyAmount})`);
    console.log(`StartTime: ${polyswapOrderData.startTime} (typeof: ${typeof polyswapOrderData.startTime})`);
    console.log(`EndTime: ${polyswapOrderData.endTime} (typeof: ${typeof polyswapOrderData.endTime})`);
    console.log(`PolymarketOrderHash: ${polyswapOrderData.polymarketOrderHash} (length: ${polyswapOrderData.polymarketOrderHash.length})`);
    console.log(`AppData: ${polyswapOrderData.appData} (length: ${polyswapOrderData.appData.length})`);
    console.log('---');

    // Check dates
    console.log('Date Analysis:');
    console.log(`StartTime: ${polyswapOrderData.startTime} = ${new Date(polyswapOrderData.startTime * 1000).toISOString()}`);
    console.log(`EndTime: ${polyswapOrderData.endTime} = ${new Date(polyswapOrderData.endTime * 1000).toISOString()}`);
    console.log(`Current time: ${Math.floor(Date.now() / 1000)} = ${new Date().toISOString()}`);
    console.log('---');

    // Validate addresses
    console.log('Address Validation:');
    try {
      console.log(`Owner checksum: ${ethers.getAddress(polyswapOrderData.owner)}`);
    } catch (e) {
      console.log(`❌ Owner address invalid: ${e}`);
    }
    try {
      console.log(`Handler checksum: ${ethers.getAddress(polyswapOrderData.handler)}`);
    } catch (e) {
      console.log(`❌ Handler address invalid: ${e}`);
    }
    try {
      console.log(`SellToken checksum: ${ethers.getAddress(polyswapOrderData.sellToken)}`);
    } catch (e) {
      console.log(`❌ SellToken address invalid: ${e}`);
    }
    try {
      console.log(`BuyToken checksum: ${ethers.getAddress(polyswapOrderData.buyToken)}`);
    } catch (e) {
      console.log(`❌ BuyToken address invalid: ${e}`);
    }
    console.log('---');

    // Check if amounts are valid
    console.log('Amount Validation:');
    try {
      const sellAmountBN = ethers.parseUnits(polyswapOrderData.sellAmount, 0);
      console.log(`SellAmount BigNumber: ${sellAmountBN.toString()}`);
    } catch (e) {
      console.log(`❌ SellAmount invalid: ${e}`);
    }
    try {
      const minBuyAmountBN = ethers.parseUnits(polyswapOrderData.minBuyAmount, 0);
      console.log(`MinBuyAmount BigNumber: ${minBuyAmountBN.toString()}`);
    } catch (e) {
      console.log(`❌ MinBuyAmount invalid: ${e}`);
    }

  } catch (error) {
    console.error('Error in debug script:', error);
  } finally {
    process.exit(0);
  }
}

// Run the script
debugOrderData().catch(console.error);