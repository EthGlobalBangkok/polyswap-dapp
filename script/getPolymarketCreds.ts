import { config as dotenvConfig } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { Chain, ClobClient } from "@polymarket/clob-client";
import { createWalletClient, http, type Hex } from "viem";
import { polygon } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenvConfig({ path: resolve(__dirname, "../.env") });

async function main() {
  const pk = process.env.PK;
  if (!pk) {
    throw new Error("Private key (PK) is not set in environment variables");
  }
  const privateKey: Hex = (pk.startsWith("0x") ? pk : `0x${pk}`) as Hex;
  const account = privateKeyToAccount(privateKey);

  const rpcUrl = process.env.RPC_URL ?? "https://polygon-rpc.com";
  const chainId = parseInt(`${process.env.CHAIN_ID || Chain.POLYGON}`) as Chain;
  const nonce = parseInt(process.env.NONCE || "0");

  const walletClient = createWalletClient({
    account,
    chain: polygon,
    transport: http(rpcUrl),
  });

  console.log(`Address: ${account.address}, chainId: ${chainId}`);

  const host = process.env.CLOB_API_URL || "https://clob.polymarket.com";
  const clobClient = new ClobClient(host, chainId, walletClient);

  const resp = await clobClient.createApiKey(nonce);
  console.log("🎉 API Key Created Successfully!");
  console.log("=".repeat(50));
  console.log(`✅ Nonce: ${nonce} (next nonce: ${nonce + 1})`);
  console.log(`🔑 API Key: ${resp.key}`);
  console.log(`🔐 Secret: ${resp.secret}`);
  console.log(`🔓 Passphrase: ${resp.passphrase}`);
  console.log("=".repeat(50));
  console.log("\n💡 You can now use these credentials in your Polymarket CLOB client!");
}

main();
