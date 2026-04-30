"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { cn } from "@/lib/cn";

interface Props {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  className?: string;
  /** Debounce in ms; defaults to 200. */
  debounceMs?: number;
}

export function SearchInput({
  value,
  onChange,
  placeholder = "Search questions",
  className,
  debounceMs = 200,
}: Props) {
  const [local, setLocal] = useState(value);

  useEffect(() => {
    setLocal(value);
  }, [value]);

  useEffect(() => {
    if (local === value) return;
    const t = setTimeout(() => onChange(local), debounceMs);
    return () => clearTimeout(t);
  }, [local, value, onChange, debounceMs]);

  return (
    <label
      className={cn(
        "flex items-center border border-ink bg-paper-2",
        "focus-within:outline focus-within:outline-2 focus-within:outline-ink",
        className
      )}
    >
      <span className="pl-3 text-ink-3">
        <Icon.search size={18} aria-hidden />
      </span>
      <input
        type="search"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-transparent px-3 py-3 text-base outline-none placeholder:text-ink-3 [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none"
        aria-label="Search markets"
      />
      {local.length > 0 && (
        <button
          type="button"
          onClick={() => {
            setLocal("");
            onChange("");
          }}
          className="px-3 text-ink-3 hover:text-ink"
          aria-label="Clear search"
        >
          <Icon.x size={14} />
        </button>
      )}
    </label>
  );
}
