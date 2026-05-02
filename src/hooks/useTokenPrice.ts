"use client";

import { useQuery } from "@tanstack/react-query";
import { isAddress } from "viem";

/** CoW Protocol BFF API base URL. */
const BFF_BASE_URL = "https://bff.cow.fi";

/** 1-minute stale time — prices move frequently. */
const STALE_MS = 60_000;

// Shape returned by the CoW BFF usdPrice endpoint.
interface BffUsdPriceResponse {
  price: number;
}

async function fetchTokenUsdPrice(tokenAddress: string, chainId: number): Promise<number | null> {
  const url = `${BFF_BASE_URL}/${chainId}/tokens/${tokenAddress}/usdPrice`;
  const res = await fetch(url);

  if (!res.ok) {
    // 404 just means the token isn't priced — not a hard error.
    if (res.status === 404) return null;
    throw new Error(
      `CoW BFF price fetch failed for ${tokenAddress} on chain ${chainId}: ${res.status}`
    );
  }

  const json: unknown = await res.json();

  // Runtime guard: ensure the response has a numeric `price` field.
  if (
    typeof json !== "object" ||
    json === null ||
    typeof (json as Record<string, unknown>).price !== "number"
  ) {
    throw new Error(
      `Unexpected BFF price response shape for ${tokenAddress}: ${JSON.stringify(json)}`
    );
  }

  return (json as BffUsdPriceResponse).price;
}

interface UseTokenPriceOptions {
  /** Token contract address (checksummed or lowercase). */
  tokenAddress: string;
  /** Chain ID — defaults to 137 (Polygon). */
  chainId?: number;
}

/**
 * Fetches the USD price for a single token directly from the CoW Protocol BFF
 * API. Returns `null` when the price is unavailable (e.g. illiquid token).
 */
export function useTokenPrice({ tokenAddress, chainId = 137 }: UseTokenPriceOptions) {
  const enabled = isAddress(tokenAddress);

  return useQuery<number | null>({
    queryKey: ["cow-token-price", chainId, tokenAddress.toLowerCase()],
    queryFn: () => fetchTokenUsdPrice(tokenAddress, chainId),
    enabled,
    staleTime: STALE_MS,
  });
}
