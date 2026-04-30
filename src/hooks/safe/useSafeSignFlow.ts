"use client";

import { useCallback, useEffect, useReducer } from "react";
import { useSendCalls, useSendTransaction } from "wagmi";
import type { Hash } from "viem";
import { useSafeAccount } from "./useSafeAccount";
import { useSafeTransaction } from "./useSafeTransaction";
import { encodeMultiSend } from "@/services/safe/multiSendEncoder";
import type { SafeCall } from "@/services/safe/types";

const STORAGE_KEY = "polyswap.pendingSafeTx";

export type SafeSignPhase =
  | { phase: "idle" }
  | { phase: "wallet" } // popup open, awaiting user signature
  | { phase: "rejected"; message: string }
  | { phase: "proposed"; safeTxHash: Hash }
  | { phase: "awaitingSignatures"; safeTxHash: Hash; have: number; need: number }
  | { phase: "awaitingExecution"; safeTxHash: Hash }
  | { phase: "success"; safeTxHash: Hash; onChainHash: Hash }
  | { phase: "reverted"; safeTxHash: Hash; onChainHash: Hash }
  | { phase: "replaced"; safeTxHash: Hash }
  | { phase: "error"; message: string };

type Persisted = { safeTxHash: Hash; ts: number };

export function useSafeSignFlow() {
  const { safeAddress, supports5792, isReady } = useSafeAccount();
  const [state, dispatch] = useReducer((_s: SafeSignPhase, n: SafeSignPhase) => n, {
    phase: "idle",
  } as SafeSignPhase);

  // ----- Send paths -----
  const { sendCallsAsync } = useSendCalls();
  const { sendTransactionAsync } = useSendTransaction();

  const send = useCallback(
    async (calls: SafeCall[]) => {
      if (!safeAddress) {
        dispatch({ phase: "error", message: "No Safe connected" });
        return;
      }
      dispatch({ phase: "wallet" });
      try {
        let safeTxHash: Hash;
        if (supports5792) {
          const result = await sendCallsAsync({
            calls: calls.map((c) => ({
              to: c.to,
              data: c.data,
              value: c.value,
            })),
          });
          safeTxHash = result.id as Hash;
        } else if (calls.length === 1 && calls[0]) {
          // No batching needed.
          const c = calls[0];
          safeTxHash = await sendTransactionAsync({
            to: c.to,
            data: c.data,
            value: c.value,
          });
        } else {
          // Pre-EIP-5792 wallet: pack calls via MultiSendCallOnly so it's still
          // a single Safe transaction (single signature). Note: MultiSendCallOnly
          // is invoked via CALL — so this works even though Safe normally uses
          // DELEGATECALL for the standard MultiSend.
          const packed = encodeMultiSend(calls);
          safeTxHash = await sendTransactionAsync({
            to: packed.to,
            data: packed.data,
            value: packed.value,
          });
        }
        dispatch({ phase: "proposed", safeTxHash });
      } catch (e) {
        const err = e as Error & { code?: number };
        if (err.code === 4001 || /reject/i.test(err.message)) {
          dispatch({ phase: "rejected", message: "You rejected the request in Safe" });
        } else {
          dispatch({ phase: "error", message: err.message ?? "Unknown error" });
        }
      }
    },
    [safeAddress, supports5792, sendCallsAsync, sendTransactionAsync]
  );

  const reset = useCallback(() => {
    dispatch({ phase: "idle" });
    if (typeof window !== "undefined") localStorage.removeItem(STORAGE_KEY);
  }, []);

  // ----- Recover from localStorage on mount -----
  useEffect(() => {
    if (!isReady || typeof window === "undefined") return;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Persisted;
      // Stale beyond 1h — drop.
      if (Date.now() - parsed.ts > 60 * 60 * 1000) {
        localStorage.removeItem(STORAGE_KEY);
        return;
      }
      dispatch({ phase: "proposed", safeTxHash: parsed.safeTxHash });
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [isReady]);

  // ----- Track the proposed tx -----
  const safeTxHash = "safeTxHash" in state ? state.safeTxHash : undefined;
  const txStatus = useSafeTransaction({
    safeTxHash,
    safeAddress,
    use5792: supports5792,
  });

  // Bridge txStatus → flow phase
  useEffect(() => {
    if (!safeTxHash) return;
    switch (txStatus.kind) {
      case "awaitingSignatures":
        dispatch({
          phase: "awaitingSignatures",
          safeTxHash,
          have: txStatus.have,
          need: txStatus.need,
        });
        break;
      case "awaitingExecution":
        dispatch({ phase: "awaitingExecution", safeTxHash });
        break;
      case "executed":
        dispatch({ phase: "success", safeTxHash, onChainHash: txStatus.onChainHash });
        break;
      case "reverted":
        dispatch({ phase: "reverted", safeTxHash, onChainHash: txStatus.onChainHash });
        break;
      case "replaced":
        dispatch({ phase: "replaced", safeTxHash });
        break;
      // "idle" / "error" don't transition
    }
  }, [txStatus, safeTxHash]);

  // ----- Persist while in-flight -----
  useEffect(() => {
    if (typeof window === "undefined") return;
    const inFlight =
      state.phase === "proposed" ||
      state.phase === "awaitingSignatures" ||
      state.phase === "awaitingExecution";
    const terminal =
      state.phase === "success" || state.phase === "reverted" || state.phase === "replaced";
    if (inFlight && "safeTxHash" in state) {
      const payload: Persisted = { safeTxHash: state.safeTxHash, ts: Date.now() };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } else if (terminal) {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [state]);

  return { state, send, reset };
}
