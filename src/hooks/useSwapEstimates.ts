"use client";

import { useMemo } from "react";
import { formatUnits, isAddress, parseUnits } from "viem";
import { CowQuoteError, useQuote } from "@/hooks/useQuote";
import { useTokenPrice } from "@/hooks/useTokenPrice";
import type { TokenViewModel } from "@/types/design";

export interface SwapEstimates {
  /** Live USD value of `amountIn` for `fromToken` (CoW BFF). 0 when unknown. */
  amountInUsd: number;
  /** Estimated receive amount in `toToken` units, derived from a CoW quote. */
  amountOutEstimate: number;
  /** True while any of the underlying queries are in flight. */
  isLoading: boolean;
  /** True when the underlying CoW quote failed (e.g. no liquidity). */
  isQuoteError: boolean;
  /** Stable CoW error code when available, e.g. "NoLiquidity". */
  quoteErrorType: string | null;
  /** Human-readable error message from the CoW API, when available. */
  quoteErrorMessage: string | null;
}

interface UseSwapEstimatesParams {
  fromToken: TokenViewModel | null;
  toToken: TokenViewModel | null;
  amountIn: string;
  /** Wallet address used as `from` in the CoW quote — quote is skipped without it. */
  userAddress: string | undefined;
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/**
 * Drives the swap form's USD figure (send side only) and the receive
 * estimate. USD price comes from the CoW BFF; the receive amount comes from
 * a CoW order-book quote. Falls back to 0 while loading or when inputs are
 * incomplete.
 */
export function useSwapEstimates({
  fromToken,
  toToken,
  amountIn,
  userAddress,
}: UseSwapEstimatesParams): SwapEstimates {
  const amountInNumber = Number(amountIn) || 0;

  // Send-side USD price only — the receive side has been intentionally
  // dropped from the form (it duplicates the send notional in dollars).
  const fromPriceQuery = useTokenPrice({
    tokenAddress: fromToken?.address ?? ZERO_ADDRESS,
  });

  const sellAmountWei = useMemo<string | null>(() => {
    if (!fromToken || !amountIn) return null;
    try {
      const wei = parseUnits(amountIn, fromToken.decimals);
      return wei > 0n ? wei.toString() : null;
    } catch {
      return null;
    }
  }, [fromToken, amountIn]);

  const canQuote =
    fromToken !== null &&
    toToken !== null &&
    sellAmountWei !== null &&
    typeof userAddress === "string" &&
    isAddress(userAddress) &&
    fromToken.address.toLowerCase() !== toToken.address.toLowerCase();

  const quoteQuery = useQuote(
    canQuote
      ? {
          sellToken: fromToken!.address,
          buyToken: toToken!.address,
          sellAmount: sellAmountWei!,
          userAddress: userAddress!,
        }
      : null
  );

  return useMemo<SwapEstimates>(() => {
    const fromPrice = fromPriceQuery.data ?? null;
    const amountInUsd = fromPrice && amountInNumber > 0 ? amountInNumber * fromPrice : 0;

    let amountOutEstimate = 0;
    if (quoteQuery.data && toToken) {
      try {
        amountOutEstimate = Number(
          formatUnits(BigInt(quoteQuery.data.buyAmount), toToken.decimals)
        );
      } catch {
        amountOutEstimate = 0;
      }
    }

    let quoteErrorType: string | null = null;
    let quoteErrorMessage: string | null = null;
    if (quoteQuery.isError && quoteQuery.error) {
      const err = quoteQuery.error;
      if (err instanceof CowQuoteError) {
        quoteErrorType = err.errorType;
        quoteErrorMessage = err.description ?? err.message;
      } else if (err instanceof Error) {
        quoteErrorMessage = err.message;
      }
    }

    return {
      amountInUsd,
      amountOutEstimate,
      isLoading: fromPriceQuery.isLoading || quoteQuery.isLoading,
      isQuoteError: quoteQuery.isError,
      quoteErrorType,
      quoteErrorMessage,
    };
  }, [
    amountInNumber,
    fromPriceQuery.data,
    fromPriceQuery.isLoading,
    toToken,
    quoteQuery.data,
    quoteQuery.isLoading,
    quoteQuery.isError,
    quoteQuery.error,
  ]);
}
