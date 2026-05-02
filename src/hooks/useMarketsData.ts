"use client";

import { useQuery } from "@tanstack/react-query";
import {
  fetchGammaMarketBySlug,
  fetchGammaMarketsByIds,
  parseGammaArray,
  type GammaMarket,
} from "@/services/polymarket";
import type { MarketCategory, MarketViewModel, Side } from "@/types/design";

// ---------------------------------------------------------------------------
// Re-export ApiMarket so components that import it from here continue to work.
// The shape is intentionally kept identical to the old services/api.ts definition.
// ---------------------------------------------------------------------------

export interface MarketOption {
  text: string;
  odds: number;
}

export interface ApiMarket {
  id: string;
  title: string;
  volume: number;
  endDate: string;
  category: string;
  type: "binary" | "multi-choice";
  yesOdds?: number;
  noOdds?: number;
  options?: MarketOption[];
  conditionId?: string;
  slug: string;
  eventSlug?: string;
  clobTokenIds: string[];
  description?: string;
}

// ---------------------------------------------------------------------------
// Lean shape returned by GET /api/markets/search
// ---------------------------------------------------------------------------

interface SearchMarket {
  id: string;
  slug: string;
  question: string;
  category: string | null;
  volume: number;
  liquidity: number;
  end_date: string | null;
  clob_token_ids: string[];
  active: boolean;
}

interface SearchResponse {
  success: boolean;
  data: {
    markets: SearchMarket[];
    count: number;
  };
}

// ---------------------------------------------------------------------------
// Category normalisation (unchanged from original)
// ---------------------------------------------------------------------------

const DESIGN_CATEGORIES: ReadonlyArray<MarketCategory> = [
  "Macro",
  "Politics",
  "Crypto",
  "Geopolitics",
];

const CATEGORY_ALIASES: Record<string, MarketCategory> = {
  // Macro & rates
  macro: "Macro",
  economy: "Macro",
  economics: "Macro",
  finance: "Macro",
  fed: "Macro",
  rates: "Macro",
  inflation: "Macro",
  // Politics & regulation
  politics: "Politics",
  political: "Politics",
  regulation: "Politics",
  elections: "Politics",
  policy: "Politics",
  // Crypto catalysts
  crypto: "Crypto",
  cryptocurrency: "Crypto",
  cryptocurrencies: "Crypto",
  airdrops: "Crypto",
  airdrop: "Crypto",
  bitcoin: "Crypto",
  ethereum: "Crypto",
  // Geopolitics
  geopolitics: "Geopolitics",
  wars: "Geopolitics",
  war: "Geopolitics",
  conflict: "Geopolitics",
  sanctions: "Geopolitics",
};

export function normalizeCategory(raw: string): MarketCategory | null {
  const key = raw.trim().toLowerCase();
  return CATEGORY_ALIASES[key] ?? null;
}

export function isDesignCategory(c: string): c is MarketCategory {
  return (DESIGN_CATEGORIES as ReadonlyArray<string>).includes(c);
}

// ---------------------------------------------------------------------------
// Synthetic sparkline (unchanged from original)
// ---------------------------------------------------------------------------

function syntheticSpark(seed: string, current: number): number[] {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  const rand = () => {
    hash = (hash * 9301 + 49297) | 0;
    return ((hash % 1000) + 1000) / 1000 - 1.5; // -0.5..0.5
  };
  const out: number[] = [];
  let v = Math.max(0.05, current - rand() * 0.3);
  for (let i = 0; i < 60; i++) {
    v = Math.max(0.02, Math.min(0.98, v + rand() * 0.05));
    out.push(v);
  }
  out[out.length - 1] = current;
  return out;
}

// ---------------------------------------------------------------------------
// Merge a lean DB market + live Gamma data → ApiMarket
// Returns null when the Gamma record is unavailable.
// ---------------------------------------------------------------------------

function mergeMarket(lean: SearchMarket, gamma: GammaMarket): ApiMarket {
  const outcomes = parseGammaArray(gamma.outcomes);
  const prices = parseGammaArray(gamma.outcomePrices);
  const clobTokenIds = parseGammaArray(gamma.clobTokenIds);

  const isTraditionalBinary =
    outcomes.length === 2 && outcomes.includes("Yes") && outcomes.includes("No");

  if (isTraditionalBinary) {
    const yesIdx = outcomes.indexOf("Yes");
    const noIdx = outcomes.indexOf("No");
    return {
      id: lean.id,
      title: lean.question,
      volume: lean.volume,
      endDate: lean.end_date ?? gamma.endDate,
      category: lean.category ?? "",
      type: "binary",
      yesOdds: Number(((parseFloat(prices[yesIdx] ?? "0") || 0) * 100).toFixed(2)),
      noOdds: Number(((parseFloat(prices[noIdx] ?? "0") || 0) * 100).toFixed(2)),
      slug: lean.slug,
      clobTokenIds,
      description: gamma.description,
    };
  }

  if (outcomes.length === 2) {
    const options: MarketOption[] = outcomes.map((o, i) => ({
      text: o,
      odds: Number(((parseFloat(prices[i] ?? "0") || 0) * 100).toFixed(2)),
    }));
    return {
      id: lean.id,
      title: lean.question,
      volume: lean.volume,
      endDate: lean.end_date ?? gamma.endDate,
      category: lean.category ?? "",
      type: "binary",
      options,
      slug: lean.slug,
      clobTokenIds,
      description: gamma.description,
    };
  }

  // Multi-choice
  const options: MarketOption[] = outcomes.map((o, i) => ({
    text: o,
    odds: Number(((parseFloat(prices[i] ?? "0") || 0) * 100).toFixed(2)),
  }));
  return {
    id: lean.id,
    title: lean.question,
    volume: lean.volume,
    endDate: lean.end_date ?? gamma.endDate,
    category: lean.category ?? "",
    type: "multi-choice",
    options,
    slug: lean.slug,
    clobTokenIds,
    description: gamma.description,
  };
}

// ---------------------------------------------------------------------------
// toViewModel: ApiMarket → MarketViewModel (unchanged shape)
// ---------------------------------------------------------------------------

export function toViewModel(api: ApiMarket): MarketViewModel | null {
  const category = normalizeCategory(api.category);
  if (!category) return null;
  if (api.type !== "binary") return null;
  const yes = api.yesOdds ?? 0;
  return {
    id: api.id,
    category,
    question: api.title,
    yesProbability: yes,
    volume24h: api.volume,
    endsAt: api.endDate,
    spark: syntheticSpark(api.id, yes),
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const STALE = 60_000;

/**
 * Fetch lean markets from the backend search endpoint, then hydrate each with
 * live Gamma data. Returns `ApiMarket[]`.
 */
async function searchAndHydrate(params: {
  sort?: string;
  limit?: number;
  q?: string;
  category?: string;
}): Promise<ApiMarket[]> {
  const url = new URL("/api/markets/search", window.location.origin);
  if (params.sort) url.searchParams.set("sort", params.sort);
  if (params.limit) url.searchParams.set("limit", String(params.limit));
  if (params.q) url.searchParams.set("q", params.q);
  if (params.category) url.searchParams.set("category", params.category);

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`markets/search failed: ${res.status}`);
  const json = (await res.json()) as SearchResponse;

  if (!json.success) throw new Error("markets/search returned success=false");

  const leanMarkets = json.data.markets;
  if (leanMarkets.length === 0) return [];

  // Fetch live Gamma data for all returned market IDs in one request
  const gammaMarkets = await fetchGammaMarketsByIds(leanMarkets.map((m) => m.id));
  const gammaById = new Map(gammaMarkets.map((g) => [g.id, g]));

  const result: ApiMarket[] = [];
  for (const lean of leanMarkets) {
    const gamma = gammaById.get(lean.id);
    if (!gamma) continue; // Skip if Gamma doesn't have it (recently closed etc.)
    result.push(mergeMarket(lean, gamma));
  }
  return result;
}

// ---------------------------------------------------------------------------
// Public hooks
// ---------------------------------------------------------------------------

export function useTopMarkets() {
  return useQuery({
    queryKey: ["markets", "top"],
    queryFn: () => searchAndHydrate({ sort: "volume", limit: 20 }),
    staleTime: STALE,
    select: (markets) => markets.map(toViewModel).filter((m): m is MarketViewModel => m !== null),
  });
}

export function useSearchMarkets(queryStr: string, category: MarketCategory | null) {
  const enabled = queryStr.trim().length > 0 || category !== null;
  return useQuery({
    queryKey: ["markets", "search", queryStr, category],
    queryFn: () =>
      searchAndHydrate({
        q: queryStr.trim() || undefined,
        category: category ?? undefined,
        limit: 100,
      }),
    enabled,
    staleTime: STALE,
    select: (markets) => markets.map(toViewModel).filter((m): m is MarketViewModel => m !== null),
  });
}

/**
 * Fetch a single market by slug and merge with live Gamma data.
 * Returns MarketViewModel (transformed) or null.
 */
export function useMarket(identifier: string) {
  return useQuery({
    queryKey: ["market", identifier],
    queryFn: async (): Promise<ApiMarket | null> => {
      const gamma = await fetchGammaMarketBySlug(identifier);
      if (!gamma) return null;
      // Build a lean record from Gamma data (slug is the identifier)
      const lean: SearchMarket = {
        id: gamma.id,
        slug: gamma.slug,
        question: gamma.question,
        category: gamma.category ?? null,
        volume: parseFloat(gamma.volume) || 0,
        liquidity: parseFloat(gamma.liquidity) || 0,
        end_date: gamma.endDate,
        clob_token_ids: parseGammaArray(gamma.clobTokenIds),
        active: gamma.active,
      };
      return mergeMarket(lean, gamma);
    },
    staleTime: STALE,
    select: (api) => (api ? toViewModel(api) : null),
  });
}

/**
 * Same fetch as `useMarket` but returns the raw `ApiMarket` without
 * transforming to `MarketViewModel`. Use this when you need fields that
 * `toViewModel` discards (e.g. `clobTokenIds`, `conditionId`).
 */
export function useRawMarket(identifier: string) {
  return useQuery({
    queryKey: ["market", identifier],
    queryFn: async (): Promise<ApiMarket | null> => {
      const gamma = await fetchGammaMarketBySlug(identifier);
      if (!gamma) return null;
      const lean: SearchMarket = {
        id: gamma.id,
        slug: gamma.slug,
        question: gamma.question,
        category: gamma.category ?? null,
        volume: parseFloat(gamma.volume) || 0,
        liquidity: parseFloat(gamma.liquidity) || 0,
        end_date: gamma.endDate,
        clob_token_ids: parseGammaArray(gamma.clobTokenIds),
        active: gamma.active,
      };
      return mergeMarket(lean, gamma);
    },
    staleTime: STALE,
  });
}

export function thresholdSide(probability: number): Side {
  return probability >= 0.5 ? "YES" : "NO";
}
