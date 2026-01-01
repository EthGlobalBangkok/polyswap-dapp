#!/usr/bin/env tsx

import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { ethers } from "ethers";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, "../..", ".env") });

// Contract addresses on Polygon
const USDC_ADDRESS = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174"; // USDC on Polygon (6 decimals)
const CTF_ADDRESS = "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045"; // CTF (ERC1155)
const CTF_EXCHANGE = "0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E";
const NEG_RISK_CTF_EXCHANGE = "0xC5d563A36AE78145C45a50134d48A1215220f80a";
const NEG_RISK_ADAPTER = "0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296";

const ERC20_ABI = [
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
];

const ERC1155_ABI = [
  "function isApprovedForAll(address account, address operator) view returns (bool)",
  "function balanceOf(address account, uint256 id) view returns (uint256)",
];

async function check() {
  const rpcUrl = process.env.RPC_URL || "https://polygon-rpc.com";
  const provider = new ethers.JsonRpcProvider(rpcUrl);

  const pk = process.env.PK;
  if (!pk) throw new Error("PK not set");
  const privateKey = pk.startsWith("0x") ? pk : `0x${pk}`;
  const wallet = new ethers.Wallet(privateKey);
  const walletAddress = wallet.address;

  console.log("=".repeat(70));
  console.log("Full Polymarket Approval Check");
  console.log("=".repeat(70));
  console.log(`\nWallet: ${walletAddress}\n`);

  // Check USDC balance and approvals
  console.log("=== USDC (ERC-20) ===");
  const usdc = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, provider);
  const usdcBalance = await usdc.balanceOf(walletAddress);
  console.log(`Balance: ${ethers.formatUnits(usdcBalance, 6)} USDC\n`);

  const usdcSpenders = [
    { name: "CTF Contract", address: CTF_ADDRESS },
    { name: "CTFExchange", address: CTF_EXCHANGE },
    { name: "NegRiskCtfExchange", address: NEG_RISK_CTF_EXCHANGE },
    { name: "NegRiskAdapter", address: NEG_RISK_ADAPTER },
  ];

  console.log("USDC Allowances:");
  for (const spender of usdcSpenders) {
    const allowance = await usdc.allowance(walletAddress, spender.address);
    const formatted = allowance > BigInt(1e18) ? "UNLIMITED" : ethers.formatUnits(allowance, 6);
    console.log(`  ${allowance > 0n ? "✅" : "❌"} ${spender.name}: ${formatted} USDC`);
  }

  // Check CTF balance and approvals
  console.log("\n=== CTF (ERC-1155) ===");
  const ctf = new ethers.Contract(CTF_ADDRESS, ERC1155_ABI, provider);
  const tokenId = "24394670903706558879845790079760859552309100903651562795058188175118941818512";
  const ctfBalance = await ctf.balanceOf(walletAddress, tokenId);
  console.log(
    `Token Balance: ${Number(ctfBalance) / 1e6} shares (tokenId: ${tokenId.slice(0, 20)}...)\n`
  );

  const ctfOperators = [
    { name: "CTFExchange", address: CTF_EXCHANGE },
    { name: "NegRiskCtfExchange", address: NEG_RISK_CTF_EXCHANGE },
    { name: "NegRiskAdapter", address: NEG_RISK_ADAPTER },
  ];

  console.log("CTF Approvals (setApprovalForAll):");
  for (const op of ctfOperators) {
    const isApproved = await ctf.isApprovedForAll(walletAddress, op.address);
    console.log(`  ${isApproved ? "✅" : "❌"} ${op.name}: ${isApproved}`);
  }

  console.log("\n" + "=".repeat(70));
  console.log("\nSUMMARY: If all CTF approvals are ✅, the issue is with CLOB sync.");
  console.log("Try: Recreate API keys or contact Polymarket support.");
  console.log("=".repeat(70));
}

check()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
