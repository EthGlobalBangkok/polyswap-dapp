"use client";

import { useMemo, useState } from "react";
import { CategoryFilter, type CategoryFilterValue } from "./CategoryFilter";
import { SearchInput } from "./SearchInput";
import { MarketRow } from "./MarketRow";
import { MarketsSkeleton } from "./MarketsSkeleton";
import { MotionList, MotionItem } from "@/components/primitives";
import { useSearchMarkets, useTopMarkets } from "@/hooks/useMarketsData";
import {
  CRYPTO_RELEVANT_CATEGORIES,
  type MarketCategory,
  type MarketViewModel,
} from "@/types/design";

function applyFilter(
  list: MarketViewModel[],
  category: CategoryFilterValue,
  query: string
): MarketViewModel[] {
  const q = query.trim().toLowerCase();
  return list.filter((m) => {
    if (category !== "All" && m.category !== category) return false;
    if (q && !m.question.toLowerCase().includes(q)) return false;
    return true;
  });
}

function countsBy(list: MarketViewModel[]): Record<CategoryFilterValue, number> {
  const out = { All: list.length } as Record<CategoryFilterValue, number>;
  for (const cat of CRYPTO_RELEVANT_CATEGORIES) out[cat] = 0;
  for (const m of list) {
    if (m.category in out) out[m.category]++;
  }
  return out;
}

export function MarketsList() {
  const [category, setCategory] = useState<CategoryFilterValue>("All");
  const [query, setQuery] = useState("");

  const top = useTopMarkets();
  const searchCat: MarketCategory | null = category === "All" ? null : category;
  const search = useSearchMarkets(query, searchCat);

  const useSearchResults = query.trim().length > 0 || category !== "All";
  const sourceData = useSearchResults ? search.data : top.data;
  const isLoading = useSearchResults ? search.isLoading : top.isLoading;
  const isError = useSearchResults ? search.isError : top.isError;

  const items = useMemo<MarketViewModel[]>(
    () => applyFilter(sourceData ?? [], category, query),
    [sourceData, category, query]
  );

  const counts = useMemo(() => countsBy(top.data ?? []), [top.data]);

  // Re-key the list on category/query changes so the stagger replays.
  const listKey = `${category}-${query.trim().toLowerCase()}`;

  return (
    <div>
      {/* Masthead block */}
      <div className="border-b border-ink">
        <div className="grid items-end gap-6 py-10 lg:grid-cols-12 lg:gap-10 lg:py-14">
          <div className="lg:col-span-7">
            <p className="eyebrow mb-3">Markets · prioritized for crypto impact</p>
            <h1 className="display text-4xl leading-[0.95] sm:text-5xl lg:text-[64px]">
              The <span className="display-italic">paper</span>
              <br />
              of record.
            </h1>
          </div>
          <div className="lg:col-span-5">
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder="Search questions"
              className="w-full"
            />
          </div>
        </div>
      </div>

      <CategoryFilter value={category} onChange={setCategory} counts={counts} />

      {isLoading && <MarketsSkeleton />}
      {isError && (
        <p className="px-4 py-12 text-center text-sm text-ink-3 sm:px-6">
          Couldn&apos;t load markets. Try again in a moment.
        </p>
      )}
      {!isLoading && !isError && items.length === 0 && (
        <div className="border-b border-rule-soft px-6 py-16 text-center sm:px-8 lg:py-20">
          <p className="font-serif text-xl text-ink sm:text-2xl">Nothing fits that brief.</p>
          <p className="mt-2 text-sm text-ink-3">
            Try a wider net — clear the search, or pick a different category above.
          </p>
        </div>
      )}
      {!isLoading && !isError && items.length > 0 && (
        <MotionList key={listKey} className="-mx-4 sm:mx-0">
          {items.map((m) => (
            <MotionItem key={m.id}>
              <MarketRow market={m} />
            </MotionItem>
          ))}
        </MotionList>
      )}
    </div>
  );
}
