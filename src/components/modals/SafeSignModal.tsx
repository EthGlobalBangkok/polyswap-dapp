"use client";

import { useEffect } from "react";
import type { Hash } from "viem";
import { Button, Modal } from "@/components/primitives";
import { Icon } from "@/components/icons";
import { useSafeSignFlow } from "@/hooks/safe/useSafeSignFlow";
import type { SafeCall } from "@/services/safe/types";

export type SafeSignModalProps = {
  open: boolean;
  onClose: () => void;
  /** The calls to bundle into one Safe transaction. */
  calls: SafeCall[];
  /** Called once the transaction is confirmed on-chain. */
  onConfirmed: (onChainHash: Hash, safeTxHash: Hash) => void;
  /** Optional human-readable summary shown on the review screen. */
  summary?: React.ReactNode;
};

export function SafeSignModal({ open, onClose, calls, onConfirmed, summary }: SafeSignModalProps) {
  const { state, send, reset } = useSafeSignFlow();

  // Trigger onConfirmed exactly once on success.
  useEffect(() => {
    if (state.phase === "success") {
      onConfirmed(state.onChainHash, state.safeTxHash);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase]);

  // Reset state when modal closes so reopening starts fresh.
  useEffect(() => {
    if (!open && state.phase !== "idle") reset();
  }, [open, state.phase, reset]);

  const isPending =
    state.phase === "wallet" ||
    state.phase === "proposed" ||
    state.phase === "awaitingSignatures" ||
    state.phase === "awaitingExecution";

  const isTerminal =
    state.phase === "success" ||
    state.phase === "reverted" ||
    state.phase === "replaced" ||
    state.phase === "rejected" ||
    state.phase === "error";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Confirm transaction"
      size="md"
      hideClose={isPending}
      staticDismiss={isPending}
    >
      <div className="p-5 sm:p-6">
        {/* idle — review screen */}
        {state.phase === "idle" && (
          <div className="space-y-5">
            {summary && (
              <div className="border-b border-ink pb-4 font-serif text-lg italic leading-snug">
                {summary}
              </div>
            )}
            <p className="text-sm text-ink-2">
              This will send a single Safe transaction. You&rsquo;ll be asked to confirm it in your
              connected signer.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button variant="ghost" size="md" onClick={onClose}>
                Cancel
              </Button>
              <Button variant="accent" size="md" onClick={() => void send(calls)}>
                Approve &amp; sign
                <Icon.arrowRight size={14} aria-hidden />
              </Button>
            </div>
          </div>
        )}

        {/* wallet — waiting for signer */}
        {state.phase === "wallet" && (
          <PendingScreen
            heading="Open your Safe wallet"
            body="Confirm the transaction in Safe{Wallet} or your connected signer."
          />
        )}

        {/* proposed — submitted, Safe is preparing */}
        {state.phase === "proposed" && (
          <PendingScreen heading="Submitting…" body="Safe is preparing the transaction." />
        )}

        {/* awaitingSignatures — multi-sig waiting for co-signers */}
        {state.phase === "awaitingSignatures" && (
          <PendingScreen
            heading={`Awaiting signatures (${state.have}/${state.need})`}
            body="Other Safe owners need to sign before this can execute."
          />
        )}

        {/* awaitingExecution — signed, waiting for on-chain inclusion */}
        {state.phase === "awaitingExecution" && (
          <PendingScreen
            heading="Confirming on chain…"
            body="Your signature is in. Waiting for the network to include the transaction."
          />
        )}

        {/* success */}
        {state.phase === "success" && (
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <DrawnCheck />
              <p className="font-serif text-2xl">Done.</p>
            </div>
            <p className="text-sm text-ink-2">Your transaction is on chain.</p>
            <a
              href={`https://polygonscan.com/tx/${state.onChainHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm underline underline-offset-2 hover:text-ink-2"
            >
              View on Polygonscan
              <Icon.arrowUpRight size={12} aria-hidden />
            </a>
            <div className="flex justify-end">
              <Button variant="ghost" size="md" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        )}

        {/* reverted */}
        {state.phase === "reverted" && (
          <ErrorScreen
            heading="Transaction reverted"
            body="The transaction executed on chain but reverted. No funds moved."
            detail={`On-chain hash: ${state.onChainHash}`}
            onClose={onClose}
          />
        )}

        {/* replaced */}
        {state.phase === "replaced" && (
          <ErrorScreen
            heading="Transaction replaced"
            body="A different transaction with the same Safe nonce was executed first."
            onClose={onClose}
          />
        )}

        {/* rejected */}
        {state.phase === "rejected" && (
          <ErrorScreen heading="Cancelled" body={state.message} onClose={onClose} />
        )}

        {/* error */}
        {state.phase === "error" && (
          <ErrorScreen heading="Something went wrong" body={state.message} onClose={onClose} />
        )}

        {/* Retry button shown on terminal non-success states */}
        {isTerminal && state.phase !== "success" && (
          <div className="mt-4 flex justify-end">
            <Button variant="accent" size="md" onClick={() => void send(calls)}>
              Try again
              <Icon.arrowRight size={14} aria-hidden />
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function PendingScreen({ heading, body }: { heading: string; body: string }) {
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

function ErrorScreen({
  heading,
  body,
  detail,
  onClose,
}: {
  heading: string;
  body: string;
  detail?: string;
  onClose: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="inline-flex size-10 items-center justify-center border border-no bg-no/10"
        >
          <Icon.x size={18} className="text-no" aria-hidden />
        </span>
        <p className="font-serif text-2xl">{heading}</p>
      </div>
      <p className="text-sm text-ink-2">{body}</p>
      {detail && (
        <p className="border border-rule-soft bg-paper-2 px-3 py-2 font-mono text-xs text-ink-3 break-all">
          {detail}
        </p>
      )}
      <div className="flex justify-end">
        <Button variant="ghost" size="md" onClick={onClose}>
          Close
        </Button>
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
