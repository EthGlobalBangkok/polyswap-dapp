"use client";

import { useQuery } from "@tanstack/react-query";
import {
  fetchClobPrices,
  type ClobPriceRequest,
  type ClobPricesResponse,
} from "@/services/polymarket";
import { apiService } from "@/services/api";
import {
  CRYPTO_RELEVANT_CATEGORIES,
  MARKET_CATEGORIES,
  type MarketCategory,
  type MarketViewModel,
  type Side,
} from "@/types/design";

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

interface SearchMarket {
  id: string;
  slug: string;
  question: string;
  description: string | null;
  category: string | null;
  tags: string[];
  outcomes: string[];
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

const CANONICAL_BY_LOWER: ReadonlyMap<string, MarketCategory> = new Map(
  MARKET_CATEGORIES.map((c) => [c.toLowerCase(), c])
);

export function normalizeCategory(raw: string): MarketCategory | null {
  return CANONICAL_BY_LOWER.get(raw.trim().toLowerCase()) ?? null;
}

export function isDesignCategory(c: string): c is MarketCategory {
  return CANONICAL_BY_LOWER.has(c.toLowerCase());
}

function syntheticSpark(seed: string, current: number): number[] {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  const rand = () => {
    hash = (hash * 9301 + 49297) | 0;
    return ((hash % 1000) + 1000) / 1000 - 1.5;
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

function midpointPercent(prices: ClobPricesResponse, tokenId: string | undefined): number {
  if (!tokenId) return 0;
  const sides = prices[tokenId];
  if (!sides) return 0;
  const buy = Number(sides.BUY);
  const sell = Number(sides.SELL);
  if (!Number.isFinite(buy) || !Number.isFinite(sell)) return 0;
  return Number((((buy + sell) / 2) * 100).toFixed(2));
}

function mergeMarket(lean: SearchMarket, prices: ClobPricesResponse): ApiMarket {
  const outcomes = lean.outcomes;
  const clobTokenIds = lean.clob_token_ids;
  const endDate = lean.end_date ?? "";
  const category = lean.category ?? "";
  const description = lean.description ?? undefined;

  const isTraditionalBinary =
    outcomes.length === 2 && outcomes.includes("Yes") && outcomes.includes("No");

  if (isTraditionalBinary) {
    const yesIdx = outcomes.indexOf("Yes");
    const noIdx = outcomes.indexOf("No");
    return {
      id: lean.id,
      title: lean.question,
      volume: lean.volume,
      endDate,
      category,
      type: "binary",
      yesOdds: midpointPercent(prices, clobTokenIds[yesIdx]),
      noOdds: midpointPercent(prices, clobTokenIds[noIdx]),
      slug: lean.slug,
      clobTokenIds,
      description,
    };
  }

  if (outcomes.length === 2) {
    return {
      id: lean.id,
      title: lean.question,
      volume: lean.volume,
      endDate,
      category,
      type: "binary",
      yesOdds: midpointPercent(prices, clobTokenIds[0]),
      noOdds: midpointPercent(prices, clobTokenIds[1]),
      slug: lean.slug,
      clobTokenIds,
      description,
    };
  }

  const options: MarketOption[] = outcomes.map((label, i) => ({
    text: label,
    odds: midpointPercent(prices, clobTokenIds[i]),
  }));
  return {
    id: lean.id,
    title: lean.question,
    volume: lean.volume,
    endDate,
    category,
    type: "multi-choice",
    options,
    slug: lean.slug,
    clobTokenIds,
    description,
  };
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

function tokenPriceRequests(markets: SearchMarket[]): ClobPriceRequest[] {
  const requests: ClobPriceRequest[] = [];
  for (const m of markets) {
    for (const tokenId of m.clob_token_ids) {
      requests.push({ token_id: tokenId, side: "BUY" });
      requests.push({ token_id: tokenId, side: "SELL" });
    }
  }
  return requests;
}

async function searchAndHydrate(params: {
  sort?: string;
  limit?: number;
  q?: string;
  category?: string;
  categories?: ReadonlyArray<string>;
}): Promise<ApiMarket[]> {
  const url = new URL("/api/markets/search", window.location.origin);
  if (params.sort) url.searchParams.set("sort", params.sort);
  if (params.limit !== undefined) url.searchParams.set("limit", String(params.limit));
  if (params.q) url.searchParams.set("q", params.q);
  if (params.category) url.searchParams.set("category", params.category);
  if (params.categories && params.categories.length > 0) {
    url.searchParams.set("categories", params.categories.join(","));
  }

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`markets/search failed: ${res.status}`);
  const json = (await res.json()) as SearchResponse;

  if (!json.success) throw new Error("markets/search returned success=false");

  const leanMarkets = json.data.markets;
  if (leanMarkets.length === 0) return [];

  const prices = await fetchClobPrices(tokenPriceRequests(leanMarkets));

  return leanMarkets.map((lean) => mergeMarket(lean, prices));
}

async function fetchSingleMarket(slug: string): Promise<ApiMarket | null> {
  const lean = await apiService.getMarketBySlug(slug);
  if (!lean) return null;
  const endDate =
    lean.end_date instanceof Date
      ? lean.end_date.toISOString()
      : (lean.end_date as unknown as string | null);
  const search: SearchMarket = {
    id: lean.id,
    slug: lean.slug,
    question: lean.question,
    description: lean.description,
    category: lean.category,
    tags: lean.tags,
    outcomes: lean.outcomes,
    volume: lean.volume,
    liquidity: lean.liquidity,
    end_date: endDate,
    clob_token_ids: lean.clob_token_ids,
    active: lean.active,
  };
  const prices = await fetchClobPrices(tokenPriceRequests([search]));
  return mergeMarket(search, prices);
}

export function useTopMarkets() {
  return useQuery({
    queryKey: ["markets", "top", CRYPTO_RELEVANT_CATEGORIES.join(",")],
    queryFn: () =>
      searchAndHydrate({
        sort: "interest",
        limit: 100,
        categories: CRYPTO_RELEVANT_CATEGORIES,
      }),
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
        sort: "interest",
        limit: 100,
      }),
    enabled,
    staleTime: STALE,
    select: (markets) => markets.map(toViewModel).filter((m): m is MarketViewModel => m !== null),
  });
}

export function useMarket(identifier: string) {
  return useQuery({
    queryKey: ["market", identifier],
    queryFn: () => fetchSingleMarket(identifier),
    staleTime: STALE,
    select: (api) => (api ? toViewModel(api) : null),
  });
}

export function useRawMarket(identifier: string) {
  return useQuery({
    queryKey: ["market", identifier],
    queryFn: () => fetchSingleMarket(identifier),
    staleTime: STALE,
  });
}

export function thresholdSide(probability: number): Side {
  return probability >= 0.5 ? "YES" : "NO";
}
