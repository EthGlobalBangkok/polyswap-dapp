"use client";

import { useCallback, useMemo, useState } from "react";
import type { Side, TokenViewModel } from "@/types/design";

/**
 * Static token list for the swap form. The legacy `apiService.getQuote` will
 * eventually drive the real price; for now this gives the UI deterministic
 * values to compute the receive amount and USD totals.
 */
export const SWAP_TOKENS: ReadonlyArray<TokenViewModel> = [
  { symbol: "USDC", name: "USD Coin", priceUsd: 1 },
  { symbol: "USDT", name: "Tether", priceUsd: 1 },
  { symbol: "DAI", name: "Dai", priceUsd: 1 },
  { symbol: "WETH", name: "Ethereum", priceUsd: 3820 },
  { symbol: "WBTC", name: "Bitcoin", priceUsd: 102_400 },
  { symbol: "WPOL", name: "Polygon", priceUsd: 0.612 },
  { symbol: "LINK", name: "Chainlink", priceUsd: 18.42 },
  { symbol: "AAVE", name: "Aave", priceUsd: 314.2 },
];

export type Expiry = "7d" | "30d" | "until-resolution";

export interface CreateFormState {
  side: Side;
  threshold: number;
  fromToken: TokenViewModel;
  toToken: TokenViewModel;
  amountIn: string;
  expiry: Expiry;
  slippagePct: number;
}

const FALLBACK_FROM = SWAP_TOKENS[0]!;
const FALLBACK_TO = SWAP_TOKENS[3]!;

const INITIAL: CreateFormState = {
  side: "YES",
  threshold: 0.7,
  fromToken: FALLBACK_FROM,
  toToken: FALLBACK_TO,
  amountIn: "",
  expiry: "until-resolution",
  slippagePct: 0.5,
};

export interface CreateFormDerived {
  amountInNumber: number;
  amountInUsd: number;
  amountOutEstimate: number;
  amountOutUsd: number;
  isValid: boolean;
  validationMessage: string | null;
}

export interface UseCreateOrderReturn {
  state: CreateFormState;
  derived: CreateFormDerived;
  set: <K extends keyof CreateFormState>(key: K, value: CreateFormState[K]) => void;
  reset: () => void;
}

/**
 * Pure, presentational form hook. Submission is wired separately through
 * the SignModal so the form state is decoupled from network side-effects.
 */
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
    const amountInUsd = amountInNumber * state.fromToken.priceUsd;
    const amountOutEstimate = state.toToken.priceUsd > 0 ? amountInUsd / state.toToken.priceUsd : 0;
    const amountOutUsd = amountOutEstimate * state.toToken.priceUsd;

    let validationMessage: string | null = null;
    if (state.fromToken.symbol === state.toToken.symbol) {
      validationMessage = "Pick two different tokens.";
    } else if (amountInNumber <= 0) {
      validationMessage = "Enter the amount you want to swap in.";
    }

    return {
      amountInNumber,
      amountInUsd,
      amountOutEstimate,
      amountOutUsd,
      isValid: validationMessage === null,
      validationMessage,
    };
  }, [state]);

  return { state, derived, set, reset };
}

export function describeSentence(state: CreateFormState, marketTitle: string): string {
  const pct = Math.round(state.threshold * 100);
  const verb = state.side === "YES" ? "reaches" : "drops to";
  const amount = state.amountIn || "0";
  return `If "${marketTitle}" ${verb} ${pct}%, swap ${amount} ${state.fromToken.symbol} for ${state.toToken.symbol}.`;
}
