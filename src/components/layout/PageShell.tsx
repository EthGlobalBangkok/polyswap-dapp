"use client";

import { Masthead } from "./Masthead";
import { Footer } from "./Footer";
import { Marquee } from "@/components/primitives";
import { useWalletModal } from "@/components/modals/WalletModalProvider";
import { cn } from "@/lib/cn";

interface Props {
  children: React.ReactNode;
  /** Show the trust marquee under the masthead. Default off. */
  marquee?: boolean;
  /** Constrain main content to the design max width and add padding. Default true. */
  contained?: boolean;
  /** Extra classes on <main>. */
  className?: string;
}

const MARQUEE_ITEMS = [
  "Non-custodial",
  "Cancel any time",
  "Runs on Polygon",
  "Powered by Polymarket odds",
  "No funds held by Polyswap",
];

export function PageShell({ children, marquee = false, contained = true, className }: Props) {
  const wallet = useWalletModal();

  return (
    <div className="flex min-h-screen flex-col">
      <Masthead onConnectWallet={wallet.open} />
      {marquee && (
        <Marquee items={MARQUEE_ITEMS} className="bg-ink text-paper [&_span]:text-paper" />
      )}
      <main
        className={cn(
          "flex-1",
          contained && "mx-auto w-full max-w-[1280px] px-6 sm:px-8 lg:px-12",
          className
        )}
      >
        {children}
      </main>
      <Footer />
    </div>
  );
}
