// src/services/safe/types.ts
import type { Address, Hash, Hex } from "viem";

/** A single call inside a batch (matches EIP-5792 `Call` shape). */
export type SafeCall = {
  to: Address;
  data?: Hex;
  value?: bigint;
};

/** Possible high-level statuses observable by the dApp. */
export type SafeTxStatus =
  | { kind: "idle" }
  | { kind: "awaitingSignatures"; have: number; need: number }
  | { kind: "awaitingExecution" }
  | { kind: "executed"; onChainHash: Hash }
  | { kind: "reverted"; onChainHash: Hash }
  | { kind: "replaced" }
  | { kind: "error"; error: Error };

/** Subset of fields we read from Safe Transaction Service REST. */
export type SafeMultisigTxResponse = {
  safe: Address;
  to: Address;
  value: string;
  data: Hex | null;
  operation: 0 | 1;
  nonce: number;
  safeTxHash: Hash;
  executionDate: string | null;
  submissionDate: string;
  blockNumber: number | null;
  transactionHash: Hash | null;
  isExecuted: boolean;
  isSuccessful: boolean | null;
  confirmationsRequired: number;
  confirmations: Array<{
    owner: Address;
    submissionDate: string;
    transactionHash: Hash | null;
    signature: Hex;
    signatureType: "EOA" | "CONTRACT_SIGNATURE" | "APPROVED_HASH" | "ETH_SIGN";
  }>;
};
