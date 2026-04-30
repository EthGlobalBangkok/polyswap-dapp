"use client";

import { useQuery } from "@tanstack/react-query";
import { apiService, type ApiMarket } from "@/services/api";
import type { MarketCategory, MarketViewModel, Side } from "@/types/design";

const DESIGN_CATEGORIES: ReadonlyArray<MarketCategory> = [
  "Macro",
  "Politics",
  "Crypto",
  "Geopolitics",
];

/**
 * Polymarket's raw category strings → our four design categories.
 * "Airdrops" and crypto-native catalysts both fold into Crypto.
 * "Wars" / sanctions / energy fold into Geopolitics.
 * Macro (Fed, CPI, recession) is currently hand-flagged via these aliases —
 * if backend gains a dedicated tag, add it here.
 */
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
  // Crypto catalysts (price, ETF, halvings, airdrops, upgrades)
  crypto: "Crypto",
  cryptocurrency: "Crypto",
  cryptocurrencies: "Crypto",
  airdrops: "Crypto",
  airdrop: "Crypto",
  bitcoin: "Crypto",
  ethereum: "Crypto",
  // Geopolitics (wars, sanctions, ceasefires)
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

/**
 * Synthesise a 60-point probability sparkline anchored on the current odds.
 * Used until the backend exposes real price history for a market.
 */
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

const STALE = 60_000;

export function useTopMarkets() {
  return useQuery({
    queryKey: ["markets", "top"],
    queryFn: () => apiService.getTopMarkets(),
    staleTime: STALE,
    select: (markets) => markets.map(toViewModel).filter((m): m is MarketViewModel => m !== null),
  });
}

export function useSearchMarkets(query: string, category: MarketCategory | null) {
  const enabled = query.trim().length > 0 || category !== null;
  return useQuery({
    queryKey: ["markets", "search", query, category],
    queryFn: () =>
      apiService.searchMarkets({
        q: query,
        category: category ?? undefined,
        page: 1,
        limit: 100,
      }),
    enabled,
    staleTime: STALE,
    select: (res) => res.markets.map(toViewModel).filter((m): m is MarketViewModel => m !== null),
  });
}

export function useMarket(identifier: string) {
  return useQuery({
    queryKey: ["market", identifier],
    queryFn: async () => {
      const bySlug = await apiService.getMarketBySlug(identifier);
      if (bySlug) return bySlug;
      return apiService.getMarketById(identifier);
    },
    staleTime: STALE,
    select: (api) => toViewModel(api),
  });
}

export function thresholdSide(probability: number): Side {
  return probability >= 0.5 ? "YES" : "NO";
}
