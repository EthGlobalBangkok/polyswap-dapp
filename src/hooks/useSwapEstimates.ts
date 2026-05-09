"use client";

import { useMemo } from "react";
import { formatUnits, isAddress, parseUnits } from "viem";
import { CowQuoteError, useQuote } from "@/hooks/useQuote";
import { useTokenPrice } from "@/hooks/useTokenPrice";
import type { TokenViewModel } from "@/types/design";

export interface SwapEstimates {
  amountInUsd: number;
  amountOutEstimate: number;
  isLoading: boolean;
  isQuoteError: boolean;
  quoteErrorType: string | null;
  quoteErrorMessage: string | null;
}

interface UseSwapEstimatesParams {
  fromToken: TokenViewModel | null;
  toToken: TokenViewModel | null;
  amountIn: string;
  userAddress: string | undefined;
}

export function useSwapEstimates({
  fromToken,
  toToken,
  amountIn,
  userAddress,
}: UseSwapEstimatesParams): SwapEstimates {
  const amountInNumber = Number(amountIn) || 0;

  const fromPriceQuery = useTokenPrice({
    tokenAddress: fromToken?.address ?? "",
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
