import { NextResponse } from "next/server";

/**
 * @swagger
 * /api/tokens:
 *   get:
 *     tags:
 *       - Tokens
 *     summary: Get supported tokens
 *     description: Returns a list of tokens supported on Polygon from CoW Protocol token lists
 *     responses:
 *       200:
 *         description: List of tokens
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 tokens:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       chainId:
 *                         type: integer
 *                       address:
 *                         type: string
 *                       name:
 *                         type: string
 *                       symbol:
 *                         type: string
 *                       decimals:
 *                         type: integer
 *                       logoURI:
 *                         type: string
 *                 count:
 *                   type: integer
 *                 cached:
 *                   type: boolean
 */

interface Token {
  chainId: number;
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  logoURI?: string;
}

interface TokenList {
  tokens: Token[];
}

const TOKEN_LIST_URLS = [
  "https://files.cow.fi/tokens/CowSwap.json",
  "https://raw.githubusercontent.com/cowprotocol/token-lists/main/src/public/CoinGecko.137.json",
  "https://raw.githubusercontent.com/cowprotocol/token-lists/main/src/public/Uniswap.137.json",
];

// Cache configuration
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes in milliseconds
let tokenCache: {
  tokens: Token[];
  lastUpdated: number;
} | null = null;

async function fetchTokensFromSources(): Promise<Token[]> {
  console.log("Fetching fresh token data from sources...");

  // Fetch all token lists in parallel
  const responses = await Promise.all(
    TOKEN_LIST_URLS.map(async (url) => {
      try {
        const response = await fetch(url);
        if (!response.ok) {
          console.warn(`Failed to fetch from ${url}: ${response.status}`);
          return null;
        }
        return (await response.json()) as TokenList;
      } catch (error) {
        console.warn(`Error fetching from ${url}:`, error);
        return null;
      }
    })
  );

  // Combine all tokens and filter for Polygon (chainId 137)
  const tokenMap = new Map<string, Token>();

  responses.forEach((tokenList) => {
    if (tokenList && tokenList.tokens) {
      tokenList.tokens.forEach((token) => {
        // Filter for Polygon network (chainId 137)
        if (token.chainId === 137) {
          const addressKey = token.address.toLowerCase();

          // Only add if we haven't seen this address before, or if this version has more complete data
          if (
            !tokenMap.has(addressKey) ||
            (tokenMap.get(addressKey) && !tokenMap.get(addressKey)!.logoURI && token.logoURI)
          ) {
            tokenMap.set(addressKey, {
              chainId: token.chainId,
              address: token.address,
              name: token.name,
              symbol: token.symbol,
              decimals: token.decimals,
              logoURI: token.logoURI,
            });
          }
        }
      });
    }
  });

  // Convert map to array and sort
  const allTokens = Array.from(tokenMap.values());
  allTokens.sort((a, b) => a.symbol.localeCompare(b.symbol));

  return allTokens;
}

export async function GET() {
  try {
    const now = Date.now();

    // Check if we have valid cached data
    if (tokenCache && now - tokenCache.lastUpdated < CACHE_DURATION) {
      console.log("Returning cached token data");
      return NextResponse.json({
        success: true,
        tokens: tokenCache.tokens,
        count: tokenCache.tokens.length,
        cached: true,
      });
    }

    // Fetch fresh data
    const tokens = await fetchTokensFromSources();

    // Update cache
    tokenCache = {
      tokens,
      lastUpdated: now,
    };

    console.log(`Fetched and cached ${tokens.length} unique tokens on Polygon`);

    return NextResponse.json({
      success: true,
      tokens,
      count: tokens.length,
      cached: false,
    });
  } catch (error) {
    console.error("Error fetching token lists:", error);

    // If we have cached data, return it even if it's expired
    if (tokenCache) {
      console.log("Error occurred, returning stale cached data");
      return NextResponse.json({
        success: true,
        tokens: tokenCache.tokens,
        count: tokenCache.tokens.length,
        cached: true,
        stale: true,
      });
    }

    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch token lists",
        tokens: [],
        count: 0,
      },
      { status: 500 }
    );
  }
}
