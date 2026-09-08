"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { TransitionLink } from "@/components/layout/TransitionLink";
import { Button, Modal } from "@/components/primitives";

const POLYMARKET_DATA_URL =
  "https://gamma-api.polymarket.com/events?active=true&closed=false&limit=1";
const REQUEST_TIMEOUT_MS = 8_000;

type Availability = { status: "checking" } | { status: "available" } | { status: "unverified" };

/**
 * PolySwap only needs Polymarket's public market data before a visitor enters
 * the app. Use the exact data API it relies on instead of maintaining a local
 * country policy: a network, HTTP, or malformed-response failure all leave the
 * app unavailable. This also catches ISP-level blocks.
 */
export function PolymarketDataGate({ children }: { children: React.ReactNode }) {
  const [attempt, setAttempt] = useState(0);
  const [availability, setAvailability] = useState<Availability>({ status: "checking" });

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let current = true;

    async function checkDataAvailability() {
      setAvailability({ status: "checking" });

      try {
        const response = await fetch(POLYMARKET_DATA_URL, {
          cache: "no-store",
          headers: { accept: "application/json" },
          signal: controller.signal,
        });

        if (!response.ok) throw new Error(`Polymarket data returned ${response.status}`);

        const payload: unknown = await response.json();
        if (!Array.isArray(payload)) throw new Error("Invalid Polymarket data response");

        if (!current) return;
        setAvailability({ status: "available" });
      } catch {
        // Browser fetches intentionally hide the low-level cause of many ISP blocks.
        // Treat every failed or malformed data request as unavailable.
        if (current) setAvailability({ status: "unverified" });
      } finally {
        window.clearTimeout(timeout);
      }
    }

    void checkDataAvailability();

    return () => {
      current = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [attempt]);

  // Avoid flashing a dialog while the availability probe is in flight.
  if (availability.status === "available" || availability.status === "checking") {
    return <>{children}</>;
  }

  return (
    <Modal
      open
      onClose={() => undefined}
      title="Polyswap unavailable"
      size="sm"
      hideClose
      staticDismiss
      panelClassName="shadow-[6px_6px_0_0_var(--color-ink)]"
    >
      <div className="flex flex-col gap-5 p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <span
            className="flex size-11 shrink-0 items-center justify-center border border-ink bg-paper-2"
            aria-hidden
          >
            <Icon.lock size={20} />
          </span>
          <div className="min-w-0 pt-0.5">
            <h2 className="font-serif text-3xl leading-[0.98] tracking-[-0.02em]">
              We can’t reach Polymarket data
            </h2>
          </div>
        </div>

        <div className="border-y border-ink py-4 text-sm leading-6 text-ink-2">
          <p>
            Polyswap needs Polymarket market data before it can be used. Your country may block some
            Polymarket API request or you have some connection issues.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <TransitionLink
            href="/"
            className="inline-flex items-center justify-center border border-ink bg-paper px-5 py-3 text-sm font-medium transition-colors hover:bg-paper-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
          >
            Back to home
          </TransitionLink>
          <Button variant="ink" className="w-full" onClick={() => setAttempt((value) => value + 1)}>
            Retry data check
          </Button>
        </div>
      </div>
    </Modal>
  );
}
