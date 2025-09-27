import { ethers } from 'ethers';
import dotenv from 'dotenv';
import { DatabaseService } from '../src/backend/services/databaseService';
import { OrderUidCalculationService } from '../src/backend/services/orderUidCalculationService';

// Load environment variables
dotenv.config();

const RPC_URL = process.env.RPC_URL!;
const POLYGON_CHAIN_ID = 137;

/**
 * Script to verify order UID calculation by comparing order hash and order UID side by side
 */
async function verifyOrderUid() {
  try {
    // Initialize provider and OrderUidCalculationService
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    OrderUidCalculationService.initialize(provider);

    // Get all live orders from database
    const liveOrders = await DatabaseService.getLiveOrders();

    if (liveOrders.length === 0) {
      console.log('No live orders found in database');
      return;
    }

    // Process each order
    for (const order of liveOrders) {
      try {
        // Create PolyswapOrder data from database record
        const polyswapOrderData = OrderUidCalculationService.createPolyswapOrderDataFromDbOrder(order);

        // Calculate order UID using on-chain contract
        const orderUid = await OrderUidCalculationService.calculateCompleteOrderUidOnChain(
          polyswapOrderData,
          order.owner
        );

        // Display order information
        console.log('Owner:', order.owner);
        console.log('Order Hash:', order.order_hash || 'N/A');
        console.log('Order UID:', orderUid);
        console.log('---');

      } catch (error) {
        console.log('Owner:', order.owner);
        console.log('Order Hash:', order.order_hash || 'N/A');
        console.log('Order UID: ERROR');
        console.log('---');
      }
    }

  } catch (error) {
    console.error('Error in verification script:', error);
  } finally {
    // Close database connections
    process.exit(0);
  }
}

// Run the script
verifyOrderUid().catch(console.error);