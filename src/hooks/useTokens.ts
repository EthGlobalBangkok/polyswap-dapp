"use client";

import { useQuery } from "@tanstack/react-query";

export interface Token {
  chainId: number;
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  logoURI?: string;
}

// Shape expected from each CoW token-list JSON file.
interface TokenListResponse {
  tokens: Token[];
}

const TOKEN_LIST_URLS = [
  "https://files.cow.fi/tokens/CowSwap.json",
  "https://raw.githubusercontent.com/cowprotocol/token-lists/main/src/public/CoinGecko.137.json",
  "https://raw.githubusercontent.com/cowprotocol/token-lists/main/src/public/Uniswap.137.json",
] as const;

const POLYGON_CHAIN_ID = 137;

/** 30-minute stale time — token lists change rarely. */
const STALE_MS = 30 * 60_000;
/** 1-hour GC time — must exceed STALE_MS so cached data survives the stale window. */
const GC_MS = 60 * 60_000;

async function fetchPolygonTokens(): Promise<Token[]> {
  const results = await Promise.all(
    TOKEN_LIST_URLS.map(async (url) => {
      try {
        const res = await fetch(url);
        if (!res.ok) {
          console.warn(`useTokens: failed to fetch ${url} (${res.status})`);
          return null;
        }
        const json: unknown = await res.json();
        // Runtime guard: every valid CoW token list has a `tokens` array.
        if (
          typeof json !== "object" ||
          json === null ||
          !Array.isArray((json as Record<string, unknown>).tokens)
        ) {
          console.warn(`useTokens: unexpected shape from ${url}`);
          return null;
        }
        return json as TokenListResponse;
      } catch (err) {
        console.warn(`useTokens: error fetching ${url}:`, err);
        return null;
      }
    })
  );

  // Deduplicate by address (lower-cased). Prefer the entry that already has a
  // logoURI when two lists contain the same token address.
  const tokenMap = new Map<string, Token>();

  for (const list of results) {
    if (!list) continue;
    for (const token of list.tokens) {
      if (token.chainId !== POLYGON_CHAIN_ID) continue;
      const key = token.address.toLowerCase();
      const existing = tokenMap.get(key);
      if (!existing || (!existing.logoURI && token.logoURI)) {
        tokenMap.set(key, {
          chainId: token.chainId,
          address: token.address,
          name: token.name,
          symbol: token.symbol,
          decimals: token.decimals,
          logoURI: token.logoURI,
        });
      }
    }
  }

  const tokens = Array.from(tokenMap.values());
  tokens.sort((a, b) => a.symbol.localeCompare(b.symbol));
  return tokens;
}

/**
 * Fetches the CoW Protocol token lists directly from the client and returns
 * all tokens available on Polygon (chainId 137), deduplicated and sorted by
 * symbol.
 */
export function useTokens() {
  return useQuery<Token[]>({
    queryKey: ["cow-tokens"],
    queryFn: fetchPolygonTokens,
    staleTime: STALE_MS,
    gcTime: GC_MS,
  });
}
