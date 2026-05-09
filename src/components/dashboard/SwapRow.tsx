"use client";

import Link from "next/link";
import { Dial, Status, Tape, TokenLogo } from "@/components/primitives";
import { Icon } from "@/components/icons";
import { fmtNum, fmtPointsAway } from "@/lib/format";
import { useMarket, useMarketPriceHistory } from "@/hooks/useMarketsData";
import type { OrderViewModel } from "@/hooks/useOrders";

interface Props {
  order: OrderViewModel;
}

export function SwapRow({ order }: Props) {
  // Real Polymarket history for the side this order picked. React Query dedups
  // across rows that share the same market+token, so the per-row fetch is cheap.
  const { data: market } = useMarket(order.marketId ?? "");
  const sideTokenId =
    order.side === "NO" ? (market?.noTokenId ?? null) : (market?.yesTokenId ?? null);
  const { data: priceHistory = [] } = useMarketPriceHistory(sideTokenId, 60);
  const useRealHistory = priceHistory.length >= 2;
  const sparkData = useRealHistory ? priceHistory.map((p) => p.p) : order.spark;
  const sparkTimestamps = useRealHistory ? priceHistory.map((p) => p.t) : undefined;
  const currentOdds = sparkData[sparkData.length - 1] ?? 0;
  return (
    <Link
      href={`/dashboard/${order.id}`}
      className="group block border-b border-rule-soft bg-paper hover:bg-paper-2"
    >
      {/* Desktop: dense row */}
      <div className="hidden items-center gap-4 px-6 py-4 lg:grid lg:grid-cols-[60px_1fr_180px_220px_28px]">
        <Dial current={currentOdds} threshold={order.threshold} side={order.side} size={48} />
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <p className="truncate font-serif text-lg leading-tight">{order.nickname}</p>
            <Status kind={order.status} />
          </div>
          <p className="mt-1 truncate text-xs text-ink-3">
            Fires when {order.side} reaches {Math.round(order.threshold * 100)}%
            {order.status === "waiting" && ` · ${fmtPointsAway(currentOdds, order.threshold)} away`}
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <TokenLogo symbol={order.sellSymbol} logoURI={order.sellLogoURI} size={22} />
          <span className="num text-sm">
            {fmtNum(order.sellAmount, 2)} {order.sellSymbol}
          </span>
          <Icon.arrowRight size={12} className="text-ink-3" aria-hidden />
          <TokenLogo symbol={order.buySymbol} logoURI={order.buyLogoURI} size={22} />
        </div>
        <div className="overflow-hidden">
          <Tape
            data={sparkData}
            timestamps={sparkTimestamps}
            threshold={order.threshold}
            side={order.side}
            width={200}
            height={42}
            className="w-full"
            animate
          />
        </div>
        <span
          aria-hidden
          className="text-ink-3 transition-transform group-hover:translate-x-1 group-hover:text-ink"
        >
          <Icon.arrowRight size={16} />
        </span>
      </div>

      {/* Mobile: stacked card */}
      <div className="flex flex-col gap-3 px-4 py-4 sm:px-6 lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <Status kind={order.status} />
          <span className="num text-xs text-ink-3">
            {Math.round(currentOdds * 100)}% / {Math.round(order.threshold * 100)}%
          </span>
        </div>
        <div className="flex items-start gap-3">
          <Dial
            current={currentOdds}
            threshold={order.threshold}
            side={order.side}
            size={44}
            className="shrink-0"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate font-serif text-base leading-tight">{order.nickname}</p>
            <p className="mt-1 text-xs text-ink-3">
              {order.status === "waiting"
                ? `${fmtPointsAway(currentOdds, order.threshold)} away`
                : `Threshold ${Math.round(order.threshold * 100)}%`}
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="flex items-center gap-2">
            <TokenLogo symbol={order.sellSymbol} logoURI={order.sellLogoURI} size={20} />
            <span className="num">
              {fmtNum(order.sellAmount, 2)} {order.sellSymbol}
            </span>
            <Icon.arrowRight size={10} className="text-ink-3" aria-hidden />
            <TokenLogo symbol={order.buySymbol} logoURI={order.buyLogoURI} size={20} />
            <span className="font-mono">{order.buySymbol}</span>
          </span>
        </div>
        <div className="overflow-hidden">
          <Tape
            data={sparkData}
            timestamps={sparkTimestamps}
            threshold={order.threshold}
            side={order.side}
            width={300}
            height={36}
            className="w-full"
            animate
          />
        </div>
      </div>
    </Link>
  );
}
