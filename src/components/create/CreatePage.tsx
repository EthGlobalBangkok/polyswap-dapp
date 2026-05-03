"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { erc20Abi, isAddress, type Address, type Hash, type Hex } from "viem";
import { usePublicClient } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { Button, DetailSkeleton } from "@/components/primitives";
import { Icon } from "@/components/icons";
import { useMarket, useRawMarket } from "@/hooks/useMarketsData";
import { useCreateOrder, describeSentence } from "@/hooks/useCreateOrder";
import { useSwapEstimates } from "@/hooks/useSwapEstimates";
import { useSafeAccount } from "@/hooks/safe/useSafeAccount";
import { SafeSignModal } from "@/components/modals/SafeSignModal";
import type { SafeCall } from "@/services/safe/types";
import { apiService } from "@/services/api";
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

function toSafeCall(tx: { to: Address; data: Hex; value: string }): SafeCall {
  return {
    to: tx.to,
    data: tx.data,
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
  const estimates = useSwapEstimates({
    fromToken: state.fromToken,
    toToken: state.toToken,
    amountIn: state.amountIn,
    userAddress: safeAddress,
  });
  const wallet = useWalletModal();
  const publicClient = usePublicClient();
  const queryClient = useQueryClient();
  const router = useRouter();

  // --- signing state ---
  const [signOpen, setSignOpen] = useState(false);
  const [calls, setCalls] = useState<SafeCall[] | null>(null);
  const [signingError, setSigningError] = useState<string | null>(null);
  const [isPreparingTx, setIsPreparingTx] = useState(false);

  // Keep a stable ref to orderId so onConfirmed closure always sees latest value.
  const orderIdRef = useRef<number | null>(null);

  const isConnected = Boolean(safeAddress);

  // ---------------------------------------------------------------------------
  // Prepare and open the sign modal
  // ---------------------------------------------------------------------------

  const handleReview = async () => {
    if (!isConnected || !walletReady || !safeAddress) {
      wallet.open();
      return;
    }
    if (!rawMarket) {
      setSigningError("Market data unavailable. Please refresh and try again.");
      return;
    }
    if (!publicClient) {
      setSigningError("RPC client not ready. Please refresh and try again.");
      return;
    }

    if (!state.fromToken || !state.toToken) {
      setSigningError("Pick the tokens you want to swap.");
      return;
    }
    if (estimates.isQuoteError) {
      setSigningError(
        estimates.quoteErrorType === "NoLiquidity"
          ? "No liquidity for this pair — the order would never settle. Pick a different pair."
          : `Can't sign: CoW Protocol returned ${
              estimates.quoteErrorType ?? "an error"
            }${estimates.quoteErrorMessage ? ` — ${estimates.quoteErrorMessage}` : ""}.`
      );
      return;
    }

    setSigningError(null);
    setIsPreparingTx(true);
    try {
      const sellAmountWei = toWei(state.amountIn, state.fromToken.decimals);

      if (!isAddress(state.fromToken.address)) {
        throw new Error(`Sell token address is not a valid address: ${state.fromToken.address}`);
      }
      if (!isAddress(state.toToken.address)) {
        throw new Error(`Buy token address is not a valid address: ${state.toToken.address}`);
      }
      const sellToken: Address = state.fromToken.address;
      const buyToken: Address = state.toToken.address;

      const order = await apiService.createPolyswapOrder({
        sellToken,
        buyToken,
        sellAmount: sellAmountWei,
        minBuyAmount: "1",
        selectedOutcome: state.side === "YES" ? "Yes" : "No",
        betPercentage: Math.round(state.threshold * 100),
        startDate: "now",
        marketId: rawMarket.id,
        owner: safeAddress,
      });

      orderIdRef.current = order.orderId;

      const allowance = await publicClient.readContract({
        address: order.sellToken,
        abi: erc20Abi,
        functionName: "allowance",
        args: [safeAddress, order.vaultRelayer],
      });

      // If the vault relayer is already approved for at least the sell amount,
      // skip the approve step and submit only the createWithContext call.
      const callsList: SafeCall[] =
        allowance >= BigInt(order.sellAmount)
          ? [toSafeCall(order.tx)]
          : order.batchTx.map(toSafeCall);

      setCalls(callsList);
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

  const onConfirmed = (_onChainHash: Hash, _safeTxHash: Hash) => {
    // The draft row already exists; the listener flips it to live once the
    // ConditionalOrderCreated event is observed. Invalidate the orders query
    // so the next refetch picks the new row up.
    // safeAddress is guaranteed truthy here — handleReview guards it before
    // opening the modal.
    queryClient.invalidateQueries({ queryKey: ["orders", safeAddress] });
    setSignOpen(false);
    const orderId = orderIdRef.current;
    if (orderId !== null) {
      router.push(`/orders/${orderId}`);
    }
  };

  // ---------------------------------------------------------------------------
  // Summary shown inside SafeSignModal
  // ---------------------------------------------------------------------------

  const modalSummary = useMemo(() => {
    if (!market) return undefined;
    return <span className="italic">{describeSentence(state, market.question)}</span>;
  }, [market, state]);

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
          <CreateForm
            market={market}
            state={state}
            derived={derived}
            estimates={estimates}
            set={set}
          />

          {signingError && (
            <p className="border border-no bg-no/10 px-3 py-2 text-xs text-no">{signingError}</p>
          )}

          {/* Desktop CTA */}
          <div className="hidden lg:block">
            <Button
              variant="accent"
              size="lg"
              disabled={!derived.isValid || isPreparingTx || estimates.isQuoteError}
              onClick={() => void handleReview()}
            >
              {isPreparingTx ? "Preparing…" : "Review and sign"}
              <Icon.arrowRight size={14} aria-hidden />
            </Button>
          </div>
        </div>

        <aside className="lg:col-span-5">
          <div className="lg:sticky lg:top-6">
            <RecapPanel market={market} state={state} estimates={estimates} />
          </div>
        </aside>
      </div>

      {/* Mobile sticky action bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-ink bg-paper px-4 py-3 shadow-[0_-2px_0_0_var(--color-rule-soft)] lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[11px] text-ink-3">Total in</p>
            <p className="num truncate text-base font-semibold">
              {estimates.amountInUsd > 0 ? fmtUSD(estimates.amountInUsd) : "—"}
            </p>
          </div>
          <Button
            variant="accent"
            size="md"
            disabled={!derived.isValid || isPreparingTx || estimates.isQuoteError}
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
          onConfirmed={onConfirmed}
          summary={modalSummary}
        />
      )}
    </div>
  );
}
