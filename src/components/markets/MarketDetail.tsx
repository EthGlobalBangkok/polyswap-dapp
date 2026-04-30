"use client";

import Link from "next/link";
import { useMarket } from "@/hooks/useMarketsData";
import { Button, Tag, Tape, Dial } from "@/components/primitives";
import { CategoryIcon, Icon } from "@/components/icons";
import { fmtUSD, fmtDate } from "@/lib/format";

interface Props {
  identifier: string;
}

export function MarketDetail({ identifier }: Props) {
  const { data, isLoading, isError } = useMarket(identifier);

  if (isLoading) {
    return <div className="py-16 text-center text-sm text-ink-3">Loading market…</div>;
  }
  if (isError || !data) {
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

  const yesPct = Math.round(data.yesProbability * 100);

  return (
    <div className="pb-24">
      <div className="border-b border-ink py-6 lg:py-8">
        <Link
          href="/markets"
          className="inline-flex items-center gap-1.5 text-xs text-ink-3 hover:text-ink"
        >
          <Icon.arrowLeft size={12} aria-hidden /> Back to markets
        </Link>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Tag tone="ink">
            <CategoryIcon category={data.category} size={12} />
            {data.category}
          </Tag>
          <span className="text-xs text-ink-3">Ends {fmtDate(data.endsAt)}</span>
        </div>
        <h1
          className="mt-4 max-w-[820px] font-serif text-3xl leading-[1.1] sm:text-4xl lg:mt-5 lg:text-[44px]"
          style={{ viewTransitionName: `market-title-${data.id}` }}
        >
          {data.question}
        </h1>
      </div>

      <div className="grid gap-10 py-8 lg:grid-cols-12 lg:py-12">
        <div className="space-y-8 lg:col-span-8">
          {/* Stat strip */}
          <div className="grid grid-cols-3 border border-ink">
            <Stat label="Current YES odds" value={`${yesPct}%`} accent />
            <Stat label="24h volume" value={fmtUSD(data.volume24h, { compact: true })} />
            <Stat label="Resolves" value={fmtDate(data.endsAt)} />
          </div>

          {/* Chart */}
          <section>
            <p className="eyebrow mb-3">Probability of YES · last 60 days</p>
            <div className="overflow-hidden border border-ink bg-paper p-4 lg:p-6">
              <Tape
                data={data.spark}
                threshold={0.7}
                side="YES"
                width={760}
                height={220}
                className="w-full"
                animate
              />
              <div className="mt-3 flex items-center justify-between text-xs text-ink-3">
                <span>0%</span>
                <span className="text-accent">— — Sample trigger 70%</span>
                <span>100%</span>
              </div>
            </div>
          </section>

          {/* Resolution rules */}
          <section>
            <p className="eyebrow mb-3">How it resolves</p>
            <p className="max-w-[640px] font-serif text-base leading-relaxed text-ink-2 lg:text-lg">
              This market resolves on Polymarket. Polyswap reads the same odds you see there. If you
              set a swap and the YES odds cross your threshold before {fmtDate(data.endsAt)}, your
              swap fires. Otherwise it expires and your tokens stay where they are.
            </p>
          </section>
        </div>

        {/* Right rail / sticky CTA */}
        <aside className="lg:col-span-4">
          <div className="lg:sticky lg:top-6 lg:space-y-6">
            <div className="border border-ink bg-paper-2 p-6">
              <div className="flex items-center gap-4">
                <Dial current={data.yesProbability} threshold={0.7} side="YES" size={64} animate />
                <div>
                  <p className="num text-2xl font-semibold">{yesPct}%</p>
                  <p className="text-xs text-ink-3">YES today</p>
                </div>
              </div>
              <p className="mt-4 font-serif text-lg leading-snug">
                Set a swap that fires only when this question crosses your line.
              </p>
              <Link href={`/create/${data.id}`} className="mt-5 inline-flex">
                <Button variant="accent" size="lg">
                  Set up a swap
                  <Icon.arrowRight size={14} aria-hidden />
                </Button>
              </Link>
            </div>

            <ul className="space-y-3 border border-ink bg-paper p-6 text-sm">
              <li className="flex items-start gap-3">
                <Icon.lock size={16} className="mt-0.5 text-accent" aria-hidden />
                Funds stay in your wallet until the trigger fires.
              </li>
              <li className="flex items-start gap-3">
                <Icon.shield size={16} className="mt-0.5 text-accent" aria-hidden />
                Cancel any time. No fee, no penalty.
              </li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="border-r border-ink p-4 last:border-r-0 lg:p-5">
      <p className="eyebrow">{label}</p>
      <p
        className={
          "num mt-1 text-xl font-semibold lg:text-2xl " + (accent ? "text-yes" : "text-ink")
        }
      >
        {value}
      </p>
    </div>
  );
}
