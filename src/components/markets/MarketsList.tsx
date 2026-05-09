"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CategoryFilter, type CategoryFilterValue } from "./CategoryFilter";
import { SearchInputWithSuggestions } from "./SearchInputWithSuggestions";
import { MarketRow } from "./MarketRow";
import { MarketsSkeleton } from "./MarketsSkeleton";
import { Pagination } from "./Pagination";
import { MotionList, MotionItem } from "@/components/primitives";
import { useMarketsPage } from "@/hooks/useMarketsData";
import { type MarketCategory } from "@/types/design";

const PAGE_SIZE = 20;

export function MarketsList() {
  const router = useRouter();
  const [category, setCategory] = useState<CategoryFilterValue>("All");
  const [page, setPage] = useState(1);

  const searchCat: MarketCategory | null = category === "All" ? null : category;

  const { data, isLoading, isError } = useMarketsPage({
    page,
    pageSize: PAGE_SIZE,
    category: searchCat,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  const handleCategoryChange = (next: CategoryFilterValue) => {
    setCategory(next);
    setPage(1);
  };

  const handleSearchSubmit = (q: string) => {
    const trimmed = q.trim();
    if (trimmed.length > 0) {
      router.push(`/markets/search?q=${encodeURIComponent(trimmed)}`);
    }
  };

  const listKey = `${category}-${page}`;

  return (
    <div>
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
            <SearchInputWithSuggestions
              value=""
              onSubmit={handleSearchSubmit}
              placeholder="Search questions, tags, slugs"
              className="w-full"
            />
          </div>
        </div>
      </div>

      <CategoryFilter value={category} onChange={handleCategoryChange} />

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
            Try a wider net — pick a different category above, or use search.
          </p>
        </div>
      )}
      {!isLoading && !isError && items.length > 0 && (
        <>
          <MotionList key={listKey} className="-mx-4 sm:mx-0">
            {items.map((m) => (
              <MotionItem key={m.id}>
                <MarketRow market={m} displayCategory={searchCat ?? undefined} />
              </MotionItem>
            ))}
          </MotionList>
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} />
        </>
      )}
    </div>
  );
}
