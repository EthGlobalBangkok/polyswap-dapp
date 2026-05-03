"use client";

import { useMemo } from "react";
import { erc20Abi } from "viem";
import { useAccount, useReadContracts } from "wagmi";
import type { TokenViewModel } from "@/types/design";

export interface UseTokenBalancesResult {
  /** Map keyed by lower-cased token address. Only contains successful reads. */
  balances: ReadonlyMap<string, bigint>;
  isLoading: boolean;
}

/**
 * Read ERC20 `balanceOf` for the connected wallet across the given tokens via
 * a single multicall. Returns zero entries for tokens that fail to decode.
 *
 * Pass `enabled: false` to skip the network call entirely (e.g. while a modal
 * is closed) — useful since the balanceOf list can be large.
 */
export function useTokenBalances(
  tokens: ReadonlyArray<TokenViewModel>,
  options: { enabled?: boolean } = {}
): UseTokenBalancesResult {
  const { address } = useAccount();
  const enabled = (options.enabled ?? true) && Boolean(address) && tokens.length > 0;

  const result = useReadContracts({
    contracts: enabled
      ? tokens.map((t) => ({
          address: t.address,
          abi: erc20Abi,
          functionName: "balanceOf" as const,
          args: [address!] as const,
        }))
      : [],
    query: { enabled, staleTime: 30_000 },
  });

  const balances = useMemo<Map<string, bigint>>(() => {
    const m = new Map<string, bigint>();
    if (!result.data) return m;
    result.data.forEach((entry, i) => {
      const t = tokens[i];
      if (!t) return;
      if (entry.status === "success" && typeof entry.result === "bigint") {
        m.set(t.address.toLowerCase(), entry.result);
      }
    });
    return m;
  }, [result.data, tokens]);

  return { balances, isLoading: result.isLoading };
}
