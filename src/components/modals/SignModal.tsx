"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button, Modal } from "@/components/primitives";
import { Icon } from "@/components/icons";
import { cn } from "@/lib/cn";
import { fmtNum } from "@/lib/format";
import type { CreateFormDerived, CreateFormState } from "@/hooks/useCreateOrder";
import { describeSentence } from "@/hooks/useCreateOrder";
import type { MarketViewModel } from "@/types/design";

type Step = "review" | "approve" | "sign" | "done";

const STEPS: ReadonlyArray<{ id: Step; label: string }> = [
  { id: "review", label: "Review" },
  { id: "approve", label: "Approve" },
  { id: "sign", label: "Sign" },
  { id: "done", label: "Done" },
];

interface Props {
  open: boolean;
  onClose: () => void;
  market: MarketViewModel;
  state: CreateFormState;
  derived: CreateFormDerived;
  /**
   * Wired in a follow-up to the existing approval/signing/broadcast services.
   * For now the modal advances on user action so the visual flow can be reviewed.
   */
  onSubmit?: () => Promise<void>;
}

export function SignModal({ open, onClose, market, state, derived, onSubmit }: Props) {
  const [step, setStep] = useState<Step>("review");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setStep("review");
      setError(null);
    }
  }, [open]);

  const idx = STEPS.findIndex((s) => s.id === step);

  const advance = async () => {
    setError(null);
    try {
      if (step === "review") {
        setStep("approve");
        // Simulate token approval — real impl wires `erc20ApprovalService`.
        await new Promise((r) => setTimeout(r, 700));
        setStep("sign");
        if (onSubmit) await onSubmit();
        else await new Promise((r) => setTimeout(r, 700));
        setStep("done");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setStep("review");
    }
  };

  const sentence = describeSentence(state, market.question);

  return (
    <Modal
      open={open}
      onClose={() => (step === "done" ? onClose() : onClose())}
      title="Set up the swap"
      size="lg"
      hideClose={step !== "review" && step !== "done"}
      staticDismiss={step !== "review" && step !== "done"}
    >
      <Stepper current={idx} />

      <div className="p-5 sm:p-6">
        {step === "review" && (
          <ReviewStep
            sentence={sentence}
            state={state}
            derived={derived}
            error={error}
            onContinue={advance}
            onCancel={onClose}
          />
        )}
        {step === "approve" && (
          <PendingStep
            heading="Approving the token"
            body="Confirm the one-time approval in your wallet so we can move funds when the trigger fires."
          />
        )}
        {step === "sign" && (
          <PendingStep
            heading="Signing the order"
            body="This is a free, off-chain signature. We&rsquo;ll watch the odds from here."
          />
        )}
        {step === "done" && <DoneStep market={market} onClose={onClose} />}
      </div>
    </Modal>
  );
}

function Stepper({ current }: { current: number }) {
  return (
    <ol className="flex items-center gap-2 border-b border-ink px-5 py-3 sm:px-6">
      {STEPS.map((s, i) => (
        <li key={s.id} className="flex flex-1 items-center gap-2">
          <span
            className={cn(
              "flex size-6 items-center justify-center border border-ink text-[11px] font-semibold",
              i < current && "bg-yes text-paper",
              i === current && "bg-ink text-paper",
              i > current && "bg-paper text-ink-3"
            )}
          >
            {i < current ? <Icon.check size={12} /> : i + 1}
          </span>
          <span
            className={cn(
              "hidden text-xs font-medium uppercase tracking-wide sm:inline",
              i === current ? "text-ink" : "text-ink-3"
            )}
          >
            {s.label}
          </span>
          {i < STEPS.length - 1 && (
            <span
              className={cn("ml-1 h-px flex-1", i < current ? "bg-ink" : "bg-rule-soft")}
              aria-hidden
            />
          )}
        </li>
      ))}
    </ol>
  );
}

function ReviewStep({
  sentence,
  state,
  derived,
  error,
  onContinue,
  onCancel,
}: {
  sentence: string;
  state: CreateFormState;
  derived: CreateFormDerived;
  error: string | null;
  onContinue: () => void | Promise<void>;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-5">
      <p className="font-serif text-lg italic leading-snug">{sentence}</p>

      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 border-t border-ink pt-4 text-sm">
        <Row k="You send" v={`${state.amountIn || "0"} ${state.fromToken.symbol}`} />
        <Row
          k="You receive (est.)"
          v={
            derived.amountOutEstimate > 0
              ? `~${fmtNum(derived.amountOutEstimate, 4)} ${state.toToken.symbol}`
              : `— ${state.toToken.symbol}`
          }
        />
        <Row k="Trigger" v={`${state.side} reaches ${Math.round(state.threshold * 100)}%`} />
        <Row k="Slippage" v={`${state.slippagePct}%`} />
      </dl>

      <p className="text-xs text-ink-3">
        Next we&rsquo;ll ask your wallet for a one-time approval, then a free signature. Funds stay
        with you until the trigger fires.
      </p>

      {error && <p className="border border-no bg-no/10 px-3 py-2 text-xs text-no">{error}</p>}

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button variant="ghost" size="md" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="accent" size="md" onClick={() => void onContinue()}>
          Approve & sign
          <Icon.arrowRight size={14} aria-hidden />
        </Button>
      </div>
    </div>
  );
}

function PendingStep({ heading, body }: { heading: string; body: string }) {
  return (
    <div className="flex flex-col items-start gap-4 py-4">
      <span
        aria-hidden
        className="inline-flex size-12 items-center justify-center border border-ink bg-paper-2"
      >
        <span className="size-2 animate-pulse bg-accent" />
      </span>
      <p className="font-serif text-2xl">{heading}</p>
      <p className="text-sm text-ink-2">{body}</p>
    </div>
  );
}

function DoneStep({ market, onClose }: { market: MarketViewModel; onClose: () => void }) {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <DrawnCheck />
        <p className="font-serif text-2xl">You&rsquo;re set up.</p>
      </div>
      <p className="text-sm text-ink-2">
        We&rsquo;ve got it from here. Right now &ldquo;{market.question}&rdquo; is at{" "}
        <span className="num font-medium">{Math.round(market.yesProbability * 100)}%</span>.
        We&rsquo;ll fire your swap the moment it crosses your line.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button variant="ghost" size="md" onClick={onClose}>
          Close
        </Button>
        <Link href="/dashboard">
          <Button variant="accent" size="md">
            Go to my swaps
            <Icon.arrowRight size={14} aria-hidden />
          </Button>
        </Link>
      </div>
    </div>
  );
}

/**
 * Hand-drawn check that strokes itself in over 480ms once on mount.
 * Pure SVG SMIL — no client-only motion bundle, server-renderable.
 */
function DrawnCheck() {
  return (
    <span
      aria-hidden
      className="inline-flex size-10 items-center justify-center border border-ink bg-yes"
    >
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <path
          d="M5 11.5 L9.5 16 L17.5 7"
          stroke="var(--color-paper)"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={1}
        >
          <animate
            attributeName="stroke-dashoffset"
            from="1"
            to="0"
            dur="0.48s"
            begin="0.08s"
            fill="freeze"
            calcMode="spline"
            keySplines="0.16 1 0.3 1"
            keyTimes="0;1"
          />
        </path>
      </svg>
    </span>
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
