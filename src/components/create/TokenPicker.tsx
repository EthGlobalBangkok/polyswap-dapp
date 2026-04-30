"use client";

import { useEffect, useRef, useState } from "react";
import { TokenGlyph } from "@/components/primitives";
import { Icon } from "@/components/icons";
import { cn } from "@/lib/cn";
import type { TokenViewModel } from "@/types/design";

interface Props {
  value: TokenViewModel;
  options: TokenViewModel[];
  onChange: (next: TokenViewModel) => void;
  disabled?: boolean;
}

export function TokenPicker({ value, options, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex w-full items-center justify-between gap-3 border border-ink bg-paper-2 px-3 py-2.5 text-left",
          "hover:bg-paper-3 disabled:cursor-not-allowed disabled:opacity-60"
        )}
      >
        <span className="flex items-center gap-2.5">
          <TokenGlyph symbol={value.symbol} size={28} />
          <span>
            <span className="block font-mono text-sm font-medium">{value.symbol}</span>
            <span className="block text-[11px] text-ink-3">{value.name}</span>
          </span>
        </span>
        <Icon.chevronDown size={14} aria-hidden />
      </button>

      {open && (
        <ul className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-y-auto border border-ink bg-paper shadow-[4px_4px_0_0_var(--color-ink)]">
          {options.map((t) => (
            <li key={t.symbol}>
              <button
                type="button"
                onClick={() => {
                  onChange(t);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm",
                  "hover:bg-paper-2",
                  t.symbol === value.symbol && "bg-paper-2"
                )}
              >
                <span className="flex items-center gap-2.5">
                  <TokenGlyph symbol={t.symbol} size={24} />
                  <span>
                    <span className="block font-mono font-medium">{t.symbol}</span>
                    <span className="block text-[11px] text-ink-3">{t.name}</span>
                  </span>
                </span>
                <span className="num text-xs text-ink-3">${t.priceUsd.toLocaleString()}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
