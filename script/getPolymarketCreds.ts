import { ethers } from "ethers";
import { config as dotenvConfig } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { Chain, ClobClient } from "@polymarket/clob-client";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenvConfig({ path: resolve(__dirname, "../.env") });

async function main() {
    const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL || "https://polygon-rpc.com");
    const wallet = new ethers.Wallet(process.env.PK as string, provider);
    const chainId = parseInt(`${process.env.CHAIN_ID || Chain.POLYGON}`) as Chain;
    const nonce = parseInt(process.env.NONCE || "0");
    
    console.log(`Address: ${wallet.address}, chainId: ${chainId}`);

    const host = process.env.CLOB_API_URL || "https://clob.polymarket.com";
    const clobClient = new ClobClient(host, chainId, wallet);

    const resp = await clobClient.createApiKey(nonce);
    console.log("🎉 API Key Created Successfully!");
    console.log("=" .repeat(50));
    console.log(`✅ Nonce: ${nonce} (next nonce: ${nonce + 1})`);
    console.log(`🔑 API Key: ${resp.key}`);
    console.log(`🔐 Secret: ${resp.secret}`);
    console.log(`🔓 Passphrase: ${resp.passphrase}`);
    console.log("=" .repeat(50));
    console.log("\n💡 You can now use these credentials in your Polymarket CLOB client!");
}

main();