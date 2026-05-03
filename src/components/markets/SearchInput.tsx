"use client";

import { useEffect, useState, type KeyboardEvent } from "react";
import { Icon } from "@/components/icons";
import { cn } from "@/lib/cn";

interface Props {
  value: string;
  /** Fires on Enter or when the clear (×) button is pressed. */
  onSubmit: (next: string) => void;
  placeholder?: string;
  className?: string;
}

export function SearchInput({
  value,
  onSubmit,
  placeholder = "Search questions",
  className,
}: Props) {
  const [local, setLocal] = useState(value);

  useEffect(() => {
    setLocal(value);
  }, [value]);

  const submit = (next: string) => {
    if (next === value) return;
    onSubmit(next);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submit(local.trim());
    }
  };

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
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="w-full bg-transparent px-3 py-3 text-base outline-none placeholder:text-ink-3 [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none"
        aria-label="Search markets"
      />
      {local.length > 0 && (
        <button
          type="button"
          onClick={() => {
            setLocal("");
            submit("");
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
