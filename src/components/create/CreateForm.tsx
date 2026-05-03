"use client";

import { Tape } from "@/components/primitives";
import { fmtUSD } from "@/lib/format";
import { SideToggle } from "./SideToggle";
import { ThresholdSlider } from "./ThresholdSlider";
import { TokenPicker } from "./TokenPicker";
import { AdvancedOptions } from "./AdvancedOptions";
import { SWAP_TOKENS, type CreateFormDerived, type CreateFormState } from "@/hooks/useCreateOrder";
import { useMarketPriceHistory } from "@/hooks/useMarketsData";
import type { MarketViewModel } from "@/types/design";

interface Props {
  market: MarketViewModel;
  state: CreateFormState;
  derived: CreateFormDerived;
  set: <K extends keyof CreateFormState>(key: K, value: CreateFormState[K]) => void;
}

export function CreateForm({ market, state, derived, set }: Props) {
  const tokens = [...SWAP_TOKENS];
  const { data: history = [] } = useMarketPriceHistory(market.yesTokenId, 60);
  const sparkData = history.map((h) => h.p);
  const distancePts = (state.threshold - market.yesProbability) * 100;
  const wouldFireNow =
    state.side === "YES"
      ? market.yesProbability >= state.threshold
      : market.yesProbability <= state.threshold;

  return (
    <div className="flex flex-col gap-5 lg:gap-6">
      {/* 02 — When */}
      <section className="border border-ink bg-paper p-4 sm:p-6">
        <p className="eyebrow mb-4">02 · When should it fire</p>
        <div className="flex flex-col gap-5 lg:gap-6">
          <SideToggle value={state.side} onChange={(v) => set("side", v)} />
          <ThresholdSlider value={state.threshold} onChange={(v) => set("threshold", v)} />
          <div className="overflow-hidden border border-rule-soft bg-paper-2 p-3">
            <Tape
              data={sparkData}
              threshold={state.threshold}
              side={state.side}
              width={520}
              height={80}
              className="w-full"
            />
            <p className="mt-2 text-xs text-ink-3">
              {wouldFireNow
                ? "It would already be triggered now."
                : `It's ${Math.abs(distancePts).toFixed(1)} points away. We'll wait for it.`}
            </p>
          </div>
        </div>
      </section>

      {/* 03 — What */}
      <section className="border border-ink bg-paper p-4 sm:p-6">
        <p className="eyebrow mb-4">03 · What should we swap</p>
        <div className="grid gap-4 sm:grid-cols-2 sm:gap-5">
          <div>
            <p className="mb-2 text-xs text-ink-3">You send</p>
            <TokenPicker
              value={state.fromToken}
              options={tokens}
              onChange={(t) => set("fromToken", t)}
            />
            <label className="mt-3 block">
              <span className="sr-only">Amount</span>
              <input
                inputMode="decimal"
                type="text"
                value={state.amountIn}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^0-9.]/g, "");
                  set("amountIn", v);
                }}
                placeholder="0.00"
                className="w-full border border-ink bg-paper-2 px-3 py-3 text-2xl font-mono tabular-nums outline-none focus:bg-paper sm:text-3xl"
              />
            </label>
            {derived.amountInUsd > 0 && (
              <p className="num mt-1 text-xs text-ink-3">≈ {fmtUSD(derived.amountInUsd)}</p>
            )}
          </div>

          <div>
            <p className="mb-2 text-xs text-ink-3">You receive (estimate)</p>
            <TokenPicker
              value={state.toToken}
              options={tokens}
              onChange={(t) => set("toToken", t)}
            />
            <div className="mt-3 border border-ink bg-paper-2 px-3 py-3 text-2xl font-mono tabular-nums sm:text-3xl">
              {derived.amountOutEstimate > 0 ? derived.amountOutEstimate.toFixed(4) : "0.00"}
            </div>
            {derived.amountOutUsd > 0 && (
              <p className="num mt-1 text-xs text-ink-3">≈ {fmtUSD(derived.amountOutUsd)}</p>
            )}
          </div>
        </div>
        {derived.validationMessage && (
          <p className="mt-4 border border-no bg-no/10 px-3 py-2 text-xs text-no">
            {derived.validationMessage}
          </p>
        )}
      </section>

      <AdvancedOptions state={state} onChange={(k, v) => set(k, v)} />
    </div>
  );
}
