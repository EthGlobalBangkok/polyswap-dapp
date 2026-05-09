import { config as dotenvConfig } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { Chain, ClobClient } from "@polymarket/clob-client-v2";
import { createWalletClient, type Hex } from "viem";
import { resilientHttp } from "../src/lib/rpc/resilientHttp.js";
import { polygon } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { createLogger } from "../src/backend/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenvConfig({ path: resolve(__dirname, "../.env") });

const log = createLogger("get-polymarket-creds");

async function main() {
  const pk = process.env.PK;
  if (!pk) {
    throw new Error("private key (PK) is not set in environment variables");
  }
  const privateKey: Hex = (pk.startsWith("0x") ? pk : `0x${pk}`) as Hex;
  const account = privateKeyToAccount(privateKey);

  const rpcUrl = process.env.RPC_URL ?? "https://polygon-rpc.com";
  const chainId = parseInt(`${process.env.CHAIN_ID || Chain.POLYGON}`) as Chain;
  const nonce = parseInt(process.env.NONCE || "0");

  const walletClient = createWalletClient({
    account,
    chain: polygon,
    transport: resilientHttp(rpcUrl),
  });

  log.info(`address ${account.address}, chainId ${chainId}, nonce ${nonce}`);

  const host = process.env.CLOB_API_URL || "https://clob.polymarket.com";
  const clobClient = new ClobClient({ host, chain: chainId, signer: walletClient });

  const resp = await clobClient.createApiKey(nonce);
  log.info(`API key created (next nonce ${nonce + 1})`);
  log.info(`key:        ${resp.key}`);
  log.info(`secret:     ${resp.secret}`);
  log.info(`passphrase: ${resp.passphrase}`);
}

main();
