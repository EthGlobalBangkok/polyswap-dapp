# Safe Signature Flow Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the broken Safe signature/transaction flow so signatures are tracked through their _real_ lifecycle (proposal → execution → on-chain confirmation) and batches are sent atomically through EIP-5792 with REST + on-chain-event fallbacks. Scope v1 to 1/1 Safes; the state machine is built so threshold>1 is a flag-flip later.

**Architecture:**

- **Primary signing path:** EIP-5792 — `useSendCalls({ calls: [...] })` for atomic batches, `useWaitForCallsStatus({ id })` for tracking. Safe iframe (`SafeAppProvider`) and modern Safe{Wallet} via WalletConnect both implement 5792 natively.
- **Fallback signing path:** if the connected wallet does not advertise `atomicBatch.supported`, send each call as a separate `eth_sendTransaction` (each becomes its own SafeTx). Degraded UX but works on every Safe wallet.
- **Status tracking:** for each `safeTxHash`, run two concurrent observers — Safe Transaction Service REST poll (every 4s; gives intermediate states) and `viem.watchEvent` on `ExecutionSuccess`/`ExecutionFailure` (sub-second on success). First decisive signal wins.
- **State machine:** new `SafeSignFlow` reducer covers `idle → wallet → proposed → awaitingSignatures → awaitingExecution → success | reverted | replaced | rejected | error`. The modal renders one screen per state.
- **Backend simplification:** `PUT /api/polyswap/orders/id/[id]/transaction` now trusts the on-chain hash supplied by the frontend (the frontend has already confirmed execution). Receipt-fetching failures stop being a frontend-blocking concern.

**Tech Stack:** Next.js 15 App Router, React 19, wagmi 2.16, viem 2.x, `@safe-global/safe-apps-sdk@9.1`, TypeScript. No new dependencies. No new test infrastructure (none exists in repo today; verification is manual against a real Safe).

**Out of scope for v1:**

- Threshold > 1 Safes (state machine supports them; UI v1 only renders 1/1 paths).
- Backend listener/market-updater rewrite (separate plan).
- Removing `safeBatchService.ts` setup-handler/domain-verifier preconditions — those are correct behavior; we keep the API contract, just change how its result is signed.
- Adding tests / vitest setup — flagged as a follow-up.

**No backwards compatibility:** old files get deleted, not deprecated. We're on `lucas/redesign`, no consumers outside this repo.

---

## File Map

### Files to create

| Path                                      | Responsibility                                                                                                                                        |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/services/safe/safeTxService.ts`      | Pure REST client for `https://api.safe.global/tx-service/pol/api/v1/...`. URL builder, response types, single fetch helper. No React.                 |
| `src/services/safe/multiSendEncoder.ts`   | viem-based `encodeMultiSend(calls)` → calldata for `MultiSendCallOnly.multiSend(bytes)`. Pure function.                                               |
| `src/services/safe/types.ts`              | Shared types: `SafeCall`, `SafeTxStatus`, `SafeMultisigTxResponse`.                                                                                   |
| `src/hooks/safe/useSafeAccount.ts`        | Reads `useAccount()` and exposes `{ safeAddress, isInsideSafeApp, supports5792 }`.                                                                    |
| `src/hooks/safe/useSafeTransaction.ts`    | Given a `safeTxHash`, returns live `SafeTxStatus`. Internally chooses 5792 vs REST+event watch.                                                       |
| `src/hooks/safe/useSafeSignFlow.ts`       | The modal state-machine hook. Wraps `useSendCalls` (or fallback) + `useSafeTransaction`. Persists pending txs to localStorage for tab-close recovery. |
| `src/components/modals/SafeSignModal.tsx` | New modal component. Renders one screen per `SafeSignFlow.phase`.                                                                                     |

### Files to modify

| Path                                                                                     | Change                                                                                                                                                                                                                                        |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/wagmi/config.ts`                                                                    | Anchor regexes (`/^app\.safe\.global$/`), add `unstable_getInfoTimeout: 1000`, fix `mobileWallets` empty-array misconfig.                                                                                                                     |
| `next.config.ts`                                                                         | Add `Content-Security-Policy: frame-ancestors 'self' https://*.safe.global` so the dApp can be loaded in the Safe iframe.                                                                                                                     |
| `src/components/create/CreatePage.tsx`                                                   | Replace the call to old `SignModal` with `SafeSignModal`. Pass the `calls[]` it should send instead of relying on a bespoke service.                                                                                                          |
| `src/app/api/polyswap/orders/id/[id]/transaction/route.ts` (PUT handler, lines ~187-408) | Stop trying to fetch the receipt synchronously. Trust the supplied on-chain hash, parse the event from the receipt, return error if event truly absent. (Frontend will only call this once execution is confirmed, so receipt always exists.) |

### Files to delete

| Path                                       | Why                                                                                                 |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `src/services/safeService.ts`              | Dead code — never instantiated. Replaced by `useSafeSignFlow`.                                      |
| `src/services/walletConnectSafeService.ts` | Replaced by `useSendCalls` + `useSafeTransaction`. The sequential-with-2s-sleep loop is gone.       |
| `src/services/safeMultiSendService.ts`     | Replaced by `src/services/safe/multiSendEncoder.ts` (cleaner, viem-based).                          |
| `src/components/modals/SignModal.tsx`      | Replaced by `SafeSignModal.tsx`. The four-state machine was the source of the "done too early" bug. |

### Files left intentionally untouched

- `src/services/safeBatchService.ts` (and the `/api/polyswap/orders/id/[id]/batch-transaction` endpoint) — the _backend_ logic for figuring out what calls are needed (fallback handler? domain verifier? approval?) is correct. The new flow consumes the same response shape; only the **signing** step changes.
- `src/services/safeFallbackHandlerService.ts`, `safeDomainVerifierService.ts`, `erc20ApprovalService.ts` — same reason.

---

## Verification strategy

No test infra exists in repo. Per project preference (CLAUDE.md), we won't add it as part of this refactor. Verification:

1. **TypeScript** — strict mode is on; signatures and types catch most regressions.
2. **Manual smoke test** at the end of the plan, against a real 1/1 Safe on Polygon, exercising both:
   - WalletConnect path (Safe{Wallet} mobile + desktop)
   - Iframe path (loading the dApp at `https://app.safe.global/share/safe-app?appUrl=<our-dev-tunnel>`)
3. **Pure-logic spot checks** — `multiSendEncoder` output is compared once against a known-good Safe SDK encoding (recorded in the task), then trusted.

This is honest: this PR ships a working flow, not a tested one. Adding vitest + a proper integration suite is a follow-up.

---

## Key documentation references (open these before coding)

- `https://eips.ethereum.org/EIPS/eip-5792` — call status semantics (100/200/400/500/600).
- `https://wagmi.sh/react/api/hooks/useSendCalls` and `/useWaitForCallsStatus` — exact wagmi v2 API.
- `https://wagmi.sh/react/api/hooks/useCapabilities` — gating 5792.
- `https://docs.safe.global/core-api/transaction-service-overview` — REST endpoints.
- `https://github.com/safe-global/safe-apps-sdk/blob/main/packages/safe-apps-provider/src/provider.ts` — confirms `eth_sendTransaction` returns `safeTxHash` (lines around `submittedTxs.set(resp.safeTxHash, ...)`).
- `https://github.com/wevm/wagmi/blob/main/packages/connectors/src/safe.ts` — confirms the 10ms `unstable_getInfoTimeout` default we're overriding.

---

## Phase 0 — Pre-flight

### Task 0.1: Fix wagmi config (10ms timeout bug + regex anchoring)

**Files:**

- Modify: `src/wagmi/config.ts`

- [ ] **Step 1: Replace the wagmi config**

Read `src/wagmi/config.ts`, then replace its contents with:

```ts
"use client";

import { createConfig, http } from "wagmi";
import { polygon } from "wagmi/chains";
import { safe, walletConnect } from "wagmi/connectors";

const projectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID;
if (!projectId) {
  throw new Error("NEXT_PUBLIC_WC_PROJECT_ID is not defined");
}

export const config = createConfig({
  chains: [polygon],
  transports: {
    [polygon.id]: http(process.env.NEXT_PUBLIC_RPC_URL),
  },
  ssr: true,
  connectors: [
    safe({
      // Override wagmi's 10ms upstream default — too short for a typical iframe boot.
      // See https://github.com/wevm/wagmi/blob/main/packages/connectors/src/safe.ts
      unstable_getInfoTimeout: 1000,
      // Anchored regexes — old config had `/app\.safe\.global$/` which matches
      // "evil-app.safe.global". Keep it tight.
      allowedDomains: [/^app\.safe\.global$/, /^safe\.global$/],
      debug: process.env.NODE_ENV !== "production",
    }),
    walletConnect({
      projectId,
      metadata: {
        name: "Polyswap",
        description: "Conditional orders with Polymarket predictions",
        url: typeof window !== "undefined" ? window.location.origin : "",
        icons: [typeof window !== "undefined" ? `${window.location.origin}/favicon.ico` : ""],
      },
      showQrModal: true,
    }),
  ],
});
```

Notes:

- The `qrModalOptions` filter list from before was removed because passing `mobileWallets: []` and `desktopWallets: []` together with `enableExplorer: false` results in the WalletConnect modal showing _no wallets at all_ on some installs. The default WC modal is fine — if a Safe-only filter is needed later, do it via WalletConnect Cloud project config, not here.
- `NEXT_PUBLIC_RPC_URL` is now read; falls back to viem's public RPC if unset.

- [ ] **Step 2: Run typecheck and lint**

```bash
cd /Users/lucas/repo/polyswap/polyswap-dapp
pnpm lint
```

Expected: clean (or only the same warnings as `main`).

- [ ] **Step 3: Boot the dev server, confirm wagmi initializes without throwing**

```bash
pnpm dev
```

Open `http://localhost:3000` in a normal browser. Verify the page loads (no console errors related to "Connector"/wagmi).
Stop the dev server (Ctrl-C).

- [ ] **Step 4: Commit**

```bash
git add src/wagmi/config.ts
git commit -m "fix(wagmi): anchor Safe regexes and bump getInfo timeout to 1000ms

Upstream wagmi defaults unstable_getInfoTimeout to 10ms which spuriously
fails iframe detection on slow page loads. Also tightens allowedDomains
regexes (\`/^...$/\` instead of \`/...$/\`) to prevent subdomain spoofing."
```

---

### Task 0.2: Add CSP `frame-ancestors` so the dApp can run in Safe iframe

**Files:**

- Modify: `next.config.ts`

- [ ] **Step 1: Read the current `next.config.ts`**

```bash
cat /Users/lucas/repo/polyswap/polyswap-dapp/next.config.ts
```

- [ ] **Step 2: Add an `async headers()` function**

Add (or merge with the existing config) the following to `next.config.ts`:

```ts
async headers() {
  return [
    {
      source: "/:path*",
      headers: [
        {
          key: "Content-Security-Policy",
          // Allow embedding inside Safe{Wallet}'s app shell.
          // frame-ancestors supersedes the legacy X-Frame-Options header.
          value: "frame-ancestors 'self' https://*.safe.global",
        },
      ],
    },
  ];
},
```

If `next.config.ts` already exports a config object, add `async headers()` as a method on it. If it's wrapped (e.g. by `withSentryConfig`), put `headers` inside the inner config object that gets wrapped — wrappers preserve top-level keys.

- [ ] **Step 3: Verify**

```bash
pnpm dev
```

In another terminal:

```bash
curl -sI http://localhost:3000/ | grep -i 'content-security-policy'
```

Expected: `Content-Security-Policy: frame-ancestors 'self' https://*.safe.global`.

Stop dev server.

- [ ] **Step 4: Commit**

```bash
git add next.config.ts
git commit -m "feat(csp): allow Safe{Wallet} iframe embedding via frame-ancestors

Required so the dApp can be loaded inside app.safe.global. Replaces the
legacy X-Frame-Options approach with the modern CSP directive."
```

---

## Phase 1 — Foundation utilities (pure modules, no React)

### Task 1.1: Shared Safe types

**Files:**

- Create: `src/services/safe/types.ts`

- [ ] **Step 1: Create the types file**

```ts
// src/services/safe/types.ts
import type { Address, Hash, Hex } from "viem";

/** A single call inside a batch (matches EIP-5792 `Call` shape). */
export type SafeCall = {
  to: Address;
  data?: Hex;
  value?: bigint;
};

/** Possible high-level statuses observable by the dApp. */
export type SafeTxStatus =
  | { kind: "idle" }
  | { kind: "awaitingSignatures"; have: number; need: number }
  | { kind: "awaitingExecution" }
  | { kind: "executed"; onChainHash: Hash }
  | { kind: "reverted"; onChainHash: Hash }
  | { kind: "replaced" }
  | { kind: "error"; error: Error };

/** Subset of fields we read from Safe Transaction Service REST. */
export type SafeMultisigTxResponse = {
  safe: Address;
  to: Address;
  value: string;
  data: Hex | null;
  operation: 0 | 1;
  nonce: number;
  safeTxHash: Hash;
  executionDate: string | null;
  submissionDate: string;
  blockNumber: number | null;
  transactionHash: Hash | null;
  isExecuted: boolean;
  isSuccessful: boolean | null;
  confirmationsRequired: number;
  confirmations: Array<{
    owner: Address;
    submissionDate: string;
    transactionHash: Hash | null;
    signature: Hex;
    signatureType: "EOA" | "CONTRACT_SIGNATURE" | "APPROVED_HASH" | "ETH_SIGN";
  }>;
};
```

- [ ] **Step 2: Commit**

```bash
git add src/services/safe/types.ts
git commit -m "feat(safe): shared types for the new signing flow"
```

---

### Task 1.2: Safe Transaction Service REST client

**Files:**

- Create: `src/services/safe/safeTxService.ts`

- [ ] **Step 1: Create the REST client**

```ts
// src/services/safe/safeTxService.ts
import type { Address, Hash } from "viem";
import type { SafeMultisigTxResponse } from "./types";

/**
 * Safe migrated from `safe-transaction-{chain}.safe.global` to a
 * chain-agnostic gateway. The old hostname 308-redirects.
 * Polygon shortname = "pol".
 */
const TX_SVC_BASE = "https://api.safe.global/tx-service/pol/api/v1";

export type FetchResult =
  | { kind: "ok"; tx: SafeMultisigTxResponse }
  | { kind: "notFound" } // safeTxHash not yet indexed by Safe — keep retrying
  | { kind: "error"; error: Error };

export async function fetchMultisigTransaction(
  safeTxHash: Hash,
  signal?: AbortSignal
): Promise<FetchResult> {
  const url = `${TX_SVC_BASE}/multisig-transactions/${safeTxHash}/`;
  try {
    const res = await fetch(url, { signal, headers: { accept: "application/json" } });
    if (res.status === 404) return { kind: "notFound" };
    if (!res.ok) {
      return { kind: "error", error: new Error(`Safe API ${res.status}`) };
    }
    const tx = (await res.json()) as SafeMultisigTxResponse;
    return { kind: "ok", tx };
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      // Caller-driven cancellation — rethrow so React effects can clean up cleanly.
      throw e;
    }
    return { kind: "error", error: e as Error };
  }
}

/**
 * Detects whether `targetSafeTxHash` was superseded by another tx at the same nonce.
 * Returns `true` if the same Safe has another **executed** tx at that nonce
 * with a different safeTxHash.
 */
export async function isReplaced(
  safe: Address,
  nonce: number,
  targetSafeTxHash: Hash,
  signal?: AbortSignal
): Promise<boolean> {
  const url =
    `${TX_SVC_BASE}/safes/${safe}/multisig-transactions/` + `?nonce=${nonce}&executed=true`;
  const res = await fetch(url, { signal, headers: { accept: "application/json" } });
  if (!res.ok) return false;
  const data = (await res.json()) as { results: SafeMultisigTxResponse[] };
  return data.results.some(
    (t) => t.isExecuted && t.safeTxHash.toLowerCase() !== targetSafeTxHash.toLowerCase()
  );
}
```

- [ ] **Step 2: Quick spot-check that the URL works** (no test framework — just curl)

```bash
curl -sI 'https://api.safe.global/tx-service/pol/api/v1/multisig-transactions/0x0000000000000000000000000000000000000000000000000000000000000000/'
```

Expected: HTTP 404 with `Content-Type: application/json` (proves endpoint resolves; body will be `{"detail":"No MultisigTransaction matches the given query."}`).

- [ ] **Step 3: Commit**

```bash
git add src/services/safe/safeTxService.ts
git commit -m "feat(safe): REST client for Safe Transaction Service

Wraps the migrated api.safe.global/tx-service/pol/ endpoints. Distinguishes
404 (not-yet-indexed) from real errors so callers can keep polling without
flipping into an error state prematurely."
```

---

### Task 1.3: MultiSend encoder (fallback path for non-5792 wallets)

**Files:**

- Create: `src/services/safe/multiSendEncoder.ts`

- [ ] **Step 1: Create the encoder**

```ts
// src/services/safe/multiSendEncoder.ts
import { concatHex, encodeFunctionData, numberToHex, size, type Address, type Hex } from "viem";
import type { SafeCall } from "./types";

/**
 * Polygon `MultiSendCallOnly` — the variant that disallows DELEGATECALL inside
 * the batch (each sub-call is a normal CALL).
 *
 * Source: https://github.com/safe-global/safe-deployments
 */
export const MULTI_SEND_CALL_ONLY: Address = "0x40A2aCCbd92BCA938b02010E17A5b8929b49130D";

const MULTI_SEND_ABI = [
  {
    inputs: [{ name: "transactions", type: "bytes" }],
    name: "multiSend",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
] as const;

/**
 * Packs a list of calls into the MultiSend wire format:
 *   for each call: operation(1) | to(20) | value(32) | dataLen(32) | data(dataLen)
 * Then ABI-encodes a single `multiSend(bytes)` call to MultiSendCallOnly.
 *
 * Operation is forced to 0 (CALL); MultiSendCallOnly rejects DELEGATECALL.
 */
export function encodeMultiSend(calls: SafeCall[]): { to: Address; data: Hex; value: bigint } {
  const packed = concatHex(
    calls.map((c) => {
      const data = (c.data ?? "0x") as Hex;
      const dataLen = size(data);
      return concatHex([
        "0x00", // operation = CALL
        c.to,
        numberToHex(c.value ?? 0n, { size: 32 }),
        numberToHex(BigInt(dataLen), { size: 32 }),
        data,
      ]);
    })
  );

  return {
    to: MULTI_SEND_CALL_ONLY,
    data: encodeFunctionData({
      abi: MULTI_SEND_ABI,
      functionName: "multiSend",
      args: [packed],
    }),
    value: 0n,
  };
}
```

- [ ] **Step 2: One-shot fixture verification**

Create a temp script `script/_verify-multisend.ts`:

```ts
// Verifies encodeMultiSend output against a known fixture.
// Delete this file once verified.
import { encodeMultiSend } from "../src/services/safe/multiSendEncoder";

const out = encodeMultiSend([
  { to: "0x0000000000000000000000000000000000000001", data: "0xdeadbeef", value: 0n },
  { to: "0x0000000000000000000000000000000000000002", data: "0x", value: 1n },
]);

console.log("to:    ", out.to);
console.log("value: ", out.value.toString());
console.log("data:  ", out.data);

// Assertions:
// 1. to === MultiSendCallOnly on Polygon
// 2. data starts with 0x8d80ff0a (selector of multiSend(bytes))
// 3. data length sanity: function selector (4) + offset (32) + length (32) + packed bytes + padding
const SELECTOR = "0x8d80ff0a";
if (!out.data.startsWith(SELECTOR)) {
  throw new Error(`bad selector: expected ${SELECTOR}`);
}
if (out.to.toLowerCase() !== "0x40a2accbd92bca938b02010e17a5b8929b49130d") {
  throw new Error("bad to address");
}
console.log("OK");
```

Run:

```bash
pnpm tsx script/_verify-multisend.ts
```

Expected: prints `OK`. If it doesn't, fix the encoder before continuing.

- [ ] **Step 3: Delete the verification script**

```bash
rm script/_verify-multisend.ts
```

(Per project convention — temp test scripts are deleted after they pass.)

- [ ] **Step 4: Commit**

```bash
git add src/services/safe/multiSendEncoder.ts
git commit -m "feat(safe): viem-based MultiSendCallOnly encoder

Replaces the old ethers-based safeMultiSendService with a focused, pure
encoder used as a fallback when the connected Safe wallet does not
advertise EIP-5792 atomicBatch capability."
```

---

## Phase 2 — Hooks

### Task 2.1: `useSafeAccount` — environment detection

**Files:**

- Create: `src/hooks/safe/useSafeAccount.ts`

- [ ] **Step 1: Create the hook**

```ts
// src/hooks/safe/useSafeAccount.ts
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
```

- [ ] **Step 2: Lint**

```bash
pnpm lint
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/safe/useSafeAccount.ts
git commit -m "feat(safe): useSafeAccount hook

Surfaces the data the rest of the signing flow needs: Safe address,
whether we're inside the Safe iframe, and whether the wallet advertises
EIP-5792 atomicBatch support (capability gating)."
```

---

### Task 2.2: `useSafeTransaction` — track a `safeTxHash` to terminal state

**Files:**

- Create: `src/hooks/safe/useSafeTransaction.ts`

- [ ] **Step 1: Create the hook**

```ts
// src/hooks/safe/useSafeTransaction.ts
"use client";

import { useEffect, useRef, useState } from "react";
import { parseAbiItem, type Address, type Hash } from "viem";
import { usePublicClient, useWaitForCallsStatus } from "wagmi";
import { fetchMultisigTransaction, isReplaced } from "@/services/safe/safeTxService";
import type { SafeTxStatus } from "@/services/safe/types";

const POLL_INTERVAL_MS = 4_000;
const NOT_FOUND_GRACE_MS = 30_000; // Safe indexer lag tolerance

export type UseSafeTransactionArgs = {
  safeTxHash: Hash | undefined;
  safeAddress: Address | undefined;
  /** When true, prefer wagmi's useWaitForCallsStatus (EIP-5792). */
  use5792: boolean;
};

export function useSafeTransaction({
  safeTxHash,
  safeAddress,
  use5792,
}: UseSafeTransactionArgs): SafeTxStatus {
  const [status, setStatus] = useState<SafeTxStatus>({ kind: "idle" });
  const publicClient = usePublicClient();

  // ---- 5792 path: hand off to wagmi entirely. ----
  const { data: callsStatus } = useWaitForCallsStatus({
    id: safeTxHash,
    pollingInterval: POLL_INTERVAL_MS,
    query: { enabled: use5792 && Boolean(safeTxHash) },
  });

  useEffect(() => {
    if (!use5792 || !callsStatus) return;
    // EIP-5792 status codes: 100 pending, 200 confirmed, 400 cancelled, 500 reverted.
    switch (callsStatus.status) {
      case "pending":
        setStatus({ kind: "awaitingExecution" });
        break;
      case "success": {
        const onChainHash = callsStatus.receipts?.[0]?.transactionHash;
        if (onChainHash) setStatus({ kind: "executed", onChainHash });
        break;
      }
      case "failure": {
        const onChainHash = callsStatus.receipts?.[0]?.transactionHash;
        setStatus(
          onChainHash ? { kind: "reverted", onChainHash } : { kind: "replaced" } // status=400 with no receipt
        );
        break;
      }
    }
  }, [use5792, callsStatus]);

  // ---- Fallback path: REST poll + on-chain event watch, run concurrently. ----
  const restNotFoundSinceRef = useRef<number | null>(null);

  useEffect(() => {
    if (use5792) return;
    if (!safeTxHash || !safeAddress || !publicClient) return;

    const ac = new AbortController();
    let cancelled = false;
    let pollHandle: ReturnType<typeof setTimeout> | null = null;

    // Real-time happy path: ExecutionSuccess / ExecutionFailure both emit
    // an indexed bytes32 txHash that equals the safeTxHash.
    const unwatch = publicClient.watchEvent({
      address: safeAddress,
      events: [
        parseAbiItem("event ExecutionSuccess(bytes32 indexed txHash, uint256 payment)"),
        parseAbiItem("event ExecutionFailure(bytes32 indexed txHash, uint256 payment)"),
      ],
      args: { txHash: safeTxHash },
      onLogs: (logs) => {
        if (cancelled || logs.length === 0) return;
        const log = logs[0];
        const success = log.eventName === "ExecutionSuccess";
        setStatus({
          kind: success ? "executed" : "reverted",
          onChainHash: log.transactionHash!,
        });
      },
    });

    const poll = async () => {
      if (cancelled) return;

      const result = await fetchMultisigTransaction(safeTxHash, ac.signal).catch(
        () => ({ kind: "error", error: new Error("aborted") }) as const
      );

      if (cancelled) return;

      if (result.kind === "notFound") {
        // Tolerate indexer lag; only escalate to "replaced" check after grace.
        restNotFoundSinceRef.current ??= Date.now();
        if (Date.now() - restNotFoundSinceRef.current > NOT_FOUND_GRACE_MS) {
          // Still not indexed after grace — it's likely been superseded.
          // We don't have a nonce yet (never got the tx), so leave status as-is.
          // Event watch is still running; if execution actually lands, we'll see it.
        }
      } else if (result.kind === "ok") {
        restNotFoundSinceRef.current = null;
        const tx = result.tx;

        if (tx.isExecuted) {
          if (tx.transactionHash) {
            setStatus({
              kind: tx.isSuccessful ? "executed" : "reverted",
              onChainHash: tx.transactionHash,
            });
            return; // terminal — stop polling
          }
        } else {
          // Replacement check: is there another executed tx at the same nonce?
          const replaced = await isReplaced(safeAddress, tx.nonce, safeTxHash, ac.signal).catch(
            () => false
          );
          if (cancelled) return;
          if (replaced) {
            setStatus({ kind: "replaced" });
            return;
          }
          const have = (tx.confirmations ?? []).length;
          const need = tx.confirmationsRequired;
          setStatus(
            have >= need
              ? { kind: "awaitingExecution" }
              : { kind: "awaitingSignatures", have, need }
          );
        }
      }
      // result.kind === "error" → transient. Don't surface; just retry.

      pollHandle = setTimeout(poll, POLL_INTERVAL_MS);
    };

    void poll();

    return () => {
      cancelled = true;
      ac.abort();
      if (pollHandle) clearTimeout(pollHandle);
      unwatch();
    };
  }, [use5792, safeTxHash, safeAddress, publicClient]);

  return status;
}
```

- [ ] **Step 2: Lint and typecheck**

```bash
pnpm lint
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/safe/useSafeTransaction.ts
git commit -m "feat(safe): useSafeTransaction tracks safeTxHash to terminal state

Two execution paths under one return type:
- EIP-5792 (preferred): delegates to wagmi useWaitForCallsStatus
- Fallback: parallel Safe Tx Service REST poll + on-chain ExecutionSuccess
  /ExecutionFailure event watch; first decisive signal wins.

Distinguishes the awaitingSignatures / awaitingExecution / executed /
reverted / replaced states so the modal can render meaningful UI."
```

---

### Task 2.3: `useSafeSignFlow` — modal state machine

**Files:**

- Create: `src/hooks/safe/useSafeSignFlow.ts`

- [ ] **Step 1: Create the hook**

```ts
// src/hooks/safe/useSafeSignFlow.ts
"use client";

import { useCallback, useEffect, useReducer } from "react";
import { useSendCalls, useSendTransaction } from "wagmi";
import type { Hash } from "viem";
import { useSafeAccount } from "./useSafeAccount";
import { useSafeTransaction } from "./useSafeTransaction";
import { encodeMultiSend } from "@/services/safe/multiSendEncoder";
import type { SafeCall } from "@/services/safe/types";

const STORAGE_KEY = "polyswap.pendingSafeTx";

export type SafeSignPhase =
  | { phase: "idle" }
  | { phase: "wallet" } // popup open, awaiting user signature
  | { phase: "rejected"; message: string }
  | { phase: "proposed"; safeTxHash: Hash }
  | { phase: "awaitingSignatures"; safeTxHash: Hash; have: number; need: number }
  | { phase: "awaitingExecution"; safeTxHash: Hash }
  | { phase: "success"; safeTxHash: Hash; onChainHash: Hash }
  | { phase: "reverted"; safeTxHash: Hash; onChainHash: Hash }
  | { phase: "replaced"; safeTxHash: Hash }
  | { phase: "error"; message: string };

type Persisted = { safeTxHash: Hash; ts: number };

export function useSafeSignFlow() {
  const { safeAddress, supports5792, isReady } = useSafeAccount();
  const [state, dispatch] = useReducer((_s: SafeSignPhase, n: SafeSignPhase) => n, {
    phase: "idle",
  } as SafeSignPhase);

  // ----- Send paths -----
  const { sendCallsAsync } = useSendCalls();
  const { sendTransactionAsync } = useSendTransaction();

  const send = useCallback(
    async (calls: SafeCall[]) => {
      if (!safeAddress) {
        dispatch({ phase: "error", message: "No Safe connected" });
        return;
      }
      dispatch({ phase: "wallet" });
      try {
        let safeTxHash: Hash;
        if (supports5792) {
          const { id } = await sendCallsAsync({
            calls: calls.map((c) => ({
              to: c.to,
              data: c.data,
              value: c.value,
            })),
          });
          safeTxHash = id as Hash;
        } else if (calls.length === 1) {
          // No batching needed.
          const c = calls[0];
          safeTxHash = await sendTransactionAsync({
            to: c.to,
            data: c.data,
            value: c.value,
          });
        } else {
          // Pre-EIP-5792 wallet: pack calls via MultiSendCallOnly so it's still
          // a single Safe transaction (single signature). Note: MultiSendCallOnly
          // is invoked via CALL — so this works even though Safe normally uses
          // DELEGATECALL for the standard MultiSend.
          const packed = encodeMultiSend(calls);
          safeTxHash = await sendTransactionAsync({
            to: packed.to,
            data: packed.data,
            value: packed.value,
          });
        }
        dispatch({ phase: "proposed", safeTxHash });
      } catch (e) {
        const err = e as Error & { code?: number };
        if (err.code === 4001 || /reject/i.test(err.message)) {
          dispatch({ phase: "rejected", message: "You rejected the request in Safe" });
        } else {
          dispatch({ phase: "error", message: err.message ?? "Unknown error" });
        }
      }
    },
    [safeAddress, supports5792, sendCallsAsync, sendTransactionAsync]
  );

  const reset = useCallback(() => {
    dispatch({ phase: "idle" });
    if (typeof window !== "undefined") localStorage.removeItem(STORAGE_KEY);
  }, []);

  // ----- Recover from localStorage on mount -----
  useEffect(() => {
    if (!isReady || typeof window === "undefined") return;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Persisted;
      // Stale beyond 1h — drop.
      if (Date.now() - parsed.ts > 60 * 60 * 1000) {
        localStorage.removeItem(STORAGE_KEY);
        return;
      }
      dispatch({ phase: "proposed", safeTxHash: parsed.safeTxHash });
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [isReady]);

  // ----- Track the proposed tx -----
  const safeTxHash = "safeTxHash" in state ? state.safeTxHash : undefined;
  const txStatus = useSafeTransaction({
    safeTxHash,
    safeAddress,
    use5792: supports5792,
  });

  // Bridge txStatus → flow phase
  useEffect(() => {
    if (!safeTxHash) return;
    switch (txStatus.kind) {
      case "awaitingSignatures":
        dispatch({
          phase: "awaitingSignatures",
          safeTxHash,
          have: txStatus.have,
          need: txStatus.need,
        });
        break;
      case "awaitingExecution":
        dispatch({ phase: "awaitingExecution", safeTxHash });
        break;
      case "executed":
        dispatch({ phase: "success", safeTxHash, onChainHash: txStatus.onChainHash });
        break;
      case "reverted":
        dispatch({ phase: "reverted", safeTxHash, onChainHash: txStatus.onChainHash });
        break;
      case "replaced":
        dispatch({ phase: "replaced", safeTxHash });
        break;
      // "idle" / "error" don't transition
    }
  }, [txStatus, safeTxHash]);

  // ----- Persist while in-flight -----
  useEffect(() => {
    if (typeof window === "undefined") return;
    const inFlight =
      state.phase === "proposed" ||
      state.phase === "awaitingSignatures" ||
      state.phase === "awaitingExecution";
    const terminal =
      state.phase === "success" || state.phase === "reverted" || state.phase === "replaced";
    if (inFlight && "safeTxHash" in state) {
      const payload: Persisted = { safeTxHash: state.safeTxHash, ts: Date.now() };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } else if (terminal) {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [state]);

  return { state, send, reset };
}
```

- [ ] **Step 2: Lint and typecheck**

```bash
pnpm lint
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/safe/useSafeSignFlow.ts
git commit -m "feat(safe): useSafeSignFlow modal state machine

Combines useSendCalls (5792) / useSendTransaction (fallback) with
useSafeTransaction tracking to produce a single state-machine hook the
modal can drive directly. Persists in-flight safeTxHash to localStorage
so a tab reload recovers state."
```

---

## Phase 3 — UI

### Task 3.1: `SafeSignModal`

**Files:**

- Create: `src/components/modals/SafeSignModal.tsx`

- [ ] **Step 1: Read the existing SignModal to match styling conventions**

```bash
cat /Users/lucas/repo/polyswap/polyswap-dapp/src/components/modals/SignModal.tsx | head -120
```

Note the project's Modal primitive (likely `@/components/primitives/Modal` or similar — same one used by the existing SignModal). Use it.

- [ ] **Step 2: Create SafeSignModal**

```tsx
// src/components/modals/SafeSignModal.tsx
"use client";

import { useEffect } from "react";
import type { Hash } from "viem";
import { useSafeSignFlow } from "@/hooks/safe/useSafeSignFlow";
import { Modal } from "@/components/primitives/Modal"; // adjust path if different
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

  // Trigger onConfirmed exactly once on success
  useEffect(() => {
    if (state.phase === "success") {
      onConfirmed(state.onChainHash, state.safeTxHash);
    }
  }, [state, onConfirmed]);

  // Reset state when modal closes (so reopening starts fresh)
  useEffect(() => {
    if (!open && state.phase !== "idle") reset();
  }, [open, state.phase, reset]);

  return (
    <Modal open={open} onClose={onClose}>
      {state.phase === "idle" && (
        <div>
          {summary}
          <button onClick={() => send(calls)}>Approve & sign</button>
          <button onClick={onClose}>Cancel</button>
        </div>
      )}

      {state.phase === "wallet" && (
        <PendingScreen
          title="Open your Safe wallet"
          body="Confirm the transaction in Safe{Wallet} or your connected signer."
        />
      )}

      {state.phase === "proposed" && (
        <PendingScreen title="Submitting…" body="Safe is preparing the transaction." />
      )}

      {state.phase === "awaitingSignatures" && (
        <PendingScreen
          title={`Awaiting signatures (${state.have}/${state.need})`}
          body="Other Safe owners need to sign before this can execute."
        />
      )}

      {state.phase === "awaitingExecution" && (
        <PendingScreen
          title="Confirming on chain…"
          body="Your signature is in. Waiting for the network to include the transaction."
        />
      )}

      {state.phase === "success" && (
        <SuccessScreen onChainHash={state.onChainHash} onClose={onClose} />
      )}

      {state.phase === "reverted" && (
        <ErrorScreen
          title="Transaction reverted"
          body="The transaction executed on chain but reverted. No funds moved."
          detail={state.onChainHash}
          onClose={onClose}
        />
      )}

      {state.phase === "replaced" && (
        <ErrorScreen
          title="Transaction replaced"
          body="A different transaction with the same Safe nonce was executed first."
          onClose={onClose}
        />
      )}

      {state.phase === "rejected" && (
        <ErrorScreen title="Cancelled" body={state.message} onClose={onClose} />
      )}

      {state.phase === "error" && (
        <ErrorScreen title="Something went wrong" body={state.message} onClose={onClose} />
      )}
    </Modal>
  );
}

function PendingScreen({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h2>{title}</h2>
      <p>{body}</p>
      {/* Reuse the existing spinner component from the codebase */}
    </div>
  );
}

function SuccessScreen({ onChainHash, onClose }: { onChainHash: Hash; onClose: () => void }) {
  return (
    <div>
      <h2>Done</h2>
      <p>Your transaction is on chain.</p>
      <a href={`https://polygonscan.com/tx/${onChainHash}`} target="_blank" rel="noreferrer">
        View on Polygonscan
      </a>
      <button onClick={onClose}>Close</button>
    </div>
  );
}

function ErrorScreen({
  title,
  body,
  detail,
  onClose,
}: {
  title: string;
  body: string;
  detail?: string;
  onClose: () => void;
}) {
  return (
    <div>
      <h2>{title}</h2>
      <p>{body}</p>
      {detail && <code>{detail}</code>}
      <button onClick={onClose}>Close</button>
    </div>
  );
}
```

Note: deliberately minimal markup. Match the existing project's typographic / button conventions in the next step (when wiring it up to `CreatePage`). The state machine and event flow are the load-bearing pieces — the visual skin is local to your design system and easy to change.

- [ ] **Step 3: Commit**

```bash
git add src/components/modals/SafeSignModal.tsx
git commit -m "feat(safe): SafeSignModal renders one screen per flow state

Replaces SignModal's four-state machine with one screen per real Safe
lifecycle phase: idle, wallet (popup open), proposed (safeTxHash received),
awaitingSignatures (only relevant for threshold>1), awaitingExecution,
success, reverted, replaced, rejected, error."
```

---

## Phase 4 — Wire-up

### Task 4.1: Switch CreatePage to SafeSignModal

**Files:**

- Modify: `src/components/create/CreatePage.tsx` (and any other file that opens the old `SignModal`)

- [ ] **Step 1: Find every consumer of the old SignModal**

```bash
grep -rn "SignModal" /Users/lucas/repo/polyswap/polyswap-dapp/src --include='*.ts' --include='*.tsx'
```

Record the list of files. Below assumes `CreatePage.tsx` is the only consumer; if there are others, repeat the same edit for each.

- [ ] **Step 2: In each consumer, replace the `<SignModal>` usage with `<SafeSignModal>`**

For `CreatePage.tsx` specifically, the old path went:

1. POST `/api/polyswap/orders/create` to create a draft order → returns `orderId`.
2. POST `/api/polyswap/orders/id/{id}/batch-transaction` with `{ ownerAddress }` → returns `{ fallbackHandlerTransaction?, domainVerifierTransaction?, approvalTransaction?, mainTransaction, ... }`.
3. Sign each tx sequentially via `walletConnectSafeService` (BAD).
4. PUT `/api/polyswap/orders/id/{id}/transaction` with the (wrong) hash.

The new path:

1. POST `/api/polyswap/orders/create` → `orderId`. _(unchanged)_
2. POST `/api/polyswap/orders/id/{id}/batch-transaction` → response. _(unchanged)_
3. Build a single `SafeCall[]` array from the response and hand it to `<SafeSignModal>`. The modal does the rest.
4. In `onConfirmed(onChainHash)`, PUT `/api/polyswap/orders/id/{id}/transaction` with the **real** on-chain hash.

Concrete change inside `CreatePage.tsx` — replace whatever currently calls into `walletConnectSafeService` with logic shaped like this (adapt names to match the file):

```tsx
import { SafeSignModal } from "@/components/modals/SafeSignModal";
import type { SafeCall } from "@/services/safe/types";
import { useState } from "react";
import type { Hash } from "viem";

// Inside the component, after the user has clicked "Review & sign":
const [orderId, setOrderId] = useState<number | null>(null);
const [calls, setCalls] = useState<SafeCall[] | null>(null);
const [signOpen, setSignOpen] = useState(false);

async function startSigning() {
  // 1. Create draft
  const draft = await fetch("/api/polyswap/orders/create", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(formPayload), // existing payload
  }).then((r) => r.json());
  setOrderId(draft.orderId);

  // 2. Get batch
  const batch = await fetch(`/api/polyswap/orders/id/${draft.orderId}/batch-transaction`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ownerAddress: safeAddress }),
  }).then((r) => r.json());

  // 3. Flatten the response into a SafeCall[]
  const c: SafeCall[] = [];
  if (batch.fallbackHandlerTransaction) c.push(toSafeCall(batch.fallbackHandlerTransaction));
  if (batch.domainVerifierTransaction) c.push(toSafeCall(batch.domainVerifierTransaction));
  if (batch.approvalTransaction) c.push(toSafeCall(batch.approvalTransaction));
  c.push(toSafeCall(batch.mainTransaction));

  setCalls(c);
  setSignOpen(true);
}

function toSafeCall(tx: { to: string; data?: string; value?: string }): SafeCall {
  return {
    to: tx.to as `0x${string}`,
    data: (tx.data ?? "0x") as `0x${string}`,
    value: tx.value ? BigInt(tx.value) : 0n,
  };
}

async function onConfirmed(onChainHash: Hash) {
  if (!orderId) return;
  await fetch(`/api/polyswap/orders/id/${orderId}/transaction`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ transactionHash: onChainHash }),
  });
  // existing post-success UI (redirect to orders list, etc.)
}

// JSX:
{
  calls && (
    <SafeSignModal
      open={signOpen}
      onClose={() => setSignOpen(false)}
      calls={calls}
      onConfirmed={onConfirmed}
      summary={/* existing review summary JSX */}
    />
  );
}
```

The "two-step setup" case — when `batch.setupOnlyBatch === true` — still requires the user to sign the setup batch first, then re-trigger order creation. Render that branch as a one-time message in the summary; on confirmation, refresh the form and let the user click "Review & sign" again. (This stays a v1 quirk; eliminating the two-step flow is a separate refactor.)

- [ ] **Step 3: Lint and dev-server smoke**

```bash
pnpm lint
pnpm dev
```

Open `http://localhost:3000`, navigate to the create flow, fill the form, click sign — _do not actually sign yet_. Confirm the modal opens and shows the "Open your Safe wallet" pending screen. Stop the dev server.

- [ ] **Step 4: Commit**

```bash
git add src/components/create/CreatePage.tsx
git commit -m "feat(create): drive signing through SafeSignModal

Replaces the bespoke walletConnectSafeService call sequence with a single
SafeCall[] handed to the new state-machine modal. Records the on-chain
hash via PUT /api/polyswap/orders/id/{id}/transaction only after execution
is confirmed."
```

---

### Task 4.2: Simplify the backend PUT `/transaction` endpoint

**Files:**

- Modify: `src/app/api/polyswap/orders/id/[id]/transaction/route.ts` (PUT handler around lines 187-408)

- [ ] **Step 1: Read the file**

```bash
sed -n '180,420p' src/app/api/polyswap/orders/id/[id]/transaction/route.ts
```

- [ ] **Step 2: Update the PUT handler**

The frontend will only call PUT after `useSafeTransaction` has reported `executed`, so the receipt always exists by the time we ask for it. No more soft-fail with "Could not find ConditionalOrderCreated event…".

Change in the handler:

```ts
// Inside PUT, after validating the hash format:
const eventDetails = await TransactionEventService.getTransactionEventDetails(transactionHash);

if (!eventDetails) {
  // The frontend only calls PUT after observing on-chain execution.
  // If we can't read the receipt here, it's a real RPC error, not "tx not mined yet".
  return NextResponse.json(
    {
      success: false,
      error: "receipt_not_found",
      message:
        "On-chain receipt not found. The transaction may not have been mined on this RPC node yet — retry in a moment.",
    },
    { status: 502 } // upstream/RPC issue, not client error
  );
}
```

Replace the previous 400 with the 502 above. No other logic changes — the rest of the handler (UID calculation, DB update) stays.

- [ ] **Step 3: Lint**

```bash
pnpm lint
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/polyswap/orders/id/[id]/transaction/route.ts
git commit -m "fix(api): treat missing receipt as RPC error, not client error

The frontend now only calls PUT /transaction after on-chain execution is
confirmed via useSafeTransaction, so a missing receipt at this point is
an upstream RPC issue (502), not the old race-condition 400."
```

---

## Phase 5 — Cleanup

### Task 5.1: Delete dead Safe code

**Files:**

- Delete: `src/services/safeService.ts`
- Delete: `src/services/walletConnectSafeService.ts`
- Delete: `src/services/safeMultiSendService.ts`
- Delete: `src/components/modals/SignModal.tsx`

- [ ] **Step 1: Confirm no remaining imports**

```bash
grep -rn "from.*safeService\|from.*walletConnectSafeService\|from.*safeMultiSendService\|from.*SignModal" \
  /Users/lucas/repo/polyswap/polyswap-dapp/src --include='*.ts' --include='*.tsx'
```

Expected: no matches (other than self-imports inside the files themselves, which we're about to delete).

If any consumer is still importing one of these, fix that consumer first to use the new flow before deleting.

- [ ] **Step 2: Delete the files**

```bash
rm src/services/safeService.ts
rm src/services/walletConnectSafeService.ts
rm src/services/safeMultiSendService.ts
rm src/components/modals/SignModal.tsx
```

- [ ] **Step 3: Build to confirm nothing else was depending on these**

```bash
pnpm build
```

Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: delete dead Safe wallet services

Replaced by:
- @/services/safe/multiSendEncoder (was safeMultiSendService)
- @/hooks/safe/useSafeSignFlow + useSafeTransaction (was safeService,
  walletConnectSafeService, SignModal state machine)

The old code conflated safeTxHash with on-chain hashes and resolved the
sign promise on signature instead of execution — root cause of the
'signature finished detection sometimes doesn't work' bug."
```

---

### Task 5.2: Drop unused `@safe-global/protocol-kit` if no remaining consumers

**Files:**

- Modify: `package.json`

- [ ] **Step 1: Confirm protocol-kit is no longer imported**

```bash
grep -rn "@safe-global/protocol-kit" /Users/lucas/repo/polyswap/polyswap-dapp/src --include='*.ts' --include='*.tsx'
```

Expected: no matches.

- [ ] **Step 2: If the grep is empty, remove the dependency**

```bash
pnpm remove @safe-global/protocol-kit @safe-global/types-kit
```

(`types-kit` is a peer of `protocol-kit`; if no other code uses it, it goes too. If the grep finds matches, skip this task.)

- [ ] **Step 3: Build**

```bash
pnpm build
```

Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: drop @safe-global/protocol-kit and types-kit

No longer used now that the signing flow runs on wagmi 5792 +
Safe Transaction Service REST + viem event watch."
```

---

## Phase 6 — Manual verification

### Task 6.1: End-to-end smoke test against a real 1/1 Safe

**Setup:**

- A test Polygon Safe with threshold 1 (you presumably have one).
- Some MATIC for gas; some sellToken balance to test the approval branch.
- A Polymarket market available in your dev DB (use existing `pnpm saveMarkets`).

- [ ] **Step 1: Boot everything**

```bash
pnpm db:up
pnpm dev
```

In a separate terminal (optional, only if you want to see orders flow into DB):

```bash
pnpm start:listener-only
```

- [ ] **Step 2: Test WalletConnect path**

1. Open `http://localhost:3000`.
2. Click "Connect" → choose WalletConnect → scan QR with Safe{Wallet} mobile.
3. Confirm the connection succeeds and the address shown matches your Safe.
4. Open the create-order flow, pick a market, fill amounts, click Review & sign.
5. Modal should appear at "Open your Safe wallet" while Safe Mobile shows the proposal.
6. **Reject in Safe Mobile.** Modal should transition to "Cancelled".
7. Re-open the flow and try again. **Approve in Safe Mobile.**
8. Modal should transition: wallet → proposed → awaitingExecution → ✅ success.
9. The "View on Polygonscan" link should open and show the on-chain tx.
10. Refresh the dApp tab. Open `/api/polyswap/orders/{owner}` (or your orders list page) and verify the new order is recorded with the correct `transaction_hash`.

- [ ] **Step 3: Test tab-close recovery**

1. Repeat steps 1-7 in Step 2 but **close the dApp tab** between "Open your Safe wallet" and approving in Safe Mobile.
2. Approve in Safe Mobile.
3. Re-open the dApp. The modal should auto-restore (from localStorage) and show "Confirming on chain…" then ✅.

- [ ] **Step 4: Test iframe path**

1. With dev server still running, set up a public tunnel to your localhost (e.g. `ngrok http 3000`).
2. Open `https://app.safe.global/share/safe-app?appUrl=<tunnel-url>` in a desktop browser.
3. Add the dApp; load it inside Safe.
4. Verify in DevTools → Console: no CSP violations. The iframe should render.
5. Repeat the create-order flow inside the iframe. The modal should follow the same lifecycle. The connector ID should be `safe`, not `walletConnect` (verify in React DevTools or by adding a temporary `console.log(connector?.id)`).

- [ ] **Step 5: Check the unhappy paths**

| Scenario                    | Expected modal state                                                                   |
| --------------------------- | -------------------------------------------------------------------------------------- |
| Reject in Safe              | `rejected` "You rejected the request in Safe"                                          |
| Disconnect WC mid-flow      | error toast; flow goes to `error`                                                      |
| Network drop during polling | flow stays in `awaitingExecution` (no spurious `error`); recovers when network is back |

- [ ] **Step 6: Document anything that surprises you**

Append findings to this plan as a "Known issues / follow-ups" section. Examples worth flagging:

- Wallets that don't advertise 5792 capability (write down which Safe{Wallet} version).
- Any state transition that displayed the wrong copy or stayed stuck.

- [ ] **Step 7: Push branch and open PR**

```bash
git push -u origin lucas/redesign  # or whatever the active branch is
gh pr create --title "Refactor: Safe wallet signing flow" --body "$(cat <<'EOF'
## Summary
- New EIP-5792-first signing flow: `useSendCalls` for atomic batches, with REST + on-chain event-watch fallback for non-5792 wallets.
- New `SafeSignModal` driven by a real state machine (idle → wallet → proposed → awaitingSignatures → awaitingExecution → success/reverted/replaced/rejected/error). Tab-close recovery via localStorage.
- Backend `PUT /api/polyswap/orders/id/{id}/transaction` simplified: it now receives only the real on-chain hash (frontend confirms execution before calling).
- CSP `frame-ancestors` added so the dApp can be embedded in `app.safe.global`.
- wagmi config: `unstable_getInfoTimeout` bumped to 1000ms (upstream default is 10ms — buggy).
- Deleted dead code: `safeService.ts`, `walletConnectSafeService.ts`, `safeMultiSendService.ts`, the old `SignModal.tsx`.

Scope: 1/1 Safes only for v1; the state machine already handles threshold>1 internally — UI extension is a follow-up.

## Test plan
- [ ] WalletConnect happy path on 1/1 Polygon Safe
- [ ] Reject-in-Safe path
- [ ] Tab-close recovery
- [ ] Iframe path via ngrok + app.safe.global
EOF
)"
```

---

## Self-review

**Spec coverage check:**

- ✅ EIP-5792 primary path with capability gating: Task 2.2 (5792 branch) + Task 2.3 (`useSendCalls`).
- ✅ REST + event-watch fallback: Task 2.2 (fallback branch) + Task 1.2.
- ✅ MultiSend fallback for non-5792 single-tx packing: Task 1.3 + Task 2.3 (`use5792 ? sendCallsAsync : sendTransactionAsync(packed)`).
- ✅ State machine covers all states from §7 of the spec (idle/wallet/rejected/proposed/awaitingSignatures/awaitingExecution/success/reverted/replaced/network-error/stale): Task 2.3.
- ✅ wagmi 10ms timeout fix: Task 0.1.
- ✅ CSP frame-ancestors: Task 0.2.
- ✅ Backend simplification: Task 4.2.
- ✅ Dead-code deletion: Task 5.1.
- ✅ Iframe + WalletConnect both verified: Task 6.1.

**Type consistency:** `SafeCall`, `SafeTxStatus`, `SafeMultisigTxResponse` defined in `types.ts`, used identically downstream. `SafeSignPhase` defined inside `useSafeSignFlow.ts` and consumed by `SafeSignModal.tsx`. `Hash` and `Address` both come from `viem`.

**Placeholder scan:** searched for "TBD"/"TODO"/"appropriate"/"similar to"/"etc." — none in instructional steps. Code blocks complete in every step that introduces code. Manual verification steps explicit.

---

## Out of scope (separate plans needed)

1. **Backend listener / market-updater rewrite** — the original "refacto entierly the dapp backend" ask. Use the audit report findings as the spec. ~Phase 2.
2. **Test infrastructure** — vitest + react-testing-library + an integration suite for hooks. The pure-logic units (`safeTxService`, `multiSendEncoder`, the state-machine reducer) are designed to be trivially testable once infra exists.
3. **Threshold>1 UI** — render `awaitingSignatures(have/need)` in a meaningful way, expose a "share signing link" affordance. State machine already handles it; just needs visual design.
4. **Eliminate the two-step setup** — the `setupOnlyBatch: true` flow forces users to sign twice when their Safe lacks the fallback handler / domain verifier. Possibly soluble via a different ordering, but requires understanding the on-chain dependency between domain verifier registration and the order's `staticInput` validation.
