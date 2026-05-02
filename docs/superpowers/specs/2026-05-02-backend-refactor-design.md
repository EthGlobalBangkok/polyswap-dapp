# Backend & API Refactor — Design

**Status**: Draft, ready for user review.
**Date**: 2026-05-02
**Scope**: Frontend logic, API routes, backend services, and the blockchain listener for the PolySwap dApp. Excludes nothing in `src/` — but the existing Safe sign flow (`useSafeSignFlow` and friends) is already correct and is **not** being rewritten, only trimmed of the dead network calls around it.

---

## 1. Why this refactor

The backend grew organically. As of today:

- 20 API route files totalling **3,256 lines**, most of which are pure proxies of public APIs (CoW token lists, CoW prices, CoW quotes, Polymarket markets) or do work the listener already does.
- `databaseService.ts` is **1,255 lines** and mixes a market mirror with a real order ledger.
- A user clicking "create order" causes **4 sequential backend round-trips** before the wallet popup even shows.
- Several services overlap (e.g., `transactionEventService` and the listener both decode the same event log; order-hash calculation lives in 3 places).
- The signature flow has been hardened recently but still has dead network calls hanging off it (`PUT /transaction`).

The goal is **fewer round-trips, less code, less DB cost, no feature loss, search quality up**.

Hard constraint from the user: the protocol acts as a Polymarket operator. It places limit orders on Polymarket using protocol-owned CLOB credentials and pairs each one with the user's on-chain CoW conditional order. That role stays. (Optionally users may place their own Polymarket orders later — design should not preclude this.)

---

## 2. Target architecture (one picture)

```
┌──────────────────── FRONTEND ─────────────────────────────────────┐
│  hooks/useMarketsData     →  Polymarket Gamma (direct, CORS) +    │
│                               backend /markets/search (lean idx)  │
│  hooks/useTokens           →  CoW token list JSON   (direct)      │
│  hooks/useTokenPrice       →  CoW BFF              (direct)       │
│  hooks/useQuote            →  CoW quote API        (direct)       │
│  hooks/useCreateOrder      →  POST /api/polyswap/orders (1 call)  │
│  hooks/safe/useSafeSignFlow → wallet (unchanged)                  │
│  hooks/useRemoveOrder      →  ComposableCoW.remove + notify       │
└───────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌──────────────────── BACKEND (lean) ───────────────────────────────┐
│  Routes (4 only):                                                 │
│   GET    /api/markets/search                                      │
│   POST   /api/polyswap/orders                                     │
│   DELETE /api/polyswap/orders/{id}    (drafts only, sig required) │
│   POST   /api/polyswap/orders/{id}/notify-remove   (live → cancel)│
│   GET    /api/polyswap/orders/{owner}                             │
│   GET    /api/polyswap/orders/id/{id}                             │
│   GET    /api/polyswap/orders/hash/{hash}                         │
│   GET    /api/health                                              │
│                                                                   │
│  Services:                                                        │
│   databaseService          (~350 lines — was 1255)                │
│   polymarketAPIService     (~80 lines — metadata sync only)       │
│   polymarketOrderService   (server CLOB credentials, unchanged)   │
│   polymarketPositionSeller (unchanged scope)                      │
│   transactionEncodingService (returns calldata in POST /orders)   │
│   marketUpdateService      (~50 lines — simpler upsert loop)      │
│   draftJanitorService      (NEW, ~80 lines)                       │
│                                                                   │
│  Listener: (see Section 7)                                        │
└───────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌──────────────────── DATA SOURCES ─────────────────────────────────┐
│  PostgreSQL: 3 tables                                             │
│     markets        (lean search index — ~12MB max)                │
│     polyswap_orders (source of truth, listener writes)            │
│     sold_positions (protocol's own ledger)                        │
│  Polymarket Gamma + CLOB (live data, direct from client)          │
│  CoW Protocol APIs (tokens, prices, quotes — direct from client)  │
│  Polygon RPC (frontend signs, listener watches)                   │
└───────────────────────────────────────────────────────────────────┘
```

---

## 3. Markets — search-index backend

### Today

`marketUpdateService` mirrors Polymarket markets into PostgreSQL on a timer. 5 routes (`/markets/{route,search,top,[identifier],category/[category]}`). Search uses `LIKE '%foo%'`. Categories extracted server-side via regex.

### After

- DB stores **lean metadata only**: `id, slug, question, category, volume, liquidity, end_date, clob_token_ids, active`. Drop dynamic fields (outcome prices, order book) from DB entirely.
- Postgres `tsvector` on `question` for proper full-text search (quality bump for ~no code).
- **One** route: `GET /api/markets/search?q=&category=&volumeMin=&liquidityMin=&sort=&limit=&offset=` returns the lean metadata list. Replaces all 5 current `/markets/*` routes.
- Sync runs hourly (or daily — static fields). One upsert + one `removeEnded` pass. No per-field delta logic.
- Live data (prices, outcomes, depth) is fetched **directly by the client from Polymarket Gamma/CLOB**, with TanStack Query cache.

### Why this trade

The DB-as-mirror exists because Gamma doesn't natively support free-text search across `question` or your custom category taxonomy. Volume/liquidity filtering Gamma does support, but the search/category UX would regress without the DB. A lean index keeps that UX and costs ~12MB.

---

## 4. Tokens / quotes / prices — all client-side

| Today                                             | After                                                                     |
| ------------------------------------------------- | ------------------------------------------------------------------------- |
| `GET /api/tokens` (183L) → CoW token lists        | `useTokens()` fetches `https://files.cow.fi/tokens/CowSwap.json` directly |
| `GET /api/tokens/price` (121L) → CoW BFF          | `useTokenPrice()` hits CoW BFF directly                                   |
| `POST /api/polyswap/quote` (196L) → CoW quote API | `useQuote()` hits `https://api.cow.fi/{chain}/api/v1/quote` directly      |

Three backend routes and three services deleted. ~500 lines gone. Data is public, CORS-friendly, and CoW edge-cached.

---

## 5. Orders — single creation call, on-chain-driven cancel

### Hard constraint (recap)

The protocol places the Polymarket limit order with its own credentials. That MUST happen server-side. It must happen **before** the user signs on-chain (we need the polymarket order hash to attach to the on-chain order's app_data, and we want to fail fast if Polymarket placement fails).

### Creation — 1 round-trip

```
[client] POST /api/polyswap/orders   { form data, owner }
[server] validate
         place Polymarket limit order (protocol credentials)
         insert DB row, status=draft, polymarket_order_hash set
         return {
           orderId,
           polymarketHash,
           tx:      { to, data, value },          // bare createWithContext call
           batchTx: [approveCall, createCall],    // approve + createWithContext
           sellToken, sellAmount, vaultRelayer    // for the client allowance check
         }

[client] read allowance(safe, vaultRelayer) via useReadContract
         pick batchTx if allowance < sellAmount, else pick tx
         pass chosen calls to useSafeSignFlow.send()

[client] wait for receipt via wagmi useWaitForTransactionReceipt
[UI]     optimistically show "live" once receipt arrives

[listener]  catches ConditionalOrderCreated event
            updates DB row status=live, fills order_hash + order_uid
```

Replaces today's 4 round-trips: `POST /create` → `POST /polymarket` → `GET /transaction` → `PUT /transaction` (after signing).

### ERC20 approval handling

The CoW Protocol conditional order requires the user's Safe to have approved **GPv2VaultRelayer** (`0xC92E8bdf79f0507f65a392b0ab4667716BFE0110` on Polygon) to spend `sellToken` for at least `sellAmount`. Without it, the on-chain `createWithContext` call succeeds, the order registers, but **CoW Watcher's discrete fill tx reverts** at `transferFrom` — order never fills. This was an unhandled gotcha in the old flow: the `/batch-transaction` endpoint that bundled the approval was never wired into `services/api.ts`, so the bundle was built but never sent.

In the new flow, the backend returns both a bare `tx` and a `batchTx` (`[approve, createWithContext]`) in a single response. The client:

1. Reads `allowance(safe, vaultRelayer)` via `useReadContract`.
2. Picks `batchTx` if `allowance < sellAmount`, else `tx`.
3. Passes the chosen calls to `useSafeSignFlow.send()` — atomic via EIP-5792, MultiSend fallback otherwise.

**Approval amount = `maxUint256`** by default (standard CoW pattern). User approves once per sell-token, revokes via Safe UI if they want. Saves gas on every subsequent order using the same token.

### Gas estimation

No manual gas estimation in client code. Both `sendCallsAsync` (EIP-5792) and `sendTransactionAsync` (MultiSend fallback) auto-estimate against the actual outgoing transaction (the multisend bundle, not the inner calls). The previous "approvals caused gas issues" symptom traced to the unwired batch endpoint, not to a gas-estimation bug — the wallet was being asked to sign just `createWithContext` without an approval, which simulates fine but later fails at fill time.

Optional polish (UI-only, not required to ship): show a fee preview using viem's `simulateCalls` (atomic batch simulation that runs `[approve, create]` as one unit, so `create` sees `approve`'s state mutation). If we add this, do it in `hooks/useFeePreview` — keep it independent of the sign flow.

### Batching — already implemented

`useSafeSignFlow.send(calls)` already handles atomic batching:

- EIP-5792 atomic capability detected → `wallet_sendCalls` (Safe iframe + capable WalletConnect-Safe).
- Otherwise → `MultiSendCallOnly` via `multiSendEncoder.encodeMultiSend(calls)` with `sendTransactionAsync`.

No new infrastructure needed. The refactor just makes sure `batchTx` from `POST /orders` flows into this hook unchanged. The existing `safeBatchService.ts` (386L) becomes unused and can be deleted — its responsibilities split between the backend (which now returns the calldata in `POST /orders` instead of `/batch-transaction`) and `useSafeSignFlow` (which already handles the wallet-side dispatch).

### Re-using existing services

- `src/services/erc20ApprovalService.ts` — keep for `checkApproval` / `createApprovalTransaction`. Used by the new `POST /orders` server-side helper to build the approve call.
- `src/services/safeBatchService.ts` — **delete** entirely. Its job is now done by `POST /orders` (calldata assembly) + `useSafeSignFlow` (wallet dispatch).
- `src/services/safeFallbackHandlerService.ts`, `src/services/safeDomainVerifierService.ts` — review during implementation; if unused after `safeBatchService` deletion, also delete.

### "Live" gap UX

Between receipt-on-chain and listener-catches-event there's a ~3–10s window where DB still says `draft`. Frontend keeps a local "just created" cache for ~30s that overrides DB status. **No `PUT /transaction` endpoint** to fast-forward — listener is the source of truth.

### Draft janitor

Background sweep on the listener process. Every 60s, find DB rows with `status=draft AND created_at < now() - 10 minutes` and no matching on-chain event. For each, cancel the Polymarket order via clob-client, then delete the row. Protects the protocol from abandoned drafts.

### Cancellation

**Drafts (no on-chain order yet):**

```
[client] sign EIP-191 message: "Cancel draft {id} at {timestamp}"
[client] DELETE /api/polyswap/orders/{id}   { signature }
[server] verify signature against owner address (EIP-191 / EIP-1271)
         cancel Polymarket order
         delete draft row
```

**Live (on-chain orders):**

```
[client] call ComposableCoW.remove(orderHash) from wallet
[client] wait for receipt
[client] POST /api/polyswap/orders/{id}/notify-remove  { txHash }
[server] read tx receipt
         confirm to == ComposableCoW AND function selector == remove(bytes32) AND decoded orderHash matches
         cancel Polymarket order via clob-client
         mark DB status=canceled
```

No off-chain signature for live cancel — the tx receipt is the proof. ComposableCoW does **not** emit an event on `remove()`, so we cannot rely on the listener for this path (verified against `ComposableCoW.sol` source).

`signatureVerification.ts` stays but is only used for draft cancel.

---

## 6. Database schema after refactor

| Table             | Purpose                    | Notes                                                                                                                          |
| ----------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `markets`         | search index only          | lean fields (id, slug, question, category, volume, liquidity, end_date, clob_token_ids, active). `tsvector` index on question. |
| `polyswap_orders` | source of truth for orders | listener writes; tracks polymarket_order_hash, on-chain order_hash, order_uid, status, fill details.                           |
| `sold_positions`  | protocol's own ledger      | Polymarket position-sell records. Unchanged.                                                                                   |

`databaseService.ts` shrinks ~1,255 → ~350 lines. All market methods collapse into `searchMarkets(filters)`, `upsertMarket(market)`, `removeEnded()`.

---

## 7. Listener refactor

### What it does today (`src/backend/listener.ts`, 649 lines)

A single long-running process that does **five jobs at once**:

1. Watches `ConditionalOrderCreated` on `ComposableCoW` → upgrades draft DB rows to `live`, decodes `staticInput`, calculates order hash + UID.
2. Watches `Trade` on GPv2Settlement → matches against PolySwap orders, marks `filled`, triggers position selling.
3. Watches `OrderInvalidated` → marks orders canceled.
4. Runs `MarketUpdateService` cron (every 60min) — Polymarket metadata sync.
5. Runs `PolymarketPositionSellerService` cron (every 5min) — sells positions after fills.

Plus on-startup `updateOrderUids()` to backfill missing UIDs, plus custom reconnect logic, plus polling-based "real-time" event subscription.

### Issues

| Issue                                   | Detail                                                                                                                    |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Mixed concerns in one file**          | 649 lines: bootstrap + connection + 3 event handlers + decoder + UID backfill + cron orchestration.                       |
| **Polling instead of WebSocket**        | `startRealTimeListener` polls every N blocks. Adds RPC pressure; introduces lag.                                          |
| **Custom reconnect logic**              | ~25 lines hand-rolled, when transports have this built-in.                                                                |
| **`calculateOrderHash` duplicated**     | Lives in 3 places: listener, `transactionEventService`, `transactionEncodingService`.                                     |
| **`ethers` while frontend uses `viem`** | Two ABI encoders, two type systems. Plus ethers v5 leaks in via old clob-client.                                          |
| **Decoder co-located with listener**    | `decodePolyswapStaticInput` is 70 lines inside the listener class — should be a pure utility, shared with `POST /orders`. |
| **No clear lifecycle separation**       | Crons start inside `main()` alongside event listeners with no isolation.                                                  |

### Decisions (locked in)

| Decision                  | Choice                                                                | Rationale                                                                                                                                           |
| ------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Event subscription** | **WebSocket** via viem `webSocket()` transport + `watchContractEvent` | Instant event delivery, less RPC quota, transport handles reconnect. Requires WSS endpoint — Alchemy / dRPC / QuickNode all support it on Polygon.  |
| **B. Viem migration**     | **Yes — full backend migration to viem**                              | clob-client 5.x is now viem-native, so the only blocker is gone. Unifies stack with frontend, drops ethers v5 transitively, centralizes ABI/typing. |
| **C. Process layout**     | **Single process**                                                    | Simpler ops; crons are lightweight. Existing standalone scripts (`start:market-updater-standalone`, etc.) stay as escape hatches.                   |

### Required dependency changes

- `@polymarket/clob-client@^4.20.0` → `@polymarket/clob-client@^5.8.1`
  - Drops ethers v5 from runtime (becomes a clob-client devDep only)
  - Drops `@polymarket/order-utils` transitively (no longer used)
  - Construction changes: ethers v5 `Wallet` → viem `WalletClient`
  - Polymarket CTF Exchange V2 support (current clob-client 4.x has limited V2)
- After this bump, **ethers v5 is completely gone** from the dependency tree.
- `ethers@^6.15.0` is **kept** for now where viem migration is non-trivial (e.g., signature verification utilities), but every place where it's used in backend gets migrated.

### Target structure

```
src/backend/listener/
  index.ts                       # entry point — pnpm start:listener
                                 # bootstraps the process, signal handling, wiring
                                 # ~80 lines
  blockchainProvider.ts          # viem PublicClient + WalletClient setup
                                 # WebSocket transport with auto-reconnect
                                 # ~60 lines
  eventDecoder.ts                # pure utilities: decodeStaticInput,
                                 # calculateOrderHash, calculateOrderUid
                                 # SHARED with POST /orders endpoint
                                 # ~120 lines
  handlers/
    conditionalOrderCreated.ts   # ~80 lines
    trade.ts                     # ~60 lines
    orderInvalidated.ts          # ~40 lines
  startup/
    backfillOrderUids.ts         # ~50 lines
    catchupHistoricalEvents.ts   # ~80 lines (uses getLogs over [lastProcessedBlock, currentBlock])
  cron/
    draftJanitor.ts              # NEW — cancels Polymarket orders for drafts >10min old
                                 # ~80 lines, runs every 60s
    marketSync.ts                # wraps simplified MarketUpdateService
                                 # ~30 lines
    positionSeller.ts            # wraps PolymarketPositionSellerService
                                 # ~30 lines
```

~700 lines total, but each file ≤120 lines and has one job. The 3-place duplicate `calculateOrderHash` collapses into `eventDecoder.ts` and is reused by `POST /orders`.

### Event subscription pattern (viem)

```ts
const publicClient = createPublicClient({
  chain: polygon,
  transport: webSocket(process.env.RPC_URL_WSS),
});

publicClient.watchContractEvent({
  address: COMPOSABLE_COW,
  abi: composableCowAbi,
  eventName: "ConditionalOrderCreated",
  onLogs: (logs) => logs.forEach(handleConditionalOrderCreated),
});
```

The transport handles reconnects. No custom `reconnect()` method needed.

### Catch-up on startup

On boot:

1. Read `last_processed_block` from DB.
2. `getLogs` for the missed range (`[last_processed_block, currentBlock]`) for all three event types.
3. Process each log through the same handler functions used for live events. Keep the handlers idempotent (insert-or-update on order_hash) so replay is safe.
4. After catch-up, switch to WebSocket subscriptions for live events.

### Draft janitor

Runs every 60s. Pseudocode:

```ts
const stale = await db.findStaleDrafts({ olderThan: minutes(10) });
for (const draft of stale) {
  const onChainExists = await composableCow.read.singleOrders([draft.owner, draft.orderHash]);
  if (!onChainExists) {
    await polymarketOrderService.cancelOrder(draft.polymarket_order_hash);
    await db.deleteDraft(draft.id);
  }
}
```

Cheap (a multicall + a DELETE). Keeps the protocol from leaving open Polymarket orders for abandoned drafts.

### Centralized order-hash utility

`eventDecoder.ts` exports:

```ts
export function calculateOrderHash(params: ConditionalOrderParams): Hex;
export function decodeStaticInput(staticInput: Hex): PolyswapOrderData;
export function buildPolyswapOrderData(form: CreateOrderForm): PolyswapOrderData;
```

Used by:

- `handlers/conditionalOrderCreated.ts` (decode incoming events)
- `app/api/polyswap/orders/route.ts` (compute expected order_hash for the new draft)

### What this kills

- Custom `reconnect()` method (transport handles it)
- 3-place `calculateOrderHash` duplication
- All ethers v5 in production runtime
- All `transactionEventService.ts` (only used by the deleted `PUT /transaction` route)

### What stays

- `polymarketOrderService.ts` — same shape, viem-based wallet construction
- `polymarketPositionSellerService.ts` — same scope
- `MarketUpdateService` — simpler, but same purpose
- `OrderUidCalculationService` — internals move into `eventDecoder.ts`, public API absorbed

---

## 8. Frontend API client refactor

### Today

`src/services/api.ts` is 506 lines and proxies everything (markets, tokens, quotes, orders).

### After

```
src/services/api/
  polyswap.ts      # POST /orders, DELETE /orders/{id}, POST /orders/{id}/notify-remove,
                   # GET /orders/{owner}, GET /orders/{id}, GET /orders/hash/{hash}
                   # ~120 lines
  markets.ts       # GET /markets/search (lean backend route)
                   # ~40 lines
  cow.ts           # direct CoW client (token list, quote, price)
                   # ~80 lines
  polymarket.ts    # direct Polymarket Gamma / CLOB client (live market data)
                   # ~60 lines
```

Total ~300 lines, split by destination. Old `convertBackendMarket` shape conversion gone — markets come in two shapes (lean from backend search, full from Polymarket direct), each consumed where it makes sense.

---

## 9. Signature flow

`useSafeSignFlow` (and `useSafeAccount`, `useSafeTransaction`, `multiSendEncoder`) is correct and stays. Refactor's contribution:

- Removes the post-sign `PUT /transaction` round-trip from `useCreateOrder` — `useWaitForTransactionReceipt` + the local "just created" cache replace it.
- `useSignAction` shrinks to draft-cancel only (one EIP-191 message: `"Cancel draft order {id} at {timestamp}"`).
- Live cancel path no longer needs `useSignAction` — uses `useWriteContract` for `ComposableCoW.remove()` then a single notify call.

The wallet UX itself is unchanged — same modal, same flow.

---

## 10. CoW Protocol verification (key facts)

Verified against the official docs and `ComposableCoW.sol` source on 2026-05-02:

- ✅ `createWithContext(params, valueFactory, data, dispatch)` is the function the existing repo encodes — correct.
- ✅ `ConditionalOrderCreated(address indexed owner, ConditionalOrderParams params)` event signature confirmed. Emitted only when `dispatch == true`.
- ✅ Order hash convention: `keccak256(abi.encode(handler, salt, staticInput))` — matches `remove()` arg.
- ✅ Safe + EIP-5792: `msg.sender` inside `create()` is the Safe address, owner is correctly the Safe.
- ✅ `@polymarket/clob-client` `postOrder` returns `orderID` we can store. `cancelOrder(orderID)` works for the API-key holder. `getOrder(orderID)` returns status + `size_matched` for the janitor.
- ✅ Polymarket rate limits: 3,500 cancels / 10s — way more than we need.
- ⚠️ **`ComposableCoW.remove()` emits no event** — that's why live cancel goes through `POST /notify-remove` (frontend-driven, server verifies tx receipt).
- ⚠️ Polygon `ComposableCoW` address `0xfdaFc9d1902f4e0b84f65F49f244b32b31013b74` is canonical CREATE2 but absent from the official `composable-cow/networks.json`. Verify on Polygonscan during migration.

---

## 11. What gets deleted

| Item                                                                                                                 | Reason                                                                                                               |
| -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `POST /api/polyswap/orders/create`                                                                                   | folded into `POST /orders`                                                                                           |
| `POST /api/polyswap/orders/polymarket`                                                                               | folded into `POST /orders`                                                                                           |
| `GET /api/polyswap/orders/id/[id]/transaction`                                                                       | calldata returned in `POST /orders`                                                                                  |
| `PUT /api/polyswap/orders/id/[id]/transaction`                                                                       | listener handles it; frontend optimistic                                                                             |
| `POST /api/polyswap/orders/id/[id]/batch-transaction`                                                                | folded into `POST /orders` (returns both `tx` and `batchTx`)                                                         |
| `src/services/safeBatchService.ts` (386L)                                                                            | replaced by `POST /orders` server calldata + `useSafeSignFlow` client dispatch                                       |
| `POST /api/polyswap/orders/remove` (entire route)                                                                    | drafts → `DELETE /api/polyswap/orders/{id}`, live → on-chain remove + `POST /api/polyswap/orders/{id}/notify-remove` |
| `PUT /api/polyswap/orders/remove`                                                                                    | same as above — entire `remove/route.ts` file is deleted                                                             |
| `GET /api/markets/route`, `/markets/category/[category]`, `/markets/search`, `/markets/[identifier]`, `/markets/top` | one `/markets/search` route                                                                                          |
| `GET /api/tokens`                                                                                                    | client direct to CoW                                                                                                 |
| `GET /api/tokens/price`                                                                                              | client direct to CoW BFF                                                                                             |
| `POST /api/polyswap/quote`                                                                                           | client direct to CoW quote API                                                                                       |
| `convertBackendMarket` in `services/api.ts`                                                                          | not needed, two shapes handled separately                                                                            |
| Most market methods in `databaseService.ts`                                                                          | collapse to `searchMarkets` + `upsertMarket` + `removeEnded`                                                         |

---

## 12. Code-size impact (estimated)

| Layer                                | Today  | After | Δ            |
| ------------------------------------ | ------ | ----- | ------------ |
| API routes (`src/app/api/`)          | 3,256L | ~900L | −2,300L      |
| `services/api.ts`                    | 506L   | ~300L | −200L        |
| `databaseService.ts`                 | 1,255L | ~350L | −900L        |
| Tokens/quotes/prices server services | ~440L  | 0     | −440L        |
| **Total**                            |        |       | **~−3,800L** |

Plus quality wins: search uses `tsvector`, single creation round-trip, consistent hooks, less surface area to break.

---

## 13. What is NOT touched

- Polymarket order placement and position seller services — only used by new flow, no internals change.
- `useSafeSignFlow` and Safe internals — already correct after recent refactor.
- DB migrations — user resets the DB rather than migrating.

---

## 14. Open questions / follow-ups

- Confirm `ComposableCoW` bytecode at `0xfdaFc9d1902f4e0b84f65F49f244b32b31013b74` exists on Polygon (Polygonscan check during migration). : Yes i confirm
- Confirm production Polymarket orders are still placed against CTF Exchange V1 vs V2 — clob-client 5.x supports both, but the EIP-712 domain differs. Probably fine but worth verifying before bumping in prod. : the polymarket contracts and used token has been changed but for now i only refacto the app to make it work like on the last polymarket version. one thing at a time.
- Decide which RPC provider to use for WebSocket subscriptions on Polygon (Alchemy / dRPC / QuickNode) and add a `RPC_URL_WSS` env var. : I will use drpc
- Janitor cadence: starting at 60s; can be tuned later. : need to be an env var or something easly modified.
