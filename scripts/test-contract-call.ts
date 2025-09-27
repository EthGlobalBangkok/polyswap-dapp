import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

const RPC_URL = process.env.RPC_URL!;
const ORDER_HASH_CALCULATOR_ADDRESS = '0x3f4DE99433993f58dDaD05776A9DfF90974995B6';

async function testContractCall() {
  try {
    const provider = new ethers.JsonRpcProvider(RPC_URL);

    // Test with the correct PolyswapOrder.Data structure
    const orderHashContract = new ethers.Contract(
      ORDER_HASH_CALCULATOR_ADDRESS,
      [
        'function getOrderHash((address,address,address,uint256,uint256,uint256,uint256,bytes32,bytes32)) view returns (bytes32)'
      ],
      provider
    );

    // Create test data with current timestamp and reasonable values
    const currentTime = Math.floor(Date.now() / 1000);
    const testOrder = [
      '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359', // sellToken (USDC)
      '0xc2132d05d31c914a87c6611c10748aeb04b58e8f', // buyToken (USDT)
      '0x547b46642a9a067e476aeee72241a9d0a772f947', // receiver (same as owner)
      ethers.parseUnits('100', 6).toString(), // sellAmount (100 USDC with 6 decimals)
      ethers.parseUnits('95', 6).toString(),  // minBuyAmount (95 USDT with 6 decimals)
      (currentTime - 3600).toString(), // t0 (1 hour ago)
      (currentTime + 86400).toString(), // t (24 hours from now)
      '0x0000000000000000000000000000000000000000000000000000000000000000', // polymarketOrderHash
      '0x0000000000000000000000000000000000000000000000000000000000000000'  // appData
    ];

    console.log('Testing contract call with PolyswapOrder.Data structure:');
    console.log('Order tuple:', testOrder);
    console.log('---');

    try {
      const result = await orderHashContract.getOrderHash(testOrder);
      console.log('✅ Contract call successful!');
      console.log('Result:', result);
    } catch (error) {
      console.log('❌ Contract call failed:');
      console.error(error);
    }

  } catch (error) {
    console.error('Error in test script:', error);
  } finally {
    process.exit(0);
  }
}

testContractCall().catch(console.error);