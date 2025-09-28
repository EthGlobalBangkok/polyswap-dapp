import { ethers } from 'ethers';
import dotenv from 'dotenv';
import { DatabaseService } from '../src/backend/services/databaseService';
import { OrderUidCalculationService } from '../src/backend/services/orderUidCalculationService';

// Load environment variables
dotenv.config();

const RPC_URL = process.env.RPC_URL!;

/**
 * Script to calculate and populate order UIDs for all existing orders in the database
 */
async function populateOrderUids() {
  console.log('🔄 Starting order UID population for existing orders...');

  try {
    // Initialize provider and OrderUidCalculationService
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    OrderUidCalculationService.initialize(provider);

    // Test connection
    const network = await provider.getNetwork();
    console.log(`🌐 Connected to network: ${network.name} (Chain ID: ${network.chainId})`);

    // Get all orders from database (not just live ones, but all)
    console.log('📋 Fetching all orders from database...');
    const allOrders = await DatabaseService.getAllPolyswapOrders();

    if (allOrders.length === 0) {
      console.log('❌ No orders found in database');
      return;
    }

    console.log(`✅ Found ${allOrders.length} total orders`);

    // Filter orders that don't have order_uid yet and have a valid order_hash (not draft orders)
    const ordersWithoutUid = allOrders.filter(order =>
      (!order.order_uid || order.order_uid === '') &&
      order.order_hash &&
      order.order_hash !== null
    );

    if (ordersWithoutUid.length === 0) {
      console.log('✅ All orders already have order UIDs');
      return;
    }

    console.log(`📋 Found ${ordersWithoutUid.length} orders without UIDs, calculating...`);

    let successCount = 0;
    let errorCount = 0;

    // Process each order
    for (let i = 0; i < ordersWithoutUid.length; i++) {
      const order = ordersWithoutUid[i];

      try {
        console.log(`\n[${i + 1}/${ordersWithoutUid.length}] Processing order ID ${order.id}`);
        console.log(`Order Hash: ${order.order_hash}`);
        console.log(`Owner: ${order.owner}`);

        // Create PolyswapOrder data from database record
        const polyswapOrderData = OrderUidCalculationService.createPolyswapOrderDataFromDbOrder(order);

        // Calculate order UID using on-chain contract
        const orderUid = await OrderUidCalculationService.calculateCompleteOrderUidOnChain(
          polyswapOrderData,
          order.owner
        );

        console.log(`Calculated UID: ${orderUid}`);

        // Update the database with the calculated UID
        const updated = await DatabaseService.updateOrderUid(order.order_hash, orderUid);

        if (updated) {
          console.log(`✅ Updated order ${order.order_hash} with UID`);
          successCount++;
        } else {
          console.error(`❌ Failed to update order ${order.order_hash} in database`);
          errorCount++;
        }

      } catch (error) {
        console.error(`❌ Error processing order ${order.id} (${order.order_hash}):`, error);
        errorCount++;
      }

      // Add a small delay to avoid overwhelming the RPC
      if (i < ordersWithoutUid.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    console.log('\n🎉 Order UID population completed!');
    console.log('📊 Summary:');
    console.log(`  - Total orders processed: ${ordersWithoutUid.length}`);
    console.log(`  - Successfully updated: ${successCount}`);
    console.log(`  - Errors: ${errorCount}`);

    if (errorCount === 0) {
      console.log('✅ All orders now have order UIDs!');
    } else {
      console.log(`⚠️ ${errorCount} orders could not be processed. Check logs above for details.`);
    }

  } catch (error) {
    console.error('💥 Critical error in population script:', error);
  } finally {
    // Close database connections
    process.exit(0);
  }
}

// Run the script
populateOrderUids().catch(console.error);