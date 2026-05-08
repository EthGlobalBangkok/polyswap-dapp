import { Icon } from "@/components/icons";
import { fmtNum, fmtUSD } from "@/lib/format";
import { describeSentence, type CreateFormState } from "@/hooks/useCreateOrder";
import type { SwapEstimates } from "@/hooks/useSwapEstimates";
import type { MarketViewModel } from "@/types/design";

interface Props {
  market: MarketViewModel;
  state: CreateFormState;
  estimates: SwapEstimates;
}

export function RecapPanel({ market, state, estimates }: Props) {
  const sentence = describeSentence(state, market.question);
  const expiryLabel =
    state.expiry === "7d"
      ? "in 7 days"
      : state.expiry === "30d"
        ? "in 30 days"
        : "when the market resolves";

  const fromSymbol = state.fromToken?.symbol ?? "—";
  const toSymbol = state.toToken?.symbol ?? "—";

  return (
    <div className="space-y-4">
      <section aria-label="In your words" className="border border-ink bg-paper-2 p-5">
        <p className="eyebrow mb-3">In your words</p>
        <p className="font-serif text-lg italic leading-snug">{sentence}</p>
      </section>

      <section aria-label="Order recap" className="border border-ink bg-paper p-5">
        <p className="eyebrow mb-3">Recap</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          <Row k="Trigger" v={`${state.side} reaches ${Math.round(state.threshold * 100)}%`} />
          <Row k="You send" v={`${state.amountIn || "0"} ${fromSymbol}`} />
          <Row
            k="You receive"
            v={
              estimates.amountOutEstimate > 0
                ? `~${fmtNum(estimates.amountOutEstimate, 4)} ${toSymbol}`
                : `— ${toSymbol}`
            }
          />
          <Row k="Notional" v={estimates.amountInUsd > 0 ? fmtUSD(estimates.amountInUsd) : "—"} />
          <Row k="Expires" v={expiryLabel} />
          <Row k="Slippage" v={`${state.slippagePct}%`} />
        </dl>
      </section>

      <section aria-label="Trust" className="space-y-2 border border-ink bg-paper p-5 text-sm">
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
