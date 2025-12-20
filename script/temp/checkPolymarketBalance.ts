import { getPolymarketOrderService } from '../../src/backend/services/polymarketOrderService';
import { AssetType } from '@polymarket/clob-client';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Script to check Polymarket CLOB balance and allowance
 */
async function checkBalance() {
  try {
    console.log('🔧 Initializing Polymarket service...');
    const service = getPolymarketOrderService();
    await service.initialize();
    
    console.log('✅ Service initialized\n');
    
    const client = service.getClient();
    if (!client) {
      throw new Error('Failed to get CLOB client');
    }
    
    console.log('📊 Checking CLOB Balance & Allowance...\n');
    
    // Check collateral (USDC) balance and allowance
    const collateral = await client.getBalanceAllowance({ 
      asset_type: AssetType.COLLATERAL 
    });
    console.log('💵 Collateral (USDC):');
    console.log('   Balance:', collateral.balance);
    console.log('   Allowance:', collateral.allowance);
    console.log('');
    
    // Check conditional tokens balance
    const conditional = await client.getBalanceAllowance({ 
      asset_type: AssetType.CONDITIONAL 
    });
    console.log('🎫 Conditional Tokens:');
    console.log('   Balance:', conditional.balance);
    console.log('   Allowance:', conditional.allowance);
    console.log('');
    
    // Parse and display formatted values
    const usdcBalance = parseFloat(collateral.balance || '0');
    const usdcAllowance = parseFloat(collateral.allowance || '0');
    
    console.log('📈 Analysis:');
    console.log(`   USDC Balance: $${usdcBalance.toFixed(6)}`);
    console.log(`   USDC Allowance: $${usdcAllowance.toFixed(6)}`);
    
    if (usdcBalance === 0) {
      console.log('\n⚠️  WARNING: Your USDC balance on the CLOB is 0!');
      console.log('   This might be why orders are failing.');
    }
    
    if (usdcAllowance === 0) {
      console.log('\n⚠️  WARNING: Your USDC allowance on the CLOB is 0!');
      console.log('   You need to approve USDC for the CTFExchange contract.');
    }
    
    if (usdcBalance > 0 && usdcAllowance > 0) {
      console.log('\n✅ Your USDC balance and allowance look good!');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

// Run the script
checkBalance()
  .then(() => {
    console.log('\n✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });

