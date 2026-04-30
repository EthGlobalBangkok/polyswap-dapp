"use client";

import { CountUp, Stamp } from "@/components/primitives";
import { fmtUSD } from "@/lib/format";
import type { OrderViewModel } from "@/hooks/useOrders";

interface Props {
  orders: OrderViewModel[];
}

interface BaseMetric {
  label: string;
  caption: string;
  /** Optional badge overlay (e.g. accent stamp) shown only when truly earned. */
  badge?: React.ReactNode;
}

interface NumericMetric extends BaseMetric {
  kind: "number";
  raw: number;
  format: (n: number) => string;
}

interface TextMetric extends BaseMetric {
  kind: "text";
  value: string;
  breathe?: boolean;
}

type Metric = NumericMetric | TextMetric;

function compute(orders: OrderViewModel[]): Metric[] {
  const waiting = orders.filter((o) => o.status === "waiting");
  const ready = orders.filter((o) => o.status === "ready");
  const filled = orders.filter((o) => o.status === "done");
  const cancelled = orders.filter((o) => o.status === "cancelled");

  const moneyWaiting = waiting.reduce((sum, o) => sum + o.sellAmount, 0);
  const armed = waiting.length + ready.length;
  const next = waiting[0] ?? null;
  const finishedTotal = filled.length + cancelled.length;
  const hitRate = finishedTotal > 0 ? filled.length / finishedTotal : null;

  return [
    {
      kind: "number",
      label: "Money waiting",
      raw: moneyWaiting,
      format: (n) => (n > 0 ? fmtUSD(n, { compact: true }) : "—"),
      caption: `${waiting.length} active`,
    },
    {
      kind: "number",
      label: "Armed",
      raw: armed,
      format: (n) => Math.round(n).toString(),
      caption: ready.length > 0 ? `${ready.length} ready to fire` : "all waiting",
    },
    next
      ? {
          kind: "text",
          label: "Next to fire",
          value: next.nickname,
          caption: "Most recent active",
          breathe: true,
        }
      : {
          kind: "text",
          label: "Next to fire",
          value: "—",
          caption: "Nothing armed",
        },
    {
      kind: "number",
      label: "Hit rate",
      raw: hitRate === null ? 0 : hitRate * 100,
      format: (n) => (hitRate === null ? "—" : `${Math.round(n)}%`),
      caption: hitRate === null ? "No closed swaps yet" : `${filled.length}/${finishedTotal} fired`,
      // Only ever shown when every closed swap has fired — keeps it special.
      badge: hitRate === 1 && finishedTotal >= 2 ? <Stamp>Perfect record</Stamp> : null,
    },
  ];
}

export function PortfolioStrip({ orders }: Props) {
  const metrics = compute(orders);
  return (
    <section
      aria-label="Portfolio"
      className="grid border border-ink sm:grid-cols-2 lg:grid-cols-4"
    >
      {metrics.map((m, i) => (
        <div
          key={m.label}
          className={
            "relative p-4 sm:p-5 " +
            (i < metrics.length - 1
              ? "border-b border-ink sm:[&:nth-child(odd)]:border-r sm:[&:nth-child(2)]:border-b-0 lg:!border-b-0 lg:[&:not(:last-child)]:border-r"
              : "")
          }
        >
          {m.badge && <span className="absolute right-3 top-3 z-10">{m.badge}</span>}
          <p className="eyebrow">{m.label}</p>
          {m.kind === "number" ? (
            <p className="num mt-2 truncate text-2xl font-semibold text-ink lg:text-3xl">
              <CountUp to={m.raw} format={m.format} />
            </p>
          ) : (
            <p
              className={
                "num mt-2 truncate text-2xl font-semibold text-ink lg:text-3xl " +
                (m.breathe ? "breathe" : "")
              }
              title={m.value}
            >
              {m.value}
            </p>
          )}
          <p className="mt-1 truncate text-xs text-ink-3">{m.caption}</p>
        </div>
      ))}
    </section>
  );
}
