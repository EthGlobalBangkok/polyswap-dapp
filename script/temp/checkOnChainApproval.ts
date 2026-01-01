#!/usr/bin/env tsx

import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { ethers } from "ethers";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, "../..", ".env") });

// Contract addresses
const CTF_ADDRESS = "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045";
const CTF_EXCHANGE = "0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E";
const NEG_RISK_CTF_EXCHANGE = "0xC5d563A36AE78145C45a50134d48A1215220f80a";
const NEG_RISK_ADAPTER = "0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296";

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

  console.log("=".repeat(60));
  console.log("On-Chain CTF Approval Check");
  console.log("=".repeat(60));
  console.log(`\nWallet: ${walletAddress}`);
  console.log(`CTF Contract: ${CTF_ADDRESS}\n`);

  const ctfContract = new ethers.Contract(CTF_ADDRESS, ERC1155_ABI, provider);

  // Check token balance
  const tokenId = "24394670903706558879845790079760859552309100903651562795058188175118941818512";
  const balance = await ctfContract.balanceOf(walletAddress, tokenId);
  console.log(`Token Balance: ${balance} (${Number(balance) / 1e6} shares)\n`);

  // Check approvals for each operator
  const operators = [
    { name: "CTFExchange", address: CTF_EXCHANGE },
    { name: "NegRiskCtfExchange", address: NEG_RISK_CTF_EXCHANGE },
    { name: "NegRiskAdapter", address: NEG_RISK_ADAPTER },
  ];

  console.log("Approval Status:");
  for (const op of operators) {
    try {
      const isApproved = await ctfContract.isApprovedForAll(walletAddress, op.address);
      console.log(`  ${isApproved ? "✅" : "❌"} ${op.name}: ${isApproved}`);
    } catch (e: any) {
      console.log(`  ⚠️  ${op.name}: Error - ${e.message}`);
    }
  }

  console.log("\n" + "=".repeat(60));
}

check()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
