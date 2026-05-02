import {
  createPublicClient,
  createWalletClient,
  http,
  webSocket,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import { polygon } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

let cachedPublicClient: PublicClient | null = null;
let cachedWebSocketClient: PublicClient | null = null;
let cachedWalletClient: WalletClient | null = null;

export function getPublicClient(): PublicClient {
  if (cachedPublicClient) return cachedPublicClient;
  const rpcUrl = process.env.RPC_URL;
  if (!rpcUrl) throw new Error("RPC_URL is not set");
  cachedPublicClient = createPublicClient({
    chain: polygon,
    transport: http(rpcUrl),
  });
  return cachedPublicClient;
}

export function getWebSocketClient(): PublicClient {
  if (cachedWebSocketClient) return cachedWebSocketClient;
  const wssUrl = process.env.WSS_RPC_URL;
  if (!wssUrl) throw new Error("WSS_RPC_URL is not set");
  cachedWebSocketClient = createPublicClient({
    chain: polygon,
    transport: webSocket(wssUrl),
  });
  return cachedWebSocketClient;
}

export function getWalletClient(): WalletClient {
  if (cachedWalletClient) return cachedWalletClient;
  const pk = process.env.PK;
  if (!pk) throw new Error("PK is not set");
  const privateKey: Hex = (pk.startsWith("0x") ? pk : `0x${pk}`) as Hex;
  const account = privateKeyToAccount(privateKey);
  const rpcUrl = process.env.RPC_URL;
  if (!rpcUrl) throw new Error("RPC_URL is not set");
  cachedWalletClient = createWalletClient({
    account,
    chain: polygon,
    transport: http(rpcUrl),
  });
  return cachedWalletClient;
}
