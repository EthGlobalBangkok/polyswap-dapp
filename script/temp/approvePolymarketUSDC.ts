import { ethers } from "ethers";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config();

/**
 * Script to approve USDC for Polymarket CTFExchange contract
 * This is needed for BUY orders on Polymarket
 */
async function approveUSDC() {
  try {
    console.log("🔧 Setting up provider and wallet...");

    const rpcUrl = process.env.RPC_URL || "https://polygon-rpc.com";
    const provider = new ethers.JsonRpcProvider(rpcUrl);

    // Get private key
    const pk = process.env.PK;
    if (!pk) {
      throw new Error("Private key (PK) is not set in environment variables");
    }
    const privateKey = pk.startsWith("0x") ? pk : `0x${pk}`;
    const wallet = new ethers.Wallet(privateKey, provider);

    const walletAddress = await wallet.getAddress();
    console.log(`📍 Wallet address: ${walletAddress}`);

    // Contract addresses on Polygon
    const USDC_ADDRESS = process.env.USDC_ADDRESS || "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174"; // USDC on Polygon (6 decimals)
    const CTF_EXCHANGE =
      process.env.POLYMARKET_CONTRACT_ADDRESS || "0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E"; // CTFExchange
    const NEG_RISK_CTF_EXCHANGE = "0xC5d563A36AE78145C45a50134d48A1215220f80a"; // NegRiskCtfExchange
    const NEG_RISK_ADAPTER = "0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296"; // NegRiskAdapter

    console.log(`💵 USDC Address: ${USDC_ADDRESS}`);
    console.log(`🏦 CTFExchange: ${CTF_EXCHANGE}`);

    // ERC20 ABI
    const erc20Abi = [
      "function allowance(address owner, address spender) view returns (uint256)",
      "function approve(address spender, uint256 amount) returns (bool)",
      "function balanceOf(address account) view returns (uint256)",
      "function decimals() view returns (uint8)",
      "function symbol() view returns (string)",
    ];

    // Create USDC contract instance
    const usdcContract = new ethers.Contract(USDC_ADDRESS, erc20Abi, wallet);

    // Get token info
    const decimals = await usdcContract.decimals();
    const symbol = await usdcContract.symbol();
    const balance = await usdcContract.balanceOf(walletAddress);

    console.log(`\n💰 Token Info:`);
    console.log(`   Symbol: ${symbol}`);
    console.log(`   Decimals: ${decimals}`);
    console.log(`   Balance: ${ethers.formatUnits(balance, decimals)} ${symbol}`);

    // Check allowances for all relevant contracts
    const contracts = [
      { name: "CTFExchange", address: CTF_EXCHANGE },
      { name: "NegRiskCtfExchange", address: NEG_RISK_CTF_EXCHANGE },
      { name: "NegRiskAdapter", address: NEG_RISK_ADAPTER },
    ];

    console.log(`\n📊 Current Allowances:`);
    for (const contract of contracts) {
      const allowance = await usdcContract.allowance(walletAddress, contract.address);
      console.log(`   ${contract.name}: ${ethers.formatUnits(allowance, decimals)} ${symbol}`);
    }

    // Maximum approval amount
    const maxApproval = ethers.MaxUint256;

    console.log(`\n🚀 Approving unlimited USDC for Polymarket contracts...`);

    // Approve each contract
    for (const contract of contracts) {
      const currentAllowance = await usdcContract.allowance(walletAddress, contract.address);

      if (currentAllowance > 0n) {
        console.log(
          `   ✅ ${contract.name} already has allowance: ${ethers.formatUnits(currentAllowance, decimals)} ${symbol}`
        );
        continue;
      }

      console.log(`   📝 Approving ${contract.name}...`);
      const tx = await usdcContract.approve(contract.address, maxApproval);
      console.log(`   ⏳ Transaction hash: ${tx.hash}`);
      console.log(`   ⏳ Waiting for confirmation...`);

      const receipt = await tx.wait();
      console.log(`   ✅ Approved! Block: ${receipt?.blockNumber}`);
    }

    console.log(`\n✨ All approvals complete!`);

    // Verify approvals
    console.log(`\n🔍 Verifying Allowances:`);
    for (const contract of contracts) {
      const allowance = await usdcContract.allowance(walletAddress, contract.address);
      const isMax = allowance === maxApproval;
      console.log(
        `   ${contract.name}: ${isMax ? "♾️  UNLIMITED" : ethers.formatUnits(allowance, decimals)} ${symbol}`
      );
    }
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

// Run the script
approveUSDC()
  .then(() => {
    console.log("\n✅ Script completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Script failed:", error);
    process.exit(1);
  });
