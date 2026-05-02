"use client";

import { useCallback, useMemo, useState } from "react";
import type { Side, TokenViewModel } from "@/types/design";

/**
 * Static token list for the swap form. These prices are used for the
 * receive-amount estimate and USD totals; live prices are fetched via
 * useTokenPrice when needed.
 */
export const SWAP_TOKENS: ReadonlyArray<TokenViewModel> = [
  {
    symbol: "USDC",
    name: "USD Coin",
    priceUsd: 1,
    address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
    decimals: 6,
  },
  {
    symbol: "USDC.e",
    name: "USD Coin (Bridged)",
    priceUsd: 1,
    address: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
    decimals: 6,
  },
  {
    symbol: "USDT",
    name: "Tether",
    priceUsd: 1,
    address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
    decimals: 6,
  },
  {
    symbol: "DAI",
    name: "Dai",
    priceUsd: 1,
    address: "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063",
    decimals: 18,
  },
  {
    symbol: "WETH",
    name: "Ethereum",
    priceUsd: 3820,
    address: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619",
    decimals: 18,
  },
  {
    symbol: "WBTC",
    name: "Bitcoin",
    priceUsd: 102_400,
    address: "0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6",
    decimals: 8,
  },
  {
    symbol: "WPOL",
    name: "Polygon",
    priceUsd: 0.612,
    address: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",
    decimals: 18,
  },
  {
    symbol: "LINK",
    name: "Chainlink",
    priceUsd: 18.42,
    address: "0x53E0bca35eC356BD5ddDFebbD1Fc0fD03FaBad39",
    decimals: 18,
  },
  {
    symbol: "AAVE",
    name: "Aave",
    priceUsd: 314.2,
    address: "0xD6DF932A45C0f255f85145f286eA0b292B21C90B",
    decimals: 18,
  },
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

const FALLBACK_FROM = SWAP_TOKENS[0]!; // USDC
const FALLBACK_TO = SWAP_TOKENS[4]!; // WETH

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
 * the SafeSignModal so the form state is decoupled from network side-effects.
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
