"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import type { Hash } from "viem";
import { Button, DetailSkeleton } from "@/components/primitives";
import { Icon } from "@/components/icons";
import { useMarket, useRawMarket } from "@/hooks/useMarketsData";
import { useCreateOrder, describeSentence } from "@/hooks/useCreateOrder";
import { useSafeAccount } from "@/hooks/safe/useSafeAccount";
import { SafeSignModal } from "@/components/modals/SafeSignModal";
import type { SafeCall } from "@/services/safe/types";
import { MarketSummaryCard } from "./MarketSummaryCard";
import { CreateForm } from "./CreateForm";
import { RecapPanel } from "./RecapPanel";
import { useWalletModal } from "@/components/modals/WalletModalProvider";
import { fmtUSD } from "@/lib/format";

interface Props {
  marketId: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toSafeCall(tx: { to: string; data?: string; value?: string }): SafeCall {
  return {
    to: tx.to as `0x${string}`,
    data: (tx.data ?? "0x") as `0x${string}`,
    value: tx.value ? BigInt(tx.value) : 0n,
  };
}

function toWei(amount: string, decimals: number): string {
  const parsed = parseFloat(amount) || 0;
  if (parsed <= 0) return "0";
  // Use integer math to avoid floating-point drift.
  const factor = BigInt(10) ** BigInt(decimals);
  const scaled = (BigInt(Math.round(parsed * 1e6)) * factor) / BigInt(1e6);
  return scaled.toString();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CreatePage({ marketId }: Props) {
  const { data: market, isLoading, isError } = useMarket(marketId);
  const { data: rawMarket } = useRawMarket(marketId);
  const { state, derived, set } = useCreateOrder();
  const { safeAddress, isReady: walletReady } = useSafeAccount();
  const wallet = useWalletModal();

  // --- signing state ---
  const [signOpen, setSignOpen] = useState(false);
  const [calls, setCalls] = useState<SafeCall[] | null>(null);
  const [isSetupOnly, setIsSetupOnly] = useState(false);
  const [signingError, setSigningError] = useState<string | null>(null);
  const [isPreparingTx, setIsPreparingTx] = useState(false);

  // Keep a stable ref to orderId so onConfirmed closure always sees latest value.
  const orderIdRef = useRef<number | null>(null);
  const isSetupOnlyRef = useRef(false);

  const isConnected = Boolean(safeAddress);

  // ---------------------------------------------------------------------------
  // Prepare and open the sign modal
  // ---------------------------------------------------------------------------

  const handleReview = async () => {
    if (!isConnected || !walletReady) {
      wallet.open();
      return;
    }
    if (!safeAddress) {
      wallet.open();
      return;
    }
    if (!rawMarket) return;

    setSigningError(null);
    setIsPreparingTx(true);
    try {
      // 1. Compute sell amount in wei.
      const sellAmountWei = toWei(state.amountIn, state.fromToken.decimals);

      // 2. Determine buyToken: the CLOB token ID for the selected outcome.
      //    For YES outcome → index 0, NO → index 1 (standard Polymarket convention).
      const outcomeIndex = state.side === "YES" ? 0 : 1;
      const buyToken = rawMarket.clobTokenIds?.[outcomeIndex] ?? rawMarket.clobTokenIds?.[0];
      if (!buyToken) throw new Error("Market is missing CLOB token IDs.");

      // 3. Create draft order.
      const createRes = await fetch("/api/polyswap/orders/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sellToken: state.fromToken.address,
          buyToken,
          sellAmount: sellAmountWei,
          minBuyAmount: "1",
          selectedOutcome: state.side === "YES" ? "Yes" : "No",
          betPercentage: String(Math.round(state.threshold * 100)),
          startDate: "now",
          marketId: rawMarket.id,
          owner: safeAddress,
        }),
      });
      const createJson = await createRes.json();
      if (!createRes.ok || !createJson.success) {
        throw new Error(createJson.message ?? createJson.error ?? "Failed to create order.");
      }
      const orderId: number = createJson.data.orderId;
      orderIdRef.current = orderId;

      // 4. Create the Polymarket CLOB order so the backend has an order hash.
      const polyRes = await fetch("/api/polyswap/orders/polymarket", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderId }),
      });
      const polyJson = await polyRes.json();
      if (!polyRes.ok || !polyJson.success) {
        throw new Error(polyJson.message ?? polyJson.error ?? "Failed to create Polymarket order.");
      }

      // 5. Fetch the batch transaction (approval + main tx, possibly setup-only).
      const batchRes = await fetch(`/api/polyswap/orders/id/${orderId}/batch-transaction`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ownerAddress: safeAddress }),
      });
      const batchJson = await batchRes.json();
      if (!batchRes.ok || !batchJson.success) {
        throw new Error(batchJson.message ?? batchJson.error ?? "Failed to prepare transaction.");
      }

      const batch = batchJson.data.batchTransaction;
      const setupOnly: boolean = batch.setupOnlyBatch === true;
      isSetupOnlyRef.current = setupOnly;
      setIsSetupOnly(setupOnly);

      // 6. Build SafeCall[] from the batch response.
      const c: SafeCall[] = [];
      if (batch.fallbackHandlerTransaction) c.push(toSafeCall(batch.fallbackHandlerTransaction));
      if (batch.domainVerifierTransaction) c.push(toSafeCall(batch.domainVerifierTransaction));
      if (batch.approvalTransaction) c.push(toSafeCall(batch.approvalTransaction));
      if (!setupOnly) c.push(toSafeCall(batch.mainTransaction));

      setCalls(c);
      setSignOpen(true);
    } catch (err) {
      setSigningError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setIsPreparingTx(false);
    }
  };

  // ---------------------------------------------------------------------------
  // After the Safe tx is confirmed on-chain
  // ---------------------------------------------------------------------------

  const onConfirmed = async (onChainHash: Hash) => {
    const orderId = orderIdRef.current;
    // For setup-only batches there is no order to record — the main order will be
    // submitted on the next "Review & sign" attempt, once setup is confirmed.
    if (isSetupOnlyRef.current || !orderId) {
      setSignOpen(false);
      return;
    }
    try {
      await fetch(`/api/polyswap/orders/id/${orderId}/transaction`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ transactionHash: onChainHash }),
      });
    } catch {
      // Non-blocking: the order is on-chain; the PUT is a best-effort status update.
    }
    setSignOpen(false);
  };

  // ---------------------------------------------------------------------------
  // Summary shown inside SafeSignModal
  // ---------------------------------------------------------------------------

  const modalSummary = useMemo(() => {
    if (!market) return undefined;
    if (isSetupOnly) {
      return (
        <span>
          Your Safe needs a one-time setup transaction first. After this is confirmed, click
          &ldquo;Review &amp; sign&rdquo; again to send the order.
        </span>
      );
    }
    return <span className="italic">{describeSentence(state, market.question)}</span>;
  }, [market, state, isSetupOnly]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

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

          {signingError && (
            <p className="border border-no bg-no/10 px-3 py-2 text-xs text-no">{signingError}</p>
          )}

          {/* Desktop CTA */}
          <div className="hidden lg:block">
            <Button
              variant="accent"
              size="lg"
              disabled={!derived.isValid || isPreparingTx}
              onClick={() => void handleReview()}
            >
              {isPreparingTx ? "Preparing…" : "Review and sign"}
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
            disabled={!derived.isValid || isPreparingTx}
            onClick={() => void handleReview()}
            className="shrink-0"
          >
            {isPreparingTx ? "Preparing…" : "Review & sign"}
            <Icon.arrowRight size={14} aria-hidden />
          </Button>
        </div>
      </div>

      {calls && (
        <SafeSignModal
          open={signOpen}
          onClose={() => setSignOpen(false)}
          calls={calls}
          onConfirmed={(onChainHash) => void onConfirmed(onChainHash)}
          summary={modalSummary}
        />
      )}
    </div>
  );
}
