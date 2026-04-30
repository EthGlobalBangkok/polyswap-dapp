"use client";

import { useEffect, useState } from "react";
import { useAccount, useCapabilities, useChainId } from "wagmi";
import { polygon } from "wagmi/chains";
import type { Address } from "viem";

export type SafeAccountState = {
  /** The connected Safe contract address. Undefined if not connected. */
  safeAddress: Address | undefined;
  /** True when running inside the Safe{Wallet} iframe (connector id "safe"). */
  isInsideSafeApp: boolean;
  /** True when the wallet advertises EIP-5792 atomicBatch capability. */
  supports5792: boolean;
  /** True after wagmi has finished its first connector probe. Hydration-safe. */
  isReady: boolean;
};

export function useSafeAccount(): SafeAccountState {
  const { address, connector, status } = useAccount();
  const chainId = useChainId();

  const [isReady, setIsReady] = useState(false);
  useEffect(() => {
    // wagmi sets `status` to "reconnecting" then "connected"|"disconnected".
    // Wait until we leave the initial state to avoid SSR/CSR mismatch.
    if (status !== "reconnecting") setIsReady(true);
  }, [status]);

  const { data: capabilities } = useCapabilities({
    query: { enabled: status === "connected" },
  });

  const supports5792 = Boolean(capabilities?.[chainId ?? polygon.id]?.atomicBatch?.supported);

  return {
    safeAddress: address,
    isInsideSafeApp: connector?.id === "safe",
    supports5792,
    isReady,
  };
}
