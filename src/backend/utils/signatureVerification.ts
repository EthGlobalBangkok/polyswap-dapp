import { ethers } from "ethers";

const EIP1271_MAGIC_VALUE = "0x1626ba7e";
const SAFE_ABI = [
  "function isValidSignature(bytes32 _hash, bytes memory _signature) external view returns (bytes4)",
];
const MAX_TIMESTAMP_AGE_SECONDS = 300; // 5 minutes

export interface SignatureVerificationParams {
  action: string;
  orderIdentifier: string;
  timestamp: number;
  chainId: number;
  signature: string;
  expectedAddress: string;
  provider: ethers.Provider;
}

export interface VerificationResult {
  valid: boolean;
  error?: string;
}

/**
 * Creates a standardized message for signing
 * Format:
 * PolySwap Action Request
 * Action: {action}
 * Order: {orderIdentifier}
 * Timestamp: {timestamp}
 * Chain: {chainId}
 */
export function createSignatureMessage(
  action: string,
  orderIdentifier: string,
  timestamp: number,
  chainId: number
): string {
  return `PolySwap Action Request\nAction: ${action}\nOrder: ${orderIdentifier}\nTimestamp: ${timestamp}\nChain: ${chainId}`;
}

/**
 * Validates that a timestamp is within the acceptable window
 */
function validateTimestamp(timestamp: number): { valid: boolean; error?: string } {
  const now = Math.floor(Date.now() / 1000);

  // Check if timestamp is in the future (with small tolerance for clock drift)
  if (timestamp > now + 60) {
    return { valid: false, error: "Timestamp is in the future" };
  }

  // Check if timestamp is too old
  if (now - timestamp > MAX_TIMESTAMP_AGE_SECONDS) {
    return { valid: false, error: "Signature expired" };
  }

  return { valid: true };
}

/**
 * Verifies an EOA signature using EIP-191 personal sign
 */
function verifyEOASignature(message: string, signature: string, expectedAddress: string): boolean {
  try {
    const recoveredAddress = ethers.verifyMessage(message, signature);
    return recoveredAddress.toLowerCase() === expectedAddress.toLowerCase();
  } catch {
    return false;
  }
}

/**
 * Verifies a Smart Contract signature using EIP-1271
 * This is used for Safe wallets and other smart contract wallets
 */
async function verifySafeSignature(
  message: string,
  signature: string,
  contractAddress: string,
  provider: ethers.Provider
): Promise<boolean> {
  try {
    const messageHash = ethers.hashMessage(message);
    const safeContract = new ethers.Contract(contractAddress, SAFE_ABI, provider);
    const result = await safeContract.isValidSignature(messageHash, signature);
    return result === EIP1271_MAGIC_VALUE;
  } catch {
    return false;
  }
}

/**
 * Verifies a signature from either an EOA or a Smart Contract wallet (Safe)
 * Tries EOA verification first, then falls back to EIP-1271 for contract wallets
 */
export async function verifySignature(
  params: SignatureVerificationParams
): Promise<VerificationResult> {
  const { action, orderIdentifier, timestamp, chainId, signature, expectedAddress, provider } =
    params;

  // 1. Validate timestamp
  const timestampValidation = validateTimestamp(timestamp);
  if (!timestampValidation.valid) {
    return { valid: false, error: timestampValidation.error };
  }

  // 2. Create the message that should have been signed
  const message = createSignatureMessage(action, orderIdentifier, timestamp, chainId);

  // 3. Try EOA verification first (EIP-191)
  if (verifyEOASignature(message, signature, expectedAddress)) {
    return { valid: true };
  }

  // 4. Try Smart Contract verification (EIP-1271) for Safe wallets
  const isValidContractSignature = await verifySafeSignature(
    message,
    signature,
    expectedAddress,
    provider
  );
  if (isValidContractSignature) {
    return { valid: true };
  }

  return { valid: false, error: "Invalid signature" };
}
