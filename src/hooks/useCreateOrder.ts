"use client";

import { useCallback, useMemo, useState } from "react";
import type { Side, TokenViewModel } from "@/types/design";

export type Expiry = "7d" | "30d" | "until-resolution";

/**
 * `"auto"` means "no min-buy floor" — the order ships with `minBuyAmount = 1`
 * and CoW solvers settle at the best available price at fill time. A numeric
 * value caps the slippage at that percentage off the live estimate.
 */
export type Slippage = "auto" | number;

export interface CreateFormState {
  side: Side;
  threshold: number;
  fromToken: TokenViewModel | null;
  toToken: TokenViewModel | null;
  amountIn: string;
  expiry: Expiry;
  slippagePct: Slippage;
}

const INITIAL: CreateFormState = {
  side: "YES",
  threshold: 0.7,
  fromToken: null,
  toToken: null,
  amountIn: "",
  expiry: "until-resolution",
  slippagePct: "auto",
};

export interface CreateFormDerived {
  amountInNumber: number;
  isValid: boolean;
  validationMessage: string | null;
}

export interface UseCreateOrderReturn {
  state: CreateFormState;
  derived: CreateFormDerived;
  set: <K extends keyof CreateFormState>(key: K, value: CreateFormState[K]) => void;
  reset: () => void;
}

export function useCreateOrder(): UseCreateOrderReturn {
  const [state, setState] = useState<CreateFormState>(INITIAL);

  const set = useCallback(
    <K extends keyof CreateFormState>(key: K, value: CreateFormState[K]) =>
      setState((s) => ({ ...s, [key]: value })),
    []
  );

  const reset = useCallback(() => setState(INITIAL), []);

  const derived = useMemo<CreateFormDerived>(() => {
    const amountInNumber = Number(state.amountIn) || 0;

    let validationMessage: string | null = null;
    if (!state.fromToken || !state.toToken) {
      validationMessage = "Pick the tokens you want to swap.";
    } else if (state.fromToken.address.toLowerCase() === state.toToken.address.toLowerCase()) {
      validationMessage = "Pick two different tokens.";
    } else if (amountInNumber <= 0) {
      validationMessage = "Enter the amount you want to swap in.";
    }

    return {
      amountInNumber,
      isValid: validationMessage === null,
      validationMessage,
    };
  }, [state]);

  return { state, derived, set, reset };
}

/**
 * Polyswap places a Polymarket BUY limit at the threshold price. That BUY
 * only fills when the side's price *falls* to the threshold — so the only
 * valid configuration is `threshold < currentSideProbability`. When the
 * threshold is at or above current, the order would fill immediately on
 * placement; we surface that explicitly so the user can adjust.
 */
export function describeSentence(
  state: CreateFormState,
  marketTitle: string,
  currentSideProbability?: number
): string {
  const pct = Math.round(state.threshold * 100);
  const fireImmediately =
    currentSideProbability !== undefined && state.threshold >= currentSideProbability;
  const amount = state.amountIn || "0";
  const fromSymbol = state.fromToken?.symbol ?? "—";
  const toSymbol = state.toToken?.symbol ?? "—";
  if (fireImmediately) {
    return `Threshold ${pct}% is at or above the current price — the swap of ${amount} ${fromSymbol} for ${toSymbol} would fire immediately.`;
  }
  return `If "${marketTitle}" drops to ${pct}%, swap ${amount} ${fromSymbol} for ${toSymbol}.`;
}
