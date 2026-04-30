"use client";

import Link from "next/link";
import { Button, Dial, Status, Tape, TokenGlyph } from "@/components/primitives";
import { Icon } from "@/components/icons";
import { fmtDate, fmtNum, fmtPointsAway } from "@/lib/format";
import { useOrder } from "@/hooks/useOrders";
import { Timeline } from "./Timeline";

interface Props {
  orderId: string;
}

export function SwapDetailPage({ orderId }: Props) {
  const { order, isLoading, isError, walletConnected } = useOrder(orderId);

  if (!walletConnected) {
    return (
      <div className="py-16 text-center text-sm text-ink-3">
        Connect your wallet to view this swap.
      </div>
    );
  }

  if (isLoading) {
    return <p className="py-16 text-center text-sm text-ink-3">Loading swap…</p>;
  }

  if (isError || !order) {
    return (
      <div className="py-16 text-center text-sm text-ink-3">
        We couldn&apos;t find that swap.{" "}
        <Link href="/dashboard" className="underline">
          Back to my swaps
        </Link>
        .
      </div>
    );
  }

  const currentOdds = order.spark[order.spark.length - 1] ?? 0;
  const triggered =
    order.status === "ready" || order.status === "done" ? true : currentOdds >= order.threshold;
  const distanceLabel = triggered
    ? "Ready"
    : `${fmtPointsAway(currentOdds, order.threshold)} until trigger`;

  const high = Math.max(...order.spark);
  const low = Math.min(...order.spark);

  return (
    <div className="space-y-8 py-8 lg:py-10">
      <div className="border-b border-ink pb-6 lg:pb-8">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-xs text-ink-3 hover:text-ink"
        >
          <Icon.arrowLeft size={12} aria-hidden /> Back to my swaps
        </Link>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <h1 className="font-serif text-2xl leading-tight sm:text-3xl lg:text-[40px]">
                {order.nickname}
              </h1>
              <Status kind={order.status} />
            </div>
            <p className="mt-2 text-xs text-ink-3 sm:text-sm">
              Fires when YES reaches {Math.round(order.threshold * 100)}% · expires{" "}
              {fmtDate(order.endTime)}
            </p>
          </div>
          {order.status === "waiting" && (
            <Button variant="ghost" size="sm" disabled>
              <Icon.trash size={14} aria-hidden /> Cancel swap
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-12 lg:gap-10">
        <div className="space-y-8 lg:col-span-8">
          {/* Tracker */}
          <section aria-label="Tracker" className="border border-ink bg-paper p-4 sm:p-6">
            <div className="flex flex-wrap items-center gap-5">
              <Dial
                current={currentOdds}
                threshold={order.threshold}
                side="YES"
                size={88}
                animate
              />
              <div className="min-w-0 flex-1">
                <p className="num text-3xl font-semibold lg:text-4xl">
                  {Math.round(currentOdds * 100)}%
                </p>
                <p className="text-sm text-ink-3">
                  Today · trigger at {Math.round(order.threshold * 100)}%
                </p>
              </div>
              <p className="num shrink-0 border border-ink bg-paper-2 px-3 py-2 text-sm">
                {distanceLabel}
              </p>
            </div>

            <div className="mt-5 overflow-hidden border border-rule-soft bg-paper-2 p-3">
              <Tape
                data={order.spark}
                threshold={order.threshold}
                side="YES"
                width={760}
                height={200}
                className="w-full"
                animate
              />
            </div>

            <div className="mt-5 grid grid-cols-3 border border-ink">
              <Stat label="High" value={`${Math.round(high * 100)}%`} />
              <Stat label="Low" value={`${Math.round(low * 100)}%`} />
              <Stat
                label="Time waiting"
                value={`${Math.max(0, Math.floor((Date.now() - order.startTime.getTime()) / 86_400_000))}d`}
              />
            </div>
          </section>

          {/* Timeline */}
          <section aria-label="Timeline">
            <p className="eyebrow mb-4">What&rsquo;s happened</p>
            <div className="border border-ink bg-paper p-5 lg:p-6">
              <Timeline order={order} />
            </div>
          </section>
        </div>

        <aside className="lg:col-span-4">
          <div className="lg:sticky lg:top-6 lg:space-y-5">
            <section aria-label="The deal" className="border border-ink bg-paper-2 p-5">
              <p className="eyebrow mb-3">The deal</p>
              <div className="flex items-center gap-3">
                <TokenGlyph symbol={order.sellSymbol} size={28} />
                <p className="num text-lg">
                  {fmtNum(order.sellAmount, 2)} {order.sellSymbol}
                </p>
                <Icon.arrowRight size={14} className="text-ink-3" aria-hidden />
                <TokenGlyph symbol={order.buySymbol} size={28} />
                <p className="num text-lg">
                  ≥ {fmtNum(order.minBuyAmount, 4)} {order.buySymbol}
                </p>
              </div>
              <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 border-t border-rule-soft pt-3 text-xs">
                <Row k="Trigger" v={`YES ≥ ${Math.round(order.threshold * 100)}%`} />
                <Row k="Created" v={fmtDate(order.startTime)} />
                <Row k="Expires" v={fmtDate(order.endTime)} />
              </dl>
            </section>

            <section
              aria-label="Trust"
              className="space-y-2 border border-ink bg-paper p-5 text-sm"
            >
              <p className="flex items-start gap-3">
                <Icon.lock size={14} className="mt-0.5 text-accent" aria-hidden />
                Money stays in your wallet until the trigger fires.
              </p>
              <p className="flex items-start gap-3">
                <Icon.shield size={14} className="mt-0.5 text-accent" aria-hidden />
                Cancel any time. No fee on cancel or expiry.
              </p>
            </section>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-r border-ink p-3 text-center last:border-r-0 sm:p-4">
      <p className="eyebrow">{label}</p>
      <p className="num mt-1 text-base font-semibold sm:text-lg">{value}</p>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt className="text-ink-3">{k}</dt>
      <dd className="text-right font-mono tabular-nums">{v}</dd>
    </>
  );
}
