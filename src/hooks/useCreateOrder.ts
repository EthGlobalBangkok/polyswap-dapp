"use client";

import { useCallback, useMemo, useState } from "react";
import type { Side, TokenViewModel } from "@/types/design";

export type Expiry = "7d" | "30d" | "until-resolution";

export interface CreateFormState {
  side: Side;
  threshold: number;
  fromToken: TokenViewModel | null;
  toToken: TokenViewModel | null;
  amountIn: string;
  expiry: Expiry;
  slippagePct: number;
}

const INITIAL: CreateFormState = {
  side: "YES",
  threshold: 0.7,
  fromToken: null,
  toToken: null,
  amountIn: "",
  expiry: "until-resolution",
  slippagePct: 0.5,
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

export function describeSentence(state: CreateFormState, marketTitle: string): string {
  const pct = Math.round(state.threshold * 100);
  const verb = state.side === "YES" ? "reaches" : "drops to";
  const amount = state.amountIn || "0";
  const fromSymbol = state.fromToken?.symbol ?? "—";
  const toSymbol = state.toToken?.symbol ?? "—";
  return `If "${marketTitle}" ${verb} ${pct}%, swap ${amount} ${fromSymbol} for ${toSymbol}.`;
}
