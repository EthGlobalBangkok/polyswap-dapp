// src/hooks/safe/useSafeTransaction.ts
"use client";

import { useEffect, useRef, useState } from "react";
import { parseAbiItem, type Address, type Hash } from "viem";
import { usePublicClient, useWaitForCallsStatus } from "wagmi";
import { fetchMultisigTransaction, isReplaced } from "@/services/safe/safeTxService";
import type { SafeTxStatus } from "@/services/safe/types";

const POLL_INTERVAL_MS = 4_000;
const NOT_FOUND_GRACE_MS = 30_000; // Safe indexer lag tolerance

export type UseSafeTransactionArgs = {
  safeTxHash: Hash | undefined;
  safeAddress: Address | undefined;
  /** When true, prefer wagmi's useWaitForCallsStatus (EIP-5792). */
  use5792: boolean;
};

export function useSafeTransaction({
  safeTxHash,
  safeAddress,
  use5792,
}: UseSafeTransactionArgs): SafeTxStatus {
  const [status, setStatus] = useState<SafeTxStatus>({ kind: "idle" });
  const publicClient = usePublicClient();

  // ---- 5792 path: hand off to wagmi entirely. ----
  const { data: callsStatus } = useWaitForCallsStatus({
    id: safeTxHash,
    pollingInterval: POLL_INTERVAL_MS,
    query: { enabled: use5792 && Boolean(safeTxHash) },
  });

  useEffect(() => {
    if (!use5792 || !callsStatus) return;
    // EIP-5792 status codes: 100 pending, 200 confirmed, 400 cancelled, 500 reverted.
    switch (callsStatus.status) {
      case "pending":
        setStatus({ kind: "awaitingExecution" });
        break;
      case "success": {
        const onChainHash = callsStatus.receipts?.[0]?.transactionHash;
        if (onChainHash) setStatus({ kind: "executed", onChainHash });
        break;
      }
      case "failure": {
        const onChainHash = callsStatus.receipts?.[0]?.transactionHash;
        setStatus(
          onChainHash ? { kind: "reverted", onChainHash } : { kind: "replaced" } // status=400 with no receipt
        );
        break;
      }
    }
  }, [use5792, callsStatus]);

  // ---- Fallback path: REST poll + on-chain event watch, run concurrently. ----
  const restNotFoundSinceRef = useRef<number | null>(null);

  useEffect(() => {
    if (use5792) return;
    if (!safeTxHash || !safeAddress || !publicClient) return;

    const ac = new AbortController();
    let cancelled = false;
    let pollHandle: ReturnType<typeof setTimeout> | null = null;

    // Real-time happy path: ExecutionSuccess / ExecutionFailure both emit
    // an indexed bytes32 txHash that equals the safeTxHash.
    const unwatch = publicClient.watchEvent({
      address: safeAddress,
      events: [
        parseAbiItem("event ExecutionSuccess(bytes32 indexed txHash, uint256 payment)"),
        parseAbiItem("event ExecutionFailure(bytes32 indexed txHash, uint256 payment)"),
      ],
      onLogs: (logs) => {
        if (cancelled) return;
        // Filter to logs whose txHash topic matches the target safeTxHash.
        const log = logs.find(
          (l) => (l as { args?: { txHash?: string } }).args?.txHash === safeTxHash
        );
        if (!log) return;
        const success = log.eventName === "ExecutionSuccess";
        setStatus({
          kind: success ? "executed" : "reverted",
          onChainHash: log.transactionHash!,
        });
      },
    });

    const poll = async () => {
      if (cancelled) return;

      const result = await fetchMultisigTransaction(safeTxHash, ac.signal).catch(() => ({
        kind: "error" as const,
      }));

      if (cancelled) return;

      if (result.kind === "notFound") {
        // Tolerate indexer lag; only escalate to "replaced" check after grace.
        if (restNotFoundSinceRef.current === null) {
          restNotFoundSinceRef.current = Date.now();
        }
        if (Date.now() - restNotFoundSinceRef.current > NOT_FOUND_GRACE_MS) {
          // Still not indexed after grace — it's likely been superseded.
          // We don't have a nonce yet (never got the tx), so leave status as-is.
          // Event watch is still running; if execution actually lands, we'll see it.
        }
      } else if (result.kind === "ok") {
        restNotFoundSinceRef.current = null;
        const tx = result.tx;

        if (tx.isExecuted) {
          if (tx.transactionHash) {
            setStatus({
              kind: tx.isSuccessful ? "executed" : "reverted",
              onChainHash: tx.transactionHash,
            });
            return; // terminal — stop polling
          }
        } else {
          // Replacement check: is there another executed tx at the same nonce?
          const replaced = await isReplaced(safeAddress, tx.nonce, safeTxHash, ac.signal).catch(
            () => false
          );
          if (cancelled) return;
          if (replaced) {
            setStatus({ kind: "replaced" });
            return;
          }
          const have = (tx.confirmations ?? []).length;
          const need = tx.confirmationsRequired;
          setStatus(
            have >= need
              ? { kind: "awaitingExecution" }
              : { kind: "awaitingSignatures", have, need }
          );
        }
      }
      // result.kind === "error" → transient. Don't surface; just retry.

      pollHandle = setTimeout(poll, POLL_INTERVAL_MS);
    };

    void poll();

    return () => {
      cancelled = true;
      ac.abort();
      if (pollHandle) clearTimeout(pollHandle);
      unwatch();
    };
  }, [use5792, safeTxHash, safeAddress, publicClient]);

  return status;
}
