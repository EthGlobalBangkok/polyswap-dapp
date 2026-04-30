"use client";

import { CategoryIcon } from "@/components/icons";
import { cn } from "@/lib/cn";
import type { MarketCategory } from "@/types/design";

export type CategoryFilterValue = MarketCategory | "All";

const ENTRIES: ReadonlyArray<CategoryFilterValue> = [
  "All",
  "Macro",
  "Politics",
  "Crypto",
  "Geopolitics",
];

interface Props {
  value: CategoryFilterValue;
  onChange: (next: CategoryFilterValue) => void;
  counts?: Partial<Record<CategoryFilterValue, number>>;
}

export function CategoryFilter({ value, onChange, counts }: Props) {
  return (
    <div className="-mx-4 grid grid-cols-3 border-b border-ink sm:mx-0 sm:grid-cols-5">
      {ENTRIES.map((cat, i) => {
        const active = value === cat;
        const count = counts?.[cat];
        const isLastInRow = (i + 1) % 5 === 0;
        return (
          <button
            key={cat}
            type="button"
            onClick={() => onChange(cat)}
            className={cn(
              "flex items-center justify-center gap-2 px-2 py-3 text-sm transition-colors sm:gap-3 sm:py-4 lg:py-5",
              !isLastInRow && "border-r border-ink",
              "[&:nth-child(3n)]:sm:border-r [&:nth-child(3n)]:border-r-0",
              active ? "bg-ink text-paper" : "bg-paper text-ink hover:bg-paper-2"
            )}
            aria-pressed={active}
          >
            {cat !== "All" && <CategoryIcon category={cat} size={16} />}
            <span className="font-serif text-base lg:text-xl">{cat}</span>
            {typeof count === "number" && (
              <span className="num text-[11px] opacity-60">{count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
