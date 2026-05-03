"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";

interface Props {
  symbol: string;
  logoURI?: string;
  size?: number;
  className?: string;
}

/**
 * Token avatar — renders the real `logoURI` when available, falling back to a
 * mono-styled letter tile (first character of the symbol) on missing or
 * broken images. Always wrapped in a square so layouts stay stable.
 */
export function TokenLogo({ symbol, logoURI, size = 24, className }: Props) {
  const [errored, setErrored] = useState(false);
  const showImage = Boolean(logoURI) && !errored;

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden bg-paper-2 font-mono font-semibold text-ink",
        className
      )}
      style={{ width: size, height: size, fontSize: size * 0.42 }}
      aria-hidden
    >
      {showImage ? (
        // Token logos come from many third-party CDNs (CoinGecko, TrustWallet,
        // IPFS gateways, ...). next/image would require whitelisting every
        // domain — keep a plain <img> with onError fallback instead.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoURI}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          onError={() => setErrored(true)}
          style={{ width: size, height: size, display: "block", objectFit: "cover" }}
        />
      ) : (
        (symbol[0] ?? "?").toUpperCase()
      )}
    </span>
  );
}
