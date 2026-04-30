// src/services/safe/safeTxService.ts
import type { Address, Hash } from "viem";
import type { SafeMultisigTxResponse } from "./types";

/**
 * Safe migrated from `safe-transaction-{chain}.safe.global` to a
 * chain-agnostic gateway. The old hostname 308-redirects.
 * Polygon shortname = "pol".
 */
const TX_SVC_BASE = "https://api.safe.global/tx-service/pol/api/v1";

export type FetchResult =
  | { kind: "ok"; tx: SafeMultisigTxResponse }
  | { kind: "notFound" } // safeTxHash not yet indexed by Safe — keep retrying
  | { kind: "error"; error: Error };

export async function fetchMultisigTransaction(
  safeTxHash: Hash,
  signal?: AbortSignal
): Promise<FetchResult> {
  const url = `${TX_SVC_BASE}/multisig-transactions/${safeTxHash}/`;
  try {
    const res = await fetch(url, { signal, headers: { accept: "application/json" } });
    if (res.status === 404) return { kind: "notFound" };
    if (!res.ok) {
      return { kind: "error", error: new Error(`Safe API ${res.status}`) };
    }
    const tx = (await res.json()) as SafeMultisigTxResponse;
    return { kind: "ok", tx };
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      // Caller-driven cancellation — rethrow so React effects can clean up cleanly.
      throw e;
    }
    return { kind: "error", error: e as Error };
  }
}

/**
 * Detects whether `targetSafeTxHash` was superseded by another tx at the same nonce.
 * Returns `true` if the same Safe has another **executed** tx at that nonce
 * with a different safeTxHash.
 */
export async function isReplaced(
  safe: Address,
  nonce: number,
  targetSafeTxHash: Hash,
  signal?: AbortSignal
): Promise<boolean> {
  const url =
    `${TX_SVC_BASE}/safes/${safe}/multisig-transactions/` + `?nonce=${nonce}&executed=true`;
  const res = await fetch(url, { signal, headers: { accept: "application/json" } });
  if (!res.ok) return false;
  const data = (await res.json()) as { results: SafeMultisigTxResponse[] };
  return data.results.some(
    (t) => t.isExecuted && t.safeTxHash.toLowerCase() !== targetSafeTxHash.toLowerCase()
  );
}
