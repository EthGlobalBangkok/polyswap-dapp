"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, DetailSkeleton } from "@/components/primitives";
import { Icon } from "@/components/icons";
import { useMarket } from "@/hooks/useMarketsData";
import { useCreateOrder } from "@/hooks/useCreateOrder";
import { MarketSummaryCard } from "./MarketSummaryCard";
import { CreateForm } from "./CreateForm";
import { RecapPanel } from "./RecapPanel";
import { SignModal } from "@/components/modals/SignModal";
import { useWalletConnection } from "@/hooks/useWalletConnection";
import { useWalletModal } from "@/components/modals/WalletModalProvider";
import { fmtUSD } from "@/lib/format";

interface Props {
  marketId: string;
}

export function CreatePage({ marketId }: Props) {
  const { data: market, isLoading, isError } = useMarket(marketId);
  const { state, derived, set } = useCreateOrder();
  const [signOpen, setSignOpen] = useState(false);
  const { isConnected } = useWalletConnection();
  const wallet = useWalletModal();

  if (isLoading) {
    return <DetailSkeleton />;
  }

  if (isError || !market) {
    return (
      <div className="py-16 text-center text-sm text-ink-3">
        We couldn&apos;t find that market.{" "}
        <Link href="/markets" className="underline">
          Back to markets
        </Link>
        .
      </div>
    );
  }

  const handleReview = () => {
    if (!isConnected) {
      wallet.open();
      return;
    }
    setSignOpen(true);
  };

  return (
    <div className="pb-32 lg:pb-16">
      {/* Header */}
      <div className="border-b border-ink py-6 lg:py-8">
        <Link
          href={`/markets/${market.id}`}
          className="inline-flex items-center gap-1.5 text-xs text-ink-3 hover:text-ink"
        >
          <Icon.arrowLeft size={12} aria-hidden /> Back to market
        </Link>
        <h1 className="mt-3 font-serif text-3xl leading-[1.1] sm:text-4xl lg:text-[44px]">
          Set up a <span className="italic">swap</span>.
        </h1>
        <p className="mt-2 max-w-xl text-sm text-ink-3 lg:text-base">
          Pick when, pick what. We&rsquo;ll watch the odds for you.
        </p>
      </div>

      <div className="grid gap-6 py-6 lg:grid-cols-12 lg:gap-10 lg:py-10">
        <div className="space-y-5 lg:col-span-7 lg:space-y-6">
          <MarketSummaryCard market={market} />
          <CreateForm market={market} state={state} derived={derived} set={set} />
          {/* Desktop CTA */}
          <div className="hidden lg:block">
            <Button variant="accent" size="lg" disabled={!derived.isValid} onClick={handleReview}>
              Review and sign
              <Icon.arrowRight size={14} aria-hidden />
            </Button>
          </div>
        </div>

        <aside className="lg:col-span-5">
          <div className="lg:sticky lg:top-6">
            <RecapPanel market={market} state={state} derived={derived} />
          </div>
        </aside>
      </div>

      {/* Mobile sticky action bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-ink bg-paper px-4 py-3 shadow-[0_-2px_0_0_var(--color-rule-soft)] lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[11px] text-ink-3">Total in</p>
            <p className="num truncate text-base font-semibold">
              {derived.amountInUsd > 0 ? fmtUSD(derived.amountInUsd) : "—"}
            </p>
          </div>
          <Button
            variant="accent"
            size="md"
            disabled={!derived.isValid}
            onClick={handleReview}
            className="shrink-0"
          >
            Review &amp; sign
            <Icon.arrowRight size={14} aria-hidden />
          </Button>
        </div>
      </div>

      <SignModal
        open={signOpen}
        onClose={() => setSignOpen(false)}
        market={market}
        state={state}
        derived={derived}
      />
    </div>
  );
}
