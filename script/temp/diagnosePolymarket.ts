import { ethers } from "ethers";
import * as dotenv from "dotenv";

dotenv.config();

/**
 * Diagnostic script to check all possible Polymarket-related contracts and approvals
 */
async function diagnose() {
  try {
    console.log("🔧 Setting up...\n");

    const rpcUrl = process.env.RPC_URL || "https://polygon-rpc.com";
    const provider = new ethers.JsonRpcProvider(rpcUrl);

    const pk = process.env.PK;
    if (!pk) throw new Error("PK not set");
    const privateKey = pk.startsWith("0x") ? pk : `0x${pk}`;
    const wallet = new ethers.Wallet(privateKey, provider);
    const walletAddress = await wallet.getAddress();

    console.log(`📍 Wallet: ${walletAddress}\n`);

    // All relevant contract addresses
    const USDC = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
    const CTF = "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045"; // Conditional Tokens Framework
    const exchanges = {
      CTFExchange: "0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E",
      NegRiskCtfExchange: "0xC5d563A36AE78145C45a50134d48A1215220f80a",
      NegRiskAdapter: "0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296",
    };

    const erc20Abi = [
      "function allowance(address owner, address spender) view returns (uint256)",
      "function balanceOf(address account) view returns (uint256)",
      "function decimals() view returns (uint8)",
    ];

    const erc1155Abi = [
      "function isApprovedForAll(address account, address operator) view returns (bool)",
    ];

    // Check USDC
    console.log("💵 USDC Balance & Approvals:\n");
    const usdcContract = new ethers.Contract(USDC, erc20Abi, provider);
    const usdcBalance = await usdcContract.balanceOf(walletAddress);
    const usdcDecimals = await usdcContract.decimals();
    console.log(`   Balance: ${ethers.formatUnits(usdcBalance, usdcDecimals)} USDC\n`);

    for (const [name, address] of Object.entries(exchanges)) {
      const allowance = await usdcContract.allowance(walletAddress, address);
      const isUnlimited = allowance === ethers.MaxUint256;
      console.log(`   ${name}:`);
      console.log(`      Address: ${address}`);
      console.log(
        `      Allowance: ${isUnlimited ? "∞ UNLIMITED" : ethers.formatUnits(allowance, usdcDecimals)}`
      );
    }

    // Check CTF (ERC1155) approvals
    console.log("\n\n🎫 Conditional Token Framework (ERC1155) Approvals:\n");
    console.log(`   CTF Address: ${CTF}\n`);

    const ctfContract = new ethers.Contract(CTF, erc1155Abi, provider);

    for (const [name, address] of Object.entries(exchanges)) {
      const isApproved = await ctfContract.isApprovedForAll(walletAddress, address);
      console.log(`   ${name}:`);
      console.log(`      Address: ${address}`);
      console.log(`      Approved: ${isApproved ? "✅ YES" : "❌ NO"}`);
    }

    console.log("\n\n📊 Summary:\n");
    console.log("For BUY orders on Polymarket, you need:");
    console.log("  1. ✅ USDC balance (you have it)");
    console.log("  2. ✅ USDC approval to CTFExchange (you have it)");
    console.log("  3. ⚠️  Polymarket CLOB API to recognize your approval");
    console.log("\nFor SELL orders, you need:");
    console.log("  1. Position tokens (ERC1155)");
    console.log("  2. setApprovedForAll for CTF contract to exchange");
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

diagnose()
  .then(() => {
    console.log("\n✅ Diagnostic complete");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Failed:", error);
    process.exit(1);
  });
