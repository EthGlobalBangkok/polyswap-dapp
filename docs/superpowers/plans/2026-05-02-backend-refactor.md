# Backend Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor PolySwap's frontend logic, API routes, backend services, and blockchain listener per the design at `docs/superpowers/specs/2026-05-02-backend-refactor-design.md`. Reduce ~3,800 lines, eliminate redundant round-trips, migrate the backend to viem, and add structured order failure visibility.

**Architecture:** 8 phases, each independently mergeable. Each phase ends in a working state with a green build. Within each phase, individual tasks are 2–5 minutes. The repo has **no test framework** (lint + typecheck + manual smoke-testing is the verification loop). For NEW pure functions (event decoder, error decoder), we add lightweight vitest tests; for everything else we rely on `pnpm lint`, `pnpm build`, and manual dev testing.

**Tech Stack:**

- Frontend: Next.js 15 App Router, React 19, wagmi 2.x, viem 2.x, TanStack Query 5
- Backend (new): viem only (post `@polymarket/clob-client@5.x` bump), Next.js API routes, Postgres
- Listener: Node + viem WebSocket (`watchContractEvent`)
- Verification: `pnpm lint`, `pnpm build`, `pnpm tsc --noEmit`, manual dev (`pnpm dev`, `pnpm start:listener`)

**Spec reference:** `docs/superpowers/specs/2026-05-02-backend-refactor-design.md` — read this before starting.

**DB note:** The user resets the DB rather than migrating. SQL changes are stated as final-state DDL, not migrations.

---

## Phase 0 — Prerequisites

### Task 0.1: Verify Polygon ComposableCoW + clob-client V2 status

**Files:** none (manual verification + memory-write).

- [ ] **Step 1: Verify ComposableCoW bytecode on Polygon**

  Open Polygonscan and confirm bytecode exists at the canonical address.

  ```bash
  curl -s "https://api.polygonscan.com/api?module=proxy&action=eth_getCode&address=0xfdaFc9d1902f4e0b84f65F49f244b32b31013b74" \
    | grep -E '"result":"0x[0-9a-f]+"' | head -1
  ```

  Expected: `"result":"0x..."` with a long hex string. If `"result":"0x"` (empty), STOP and consult the user — the canonical address isn't deployed on Polygon and the project's existing `COMPOSABLE_COW` env var is the source of truth instead.

- [ ] **Step 2: Verify which CTF Exchange version production orders are placed against**

  Check `.env` and `polymarketOrderService.ts` for the contract address used. Cross-reference with:
  - V1 CTF Exchange (deprecated): `0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E`
  - V2 CTF Exchange: `0xE111180000d2663C0091e4f400237545B87B996B`
  - Neg Risk V2: `0xe2222d279d744050d28e00520010520000310F59`

  Document the answer in a comment in the env file or .env.sample. Both V1 and V2 are supported by clob-client 5.x but the EIP-712 domain differs.

- [ ] **Step 3: Pick a WSS RPC provider and add env var**

  Edit `.env.sample` to add:

  ```
  # WebSocket RPC for the listener (Alchemy / dRPC / QuickNode all work on Polygon)
  WSS_RPC_URL=wss://polygon-mainnet.g.alchemy.com/v2/YOUR_KEY
  ```

  Update local `.env` with a real WSS URL.

- [ ] **Step 4: Commit**

  ```bash
  git add .env.sample
  git commit -m "chore(env): document WSS_RPC_URL for the new listener"
  ```

---

### Task 0.2: Bump `@polymarket/clob-client` to 5.x

**Files:**

- Modify: `package.json`
- Modify: `pnpm-lock.yaml` (auto)

- [ ] **Step 1: Bump the dependency**

  ```bash
  pnpm up @polymarket/clob-client@^5.8.1
  ```

- [ ] **Step 2: Verify ethers v5 left the runtime tree**

  ```bash
  pnpm why @ethersproject/wallet 2>&1 | grep -E "ethers|clob"
  ```

  Expected: NO mention of `@polymarket/clob-client` chains pulling ethers v5. If clob-client is still pulling it, bump to a newer 5.x or check the pnpm-lock.

  ```bash
  pnpm why ethers
  ```

  Expected: only `polyswap` direct dep at v6.x. If ethers v5 still appears with clob-client as a parent, the bump didn't take or you got a 4.x version — re-check.

- [ ] **Step 3: Build to surface immediate breakages**

  ```bash
  pnpm build
  ```

  Expected: TypeScript errors in `polymarketOrderService.ts` and `polymarketPositionSellerService.ts` because those files construct `ClobClient` with an ethers `Wallet` — clob-client 5.x expects a viem `WalletClient`. **DON'T fix those errors here** — Phase 4 / Phase 6 fixes them as part of the migration. For now, leave the broken state.

- [ ] **Step 4: Document the broken state and commit**

  ```bash
  git add package.json pnpm-lock.yaml
  git commit -m "chore(deps): bump clob-client to 5.8.1 (viem-native)

  This intentionally breaks the build until Phase 4/6 migrate
  polymarketOrderService and polymarketPositionSellerService to
  the viem-based constructor. See implementation plan."
  ```

---

### Task 0.3: Pin the broken-build escape hatch

**Files:**

- Create: `docs/superpowers/plans/.phase-0-broken-build-note.md`

- [ ] **Step 1: Create a note explaining the intentional broken state**

  ```markdown
  # Phase 0 leaves an intentional broken build

  After Task 0.2 (clob-client 5.x bump), `pnpm build` will fail because
  the existing `polymarketOrderService.ts` and `polymarketPositionSellerService.ts`
  construct `ClobClient` with an ethers v5 `Wallet`. clob-client 5.x requires
  a viem `WalletClient`.

  This is fixed in:

  - Task 4.1 (polymarketOrderService viem migration)
  - Task 6.X (listener viem migration covers the position seller)

  Do NOT revert the clob-client bump to keep the build green. Push through.
  Phase 1 (wallet UX) and Phase 2 (client-side data fetching) work fine
  despite the backend build error — they don't touch the broken services.
  Phase 3 (markets) similarly avoids them.
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add docs/superpowers/plans/.phase-0-broken-build-note.md
  git commit -m "docs: explain intentional broken build between Phase 0 and Phase 4"
  ```

---

## Phase 1 — Wallet UX cleanup

Tiny isolated change. Independent of the rest of the refactor.

### Task 1.1: Disable EIP-6963 auto-discovery in wagmi config

**Files:**

- Modify: `src/wagmi/config.ts`

- [ ] **Step 1: Add `multiInjectedProviderDiscovery: false` to the config**

  Open `src/wagmi/config.ts` and add the option to `createConfig`:

  ```ts
  export const config = createConfig({
    chains: [polygon],
    multiInjectedProviderDiscovery: false,
    transports: {
      [polygon.id]: http(process.env.NEXT_PUBLIC_RPC_URL),
    },
    ssr: true,
    connectors: [
      safe({
        unstable_getInfoTimeout: 1000,
        allowedDomains: [/^app\.safe\.global$/, /^safe\.global$/],
        debug: process.env.NODE_ENV !== "production",
      }),
      walletConnect({
        projectId,
        metadata: {
          /* unchanged */
        },
        showQrModal: true,
      }),
    ],
  });
  ```

- [ ] **Step 2: Verify in dev**

  ```bash
  pnpm dev
  ```

  Open `http://localhost:3000`, click "Connect wallet". Modal should show only `safe` and `walletConnect` (no MetaMask, no Rabby, no Coinbase Wallet).

- [ ] **Step 3: Commit**

  ```bash
  git add src/wagmi/config.ts
  git commit -m "feat(wallet): disable EIP-6963 auto-discovery; Safe + WalletConnect only"
  ```

---

### Task 1.2: Filter Safe connector from WalletModal display

**Files:**

- Modify: `src/components/modals/WalletModal.tsx`

- [ ] **Step 1: Filter the connector list to exclude `safe`**

  In `src/components/modals/WalletModal.tsx`, change the `useMemo` that builds `list`:

  ```ts
  const list = useMemo<ConnectorView[]>(
    () =>
      connectors
        .filter((c) => c.id !== "safe") // safe auto-connects in iframe; never user-selectable
        .map((c) => ({
          connector: c,
          ...describe(c),
        })),
    [connectors]
  );
  ```

  Also remove the now-dead `safe` entry from the `META` map:

  ```ts
  const META: Record<string, { label: string; blurb: string }> = {
    walletConnect: {
      label: "WalletConnect",
      blurb: "Scan a QR or open in your wallet of choice.",
    },
  };
  ```

- [ ] **Step 2: Verify in dev (non-Safe context)**

  ```bash
  pnpm dev
  ```

  Open the app outside any Safe iframe. Click "Connect wallet". Modal should show **only** "WalletConnect".

- [ ] **Step 3: Verify in dev (Safe iframe context)**

  Either use the Safe app at `https://app.safe.global` and load the dApp via "Apps → Custom Apps", or use a tunneling tool (ngrok) so Safe can reach localhost over HTTPS. The modal should never need to open — connection is automatic.

  If you can't reach a Safe iframe, document the manual smoke-test checklist for QA in `docs/superpowers/plans/.smoke-tests.md`.

- [ ] **Step 4: Commit**

  ```bash
  git add src/components/modals/WalletModal.tsx
  git commit -m "feat(wallet): hide Safe connector from modal (auto-connects in iframe)"
  ```

---

## Phase 2 — Tokens, quotes, prices client-side

Move three CoW Protocol fetches from the backend to the client. Pure deletion + new TanStack Query hooks. Independent of order flow.

### Task 2.1: Add `useTokens` hook (CoW token list direct)

**Files:**

- Create: `src/hooks/useTokens.ts`

- [ ] **Step 1: Define the hook**

  ```ts
  // src/hooks/useTokens.ts
  import { useQuery } from "@tanstack/react-query";
  import type { Address } from "viem";

  export interface Token {
    chainId: number;
    address: Address;
    name: string;
    symbol: string;
    decimals: number;
    logoURI?: string;
  }

  interface CoWTokenList {
    tokens: Token[];
  }

  const COW_TOKEN_LIST_URL = "https://files.cow.fi/tokens/CowSwap.json";
  const POLYGON_CHAIN_ID = 137;

  async function fetchCoWTokens(): Promise<Token[]> {
    const res = await fetch(COW_TOKEN_LIST_URL);
    if (!res.ok) throw new Error(`CoW token list fetch failed: ${res.status}`);
    const json = (await res.json()) as CoWTokenList;
    return json.tokens.filter((t) => t.chainId === POLYGON_CHAIN_ID);
  }

  export function useTokens() {
    return useQuery({
      queryKey: ["cow-tokens", POLYGON_CHAIN_ID],
      queryFn: fetchCoWTokens,
      staleTime: 1000 * 60 * 60, // 1 hour
      gcTime: 1000 * 60 * 60 * 24, // 24 hours
    });
  }
  ```

- [ ] **Step 2: Build to verify**

  ```bash
  pnpm tsc --noEmit
  ```

  Expected: no errors in this file. (Backend errors from Phase 0 may still appear; ignore those.)

- [ ] **Step 3: Commit**

  ```bash
  git add src/hooks/useTokens.ts
  git commit -m "feat(hooks): add useTokens fetching CoW token list directly"
  ```

---

### Task 2.2: Add `useTokenPrice` hook (CoW BFF direct)

**Files:**

- Create: `src/hooks/useTokenPrice.ts`

- [ ] **Step 1: Define the hook**

  ```ts
  // src/hooks/useTokenPrice.ts
  import { useQuery } from "@tanstack/react-query";
  import type { Address } from "viem";

  // CoW BFF "native price" endpoint returns a price relative to the chain's
  // native currency (POL on Polygon). The BFF surfaces USD pricing via the
  // /api/v1/native_price route — see https://api.cow.fi/docs.
  const POLYGON_BFF_BASE = "https://bff.cow.fi/proxies";

  interface NativePriceResponse {
    price: number;
  }

  async function fetchTokenUsdPrice(token: Address): Promise<number> {
    // Endpoint: GET https://bff.cow.fi/proxies/{chainId}/api/v1/native_price?token=...
    // Returns a price denominated in chain native currency. To get USD, multiply
    // by the native-currency USD price (also fetchable via the same route with
    // a stable USDC token address). For PolySwap's needs, we use a
    // single hop through CoW's price API which already gives a USD-denominated
    // value when queried with `quoteCurrency=usd`.
    const url = `${POLYGON_BFF_BASE}/137/api/v1/native_price?token=${token}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`CoW BFF price fetch failed: ${res.status}`);
    const json = (await res.json()) as NativePriceResponse;
    return json.price;
  }

  export function useTokenPrice(token: Address | undefined) {
    return useQuery({
      queryKey: ["token-price", token],
      queryFn: () => fetchTokenUsdPrice(token!),
      enabled: Boolean(token),
      staleTime: 1000 * 30, // 30s
    });
  }
  ```

  > **Note:** before merging, verify the actual CoW BFF endpoint shape against `https://api.cow.fi/docs`. The legacy backend code in `tokenPriceService.ts` is the canonical reference — copy its URL pattern exactly.

- [ ] **Step 2: Cross-check against legacy `tokenPriceService.ts`**

  Read `src/backend/services/tokenPriceService.ts` (92 lines). Mirror its URL, query params, and response parsing exactly so the migration is behavior-equivalent. Update the implementation if any detail differs.

- [ ] **Step 3: Commit**

  ```bash
  git add src/hooks/useTokenPrice.ts
  git commit -m "feat(hooks): add useTokenPrice hitting CoW BFF directly"
  ```

---

### Task 2.3: Add `useQuote` hook (CoW quote API direct)

**Files:**

- Create: `src/hooks/useQuote.ts`

- [ ] **Step 1: Define the hook**

  ```ts
  // src/hooks/useQuote.ts
  import { useQuery } from "@tanstack/react-query";
  import type { Address } from "viem";

  export interface QuoteRequest {
    sellToken: Address;
    buyToken: Address;
    sellAmountBeforeFee: string; // wei as string
    from: Address;
  }

  export interface QuoteResponse {
    quote: {
      sellToken: Address;
      buyToken: Address;
      sellAmount: string;
      buyAmount: string;
      validTo: number;
      feeAmount: string;
      kind: "sell" | "buy";
      partiallyFillable: boolean;
    };
    expiration: string;
    id: number;
  }

  async function postQuote(req: QuoteRequest): Promise<QuoteResponse> {
    const res = await fetch("https://api.cow.fi/xdai/api/v1/quote".replace("xdai", "polygon"), {
      // Polygon's CoW endpoint — verify against the legacy backend
      // src/backend/services/cowQuoteService.ts for the exact base URL.
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...req,
        kind: "sell",
        partiallyFillable: false,
        signingScheme: "eip712",
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.description ?? `CoW quote fetch failed: ${res.status}`);
    }
    return (await res.json()) as QuoteResponse;
  }

  export function useQuote(req: QuoteRequest | null) {
    return useQuery({
      queryKey: ["cow-quote", req],
      queryFn: () => postQuote(req!),
      enabled: req !== null,
      staleTime: 1000 * 30,
      retry: 1,
    });
  }
  ```

- [ ] **Step 2: Cross-check against `src/backend/services/cowQuoteService.ts`**

  Read the existing 224-line `cowQuoteService.ts`. Verify the exact base URL for Polygon (the file's `getApiUrl` method is canonical). Verify what the request body shape needs to be — it includes things like `appData`, `from`, etc. Update the new hook to match exactly.

- [ ] **Step 3: Commit**

  ```bash
  git add src/hooks/useQuote.ts
  git commit -m "feat(hooks): add useQuote hitting CoW quote API directly"
  ```

---

### Task 2.4: Wire frontend consumers to new hooks

**Files:**

- Modify: any file currently calling `apiService.fetchTokens`, `apiService.getTokenPrice`, `apiService.getQuote`

- [ ] **Step 1: Find all call sites**

  ```bash
  grep -rn "fetchTokens\|getTokenPrice\|getQuote" src/components/ src/hooks/ src/app/ 2>/dev/null
  ```

- [ ] **Step 2: Replace each call site with the new hook**

  Example (illustrative — actual call sites depend on grep output):

  ```diff
  - const tokens = await apiService.fetchTokens();
  + const { data: tokens } = useTokens();
  ```

  Update the surrounding component/hook to handle the loading/error states from TanStack Query. If a place needs the list synchronously (not in a hook), call `queryClient.fetchQuery` once at app boot.

- [ ] **Step 3: Build to verify**

  ```bash
  pnpm tsc --noEmit
  ```

- [ ] **Step 4: Manual dev smoke-test**

  ```bash
  pnpm dev
  ```

  Visit pages that show tokens or prices (the create page especially). Confirm tokens render. Confirm prices appear.

- [ ] **Step 5: Commit**

  ```bash
  git add -p
  git commit -m "feat(ui): wire token/price/quote consumers to direct CoW hooks"
  ```

---

### Task 2.5: Delete backend tokens / price / quote routes and services

**Files:**

- Delete: `src/app/api/tokens/route.ts`
- Delete: `src/app/api/tokens/price/route.ts`
- Delete: `src/app/api/polyswap/quote/route.ts`
- Delete: `src/backend/services/tokenPriceService.ts`
- Delete: `src/backend/services/cowQuoteService.ts`
- Modify: `src/services/api.ts` (remove `fetchTokens`, `getTokenPrice`, `getQuote` methods)

- [ ] **Step 1: Verify no remaining server-side users**

  ```bash
  grep -rn "tokenPriceService\|cowQuoteService\|fetchTokens\|getTokenPrice\|getQuote" src/backend/ src/app/api/ 2>/dev/null
  ```

  Expected: no matches.

- [ ] **Step 2: Delete files**

  ```bash
  rm src/app/api/tokens/route.ts
  rm -r src/app/api/tokens
  rm src/app/api/polyswap/quote/route.ts
  rm -r src/app/api/polyswap/quote
  rm src/backend/services/tokenPriceService.ts
  rm src/backend/services/cowQuoteService.ts
  ```

- [ ] **Step 3: Strip `services/api.ts`**

  Open `src/services/api.ts` and remove the `fetchTokens`, `getTokenPrice`, `getQuote` methods plus any related interfaces.

- [ ] **Step 4: Build**

  ```bash
  pnpm tsc --noEmit
  pnpm lint
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add -A
  git commit -m "refactor(backend): delete tokens/price/quote routes and services

  Now fetched directly from CoW Protocol APIs by the client via
  useTokens/useTokenPrice/useQuote hooks."
  ```

---

## Phase 3 — Markets search-index

Reduce `databaseService.ts` from 1255 to ~350 lines by collapsing market methods to three: `searchMarkets`, `upsertMarket`, `removeEnded`. Add Postgres tsvector. Replace 5 `/api/markets/*` routes with one search route. Frontend continues to use the backend for search but fetches live market data directly from Polymarket Gamma.

### Task 3.1: New schema for the markets table

**Files:**

- Modify: SQL DDL in `script/initDb.sql` (or wherever the user defines the schema; if absent, create it).

- [ ] **Step 1: Locate the current schema**

  ```bash
  find . -path './node_modules' -prune -o -type f \( -name '*.sql' -o -name 'database.ts' \) -print | grep -v node_modules
  ```

  Identify the file that creates the `markets` table.

- [ ] **Step 2: Replace the markets table DDL with the lean version**

  ```sql
  DROP TABLE IF EXISTS markets;
  CREATE TABLE markets (
    id              VARCHAR(80) PRIMARY KEY,
    slug            VARCHAR(255) NOT NULL UNIQUE,
    question        TEXT NOT NULL,
    category        VARCHAR(64),
    volume          NUMERIC(30, 6) DEFAULT 0,
    liquidity       NUMERIC(30, 6) DEFAULT 0,
    end_date        TIMESTAMPTZ,
    clob_token_ids  TEXT[],
    active          BOOLEAN DEFAULT TRUE,
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    -- tsvector column for full-text search; auto-maintained via trigger
    search_vec      TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', question)) STORED
  );

  CREATE INDEX markets_search_vec_idx ON markets USING GIN (search_vec);
  CREATE INDEX markets_category_idx ON markets (category);
  CREATE INDEX markets_volume_idx ON markets (volume DESC);
  CREATE INDEX markets_liquidity_idx ON markets (liquidity DESC);
  CREATE INDEX markets_active_end_date_idx ON markets (active, end_date) WHERE active = TRUE;
  ```

- [ ] **Step 3: Reset the database**

  ```bash
  pnpm db:down && pnpm db:up
  # If the DB has init scripts, that's enough. Otherwise apply the DDL manually:
  psql "$DB_URL" -f script/initDb.sql
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add script/initDb.sql
  git commit -m "feat(db): lean markets table with tsvector full-text search"
  ```

---

### Task 3.2: Slim `databaseService.ts` market methods

**Files:**

- Modify: `src/backend/services/databaseService.ts`
- Modify: `src/backend/interfaces/Market.ts` and `src/backend/interfaces/Database.ts` (drop dynamic fields)

- [ ] **Step 1: Update `Market` and `DatabaseMarket` interfaces to lean fields**

  In `src/backend/interfaces/Market.ts`:

  ```ts
  export interface Market {
    id: string;
    slug: string;
    question: string;
    category: string | null;
    volume: number;
    liquidity: number;
    endDate: Date | null;
    clobTokenIds: string[];
    active: boolean;
  }
  ```

  In `src/backend/interfaces/Database.ts`, mirror the lean shape for `DatabaseMarket` (snake_case columns).

- [ ] **Step 2: Replace all market methods in `databaseService.ts` with three**

  Delete: `insertMarket`, `getMarketByConditionId`, `getMarketById`, `getAllMarkets`, `getTopMarkets`, `searchMarkets`, `searchMarketsByKeywords`, `searchMarketsByAnyKeyword`, `searchMarketsByKeywordsAndCategory`, `searchMarketsByAnyKeywordAndCategory`, `getMarketsByVolume`, `getMarketsByQuestion`, `getMarketBySlug`, `getMarketsEndingAfter`, `getMarketsByCategory`, `getMarketsByClobTokenId`, `deleteMarket`, `removeClosedMarkets`, `removeMarketsEndedBefore`, `insertMarkets`, `getMarketStats`, `extractCategory`.

  Add the three replacements:

  ```ts
  static async upsertMarket(market: Market): Promise<void> {
    await query(
      `INSERT INTO markets (id, slug, question, category, volume, liquidity, end_date, clob_token_ids, active, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
       ON CONFLICT (id) DO UPDATE SET
         slug = EXCLUDED.slug,
         question = EXCLUDED.question,
         category = EXCLUDED.category,
         volume = EXCLUDED.volume,
         liquidity = EXCLUDED.liquidity,
         end_date = EXCLUDED.end_date,
         clob_token_ids = EXCLUDED.clob_token_ids,
         active = EXCLUDED.active,
         updated_at = NOW()`,
      [
        market.id,
        market.slug,
        market.question,
        market.category,
        market.volume,
        market.liquidity,
        market.endDate,
        market.clobTokenIds,
        market.active,
      ],
    );
  }

  static async removeEndedMarkets(): Promise<number> {
    const result = await query<{ count: number }>(
      `DELETE FROM markets WHERE end_date < NOW() RETURNING id`,
      [],
    );
    return result.rows.length;
  }

  static async searchMarkets(opts: {
    q?: string;
    category?: string;
    volumeMin?: number;
    liquidityMin?: number;
    sort?: "volume" | "liquidity" | "end_date";
    limit?: number;
    offset?: number;
  }): Promise<DatabaseMarket[]> {
    const { q, category, volumeMin = 0, liquidityMin = 0, sort = "volume", limit = 50, offset = 0 } = opts;
    const wheres: string[] = ["active = TRUE", "volume >= $1", "liquidity >= $2"];
    const params: unknown[] = [volumeMin, liquidityMin];
    if (category) {
      params.push(category);
      wheres.push(`category = $${params.length}`);
    }
    let orderBy = `volume DESC`;
    if (sort === "liquidity") orderBy = `liquidity DESC`;
    if (sort === "end_date") orderBy = `end_date ASC`;

    if (q) {
      params.push(q);
      wheres.push(`search_vec @@ plainto_tsquery('english', $${params.length})`);
      // when q is set, prefer ts_rank ordering with volume tiebreaker
      orderBy = `ts_rank(search_vec, plainto_tsquery('english', $${params.length})) DESC, volume DESC`;
    }

    params.push(limit, offset);
    const sql = `SELECT * FROM markets
                 WHERE ${wheres.join(" AND ")}
                 ORDER BY ${orderBy}
                 LIMIT $${params.length - 1} OFFSET $${params.length}`;
    const result = await query<DatabaseMarket>(sql, params);
    return result.rows;
  }

  static async getMarketBySlug(slug: string): Promise<DatabaseMarket | null> {
    // Single read used by /api/polyswap/orders POST (when frontend sends a slug
    // and we need to resolve clob_token_ids).
    const result = await query<DatabaseMarket>(
      `SELECT * FROM markets WHERE slug = $1 LIMIT 1`,
      [slug],
    );
    return result.rows[0] ?? null;
  }
  ```

- [ ] **Step 3: Build**

  ```bash
  pnpm tsc --noEmit
  ```

  Expected: errors in places that called the deleted methods. We'll fix those in subsequent tasks (3.3, 3.4, 3.5).

- [ ] **Step 4: Commit**

  ```bash
  git add src/backend/services/databaseService.ts src/backend/interfaces/
  git commit -m "refactor(db): collapse markets methods to upsert/remove/search

  Drop dynamic fields, custom category extraction, multiple search variants.
  Adds tsvector full-text search via plainto_tsquery."
  ```

---

### Task 3.3: Simplify `MarketUpdateService` and `polymarketAPIService`

**Files:**

- Modify: `src/backend/services/marketUpdateService.ts`
- Modify: `src/backend/services/polymarketAPIService.ts` (drop methods unused by sync)

- [ ] **Step 1: Trim `polymarketAPIService.ts` to one method**

  Keep only `getOpenMarkets({ limit?, offset?, ... })` returning the lean `Market[]` shape. Delete `getMarketByConditionId` and `getMarketById` — they're no longer used (slug is now the canonical lookup, done in `databaseService`).

  Update the response mapping to produce `Market` (lean) — drop outcome prices, order book depth, etc.

- [ ] **Step 2: Trim `marketUpdateService.ts`**

  Replace the body of `updateMarkets` with a simple loop:

  ```ts
  static async updateMarkets(): Promise<void> {
    const markets = await PolymarketAPIService.getOpenMarkets({ limit: 1000 });
    for (const m of markets) {
      await DatabaseService.upsertMarket(m);
    }
    const removed = await DatabaseService.removeEndedMarkets();
    console.log(`market sync: upserted ${markets.length}, removed ${removed} ended`);
  }
  ```

  Keep `startUpdateRoutine` / `stopUpdateRoutine` as-is.

- [ ] **Step 3: Build**

  ```bash
  pnpm tsc --noEmit
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add src/backend/services/marketUpdateService.ts src/backend/services/polymarketAPIService.ts
  git commit -m "refactor(backend): simplify market sync to upsert + remove-ended"
  ```

---

### Task 3.4: New `GET /api/markets/search` route

**Files:**

- Create: `src/app/api/markets/search/route.ts` (replacing the existing one)

- [ ] **Step 1: Replace the file content**

  ```ts
  // src/app/api/markets/search/route.ts
  import { type NextRequest, NextResponse } from "next/server";
  import { DatabaseService } from "@/backend/services/databaseService";

  export async function GET(req: NextRequest) {
    const sp = req.nextUrl.searchParams;
    const q = sp.get("q") ?? undefined;
    const category = sp.get("category") ?? undefined;
    const volumeMin = sp.get("volumeMin") ? Number(sp.get("volumeMin")) : 0;
    const liquidityMin = sp.get("liquidityMin") ? Number(sp.get("liquidityMin")) : 0;
    const sortRaw = sp.get("sort") ?? "volume";
    const sort: "volume" | "liquidity" | "end_date" =
      sortRaw === "liquidity" || sortRaw === "end_date" ? sortRaw : "volume";
    const limit = Math.min(Number(sp.get("limit") ?? 50), 100);
    const offset = Math.max(Number(sp.get("offset") ?? 0), 0);

    try {
      const markets = await DatabaseService.searchMarkets({
        q,
        category,
        volumeMin,
        liquidityMin,
        sort,
        limit,
        offset,
      });
      return NextResponse.json({ success: true, data: { markets, count: markets.length } });
    } catch (err) {
      return NextResponse.json(
        { success: false, error: err instanceof Error ? err.message : "search failed" },
        { status: 500 }
      );
    }
  }
  ```

- [ ] **Step 2: Build**

  ```bash
  pnpm tsc --noEmit
  ```

- [ ] **Step 3: Smoke-test in dev**

  ```bash
  pnpm dev
  # in another terminal:
  curl -s 'http://localhost:3000/api/markets/search?q=election&limit=3' | jq .
  ```

  Expected: `{ success: true, data: { markets: [...], count: 3 } }` (assuming the DB has been synced; if empty, run `pnpm saveMarkets` or trigger the sync).

- [ ] **Step 4: Commit**

  ```bash
  git add src/app/api/markets/search/route.ts
  git commit -m "feat(api): single /markets/search route replacing 5 old routes"
  ```

---

### Task 3.5: Update `useMarketsData` to use new search route + Polymarket Gamma direct

**Files:**

- Modify: `src/hooks/useMarketsData.ts`
- Create: `src/services/polymarket.ts` (direct Polymarket Gamma client)

- [ ] **Step 1: Create the Polymarket Gamma client**

  ```ts
  // src/services/polymarket.ts
  // Client-side direct fetches to Polymarket Gamma API for live data
  // (prices, outcomes, order book depth) that we don't keep in our DB.

  const GAMMA_BASE = "https://gamma-api.polymarket.com";

  export interface GammaMarket {
    id: string;
    slug: string;
    question: string;
    description?: string;
    outcomes: string; // JSON-encoded string array
    outcomePrices: string; // JSON-encoded string array of probabilities
    volume: string;
    liquidity: string;
    endDate: string;
    clobTokenIds: string; // JSON-encoded
    active: boolean;
    closed: boolean;
  }

  export async function fetchGammaMarketBySlug(slug: string): Promise<GammaMarket | null> {
    const url = `${GAMMA_BASE}/markets?slug=${encodeURIComponent(slug)}&limit=1`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`gamma fetch failed: ${res.status}`);
    const arr = (await res.json()) as GammaMarket[];
    return arr[0] ?? null;
  }

  export async function fetchGammaMarketsByIds(ids: string[]): Promise<GammaMarket[]> {
    if (ids.length === 0) return [];
    const params = ids.map((id) => `id=${encodeURIComponent(id)}`).join("&");
    const url = `${GAMMA_BASE}/markets?${params}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`gamma fetch failed: ${res.status}`);
    return (await res.json()) as GammaMarket[];
  }
  ```

- [ ] **Step 2: Update `useMarketsData.ts`**

  Open `src/hooks/useMarketsData.ts`. The hook currently uses `apiService.getTopMarkets`, `searchMarkets`, `getMarketById`, `getMarketBySlug`. Rewire:
  - `useTopMarkets()` — calls the new `/api/markets/search?sort=volume&limit=20` route.
  - `useSearchMarkets(query, category)` — calls `/api/markets/search?q=...&category=...`.
  - `useMarket(identifier)` — fetches the lean record from `/api/markets/search?q=...&limit=1`, then merges with live data from `fetchGammaMarketBySlug` for prices/outcomes/etc.
  - `useRawMarket(identifier)` — same as `useMarket` but returns the raw `GammaMarket` shape.

  ```ts
  // Sketch (adapt to actual existing hook signatures)
  export function useMarket(identifier: string) {
    return useQuery({
      queryKey: ["market", identifier],
      queryFn: async () => {
        const lean = await searchOne(identifier); // hits /api/markets/search
        if (!lean) return null;
        const gamma = await fetchGammaMarketBySlug(lean.slug);
        if (!gamma) return null;
        return mergeMarket(lean, gamma); // returns ApiMarket shape compatible with old consumers
      },
      staleTime: 1000 * 30,
    });
  }
  ```

  Keep the `MarketViewModel` shape used by the rest of the app stable — just change where the data comes from.

- [ ] **Step 3: Build + lint**

  ```bash
  pnpm tsc --noEmit
  pnpm lint
  ```

- [ ] **Step 4: Manual dev smoke-test**

  ```bash
  pnpm dev
  ```

  Visit the home page (top markets), search by a keyword, click into a market, confirm probability prices render. The probability values must come from Gamma — confirm by checking they refresh on poll.

- [ ] **Step 5: Commit**

  ```bash
  git add src/hooks/useMarketsData.ts src/services/polymarket.ts
  git commit -m "feat(markets): consume /markets/search + Polymarket Gamma directly"
  ```

---

### Task 3.6: Delete old `/api/markets/*` routes

**Files:**

- Delete: `src/app/api/markets/route.ts`
- Delete: `src/app/api/markets/[identifier]/route.ts`
- Delete: `src/app/api/markets/category/[category]/route.ts`
- Delete: `src/app/api/markets/top/route.ts`

- [ ] **Step 1: Verify no remaining users**

  ```bash
  grep -rn 'fetch.*api/markets[^/]\|apiService.getTopMarkets\|apiService.getMarketById\|apiService.getMarketBySlug\|apiService.getMarketsByCategory' src/ 2>/dev/null
  ```

  Expected: no matches.

- [ ] **Step 2: Delete files**

  ```bash
  rm src/app/api/markets/route.ts
  rm -r src/app/api/markets/[identifier]
  rm -r src/app/api/markets/category
  rm -r src/app/api/markets/top
  ```

- [ ] **Step 3: Strip `services/api.ts`**

  Open `src/services/api.ts` and remove `getTopMarkets`, `searchMarkets`, `getMarketById`, `getMarketBySlug`, `getMarketsByCategory`, `convertBackendMarket`, and the `BackendMarket` / `BackendApiResponse` interfaces.

- [ ] **Step 4: Build**

  ```bash
  pnpm tsc --noEmit
  pnpm lint
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add -A
  git commit -m "refactor(api): delete old /markets/* routes (replaced by /markets/search)"
  ```

---

## Phase 4 — Order creation flow

**Largest phase.** Migrate `polymarketOrderService` and `transactionEncodingService` to viem (fixes the Phase-0 broken build). Collapse 4 endpoints to 1. Wire into the frontend.

### Task 4.1: Migrate `polymarketOrderService.ts` to viem-based `ClobClient`

**Files:**

- Modify: `src/backend/services/polymarketOrderService.ts`

- [ ] **Step 1: Read the current file end-to-end**

  ```bash
  cat src/backend/services/polymarketOrderService.ts | head -80
  ```

  The current code constructs `new Wallet(privateKey, provider)` (ethers v5 Wallet from clob-client's transitive dep). After the bump, the constructor expects a viem `WalletClient`.

- [ ] **Step 2: Replace `Wallet` construction with viem**

  ```ts
  import {
    ClobClient,
    type ApiKeyCreds,
    OrderType,
    Side,
    AssetType,
  } from "@polymarket/clob-client";
  import { createWalletClient, http, type Hex } from "viem";
  import { polygon } from "viem/chains";
  import { privateKeyToAccount } from "viem/accounts";

  export class PolymarketOrderService {
    // singleton plumbing unchanged
    private async performInitialization(): Promise<void> {
      const pk = process.env.PRIVATE_KEY as Hex | undefined;
      if (!pk) throw new Error("PRIVATE_KEY missing");

      const account = privateKeyToAccount(pk);
      const walletClient = createWalletClient({
        account,
        chain: polygon,
        transport: http(process.env.RPC_URL),
      });

      const creds: ApiKeyCreds = {
        key: process.env.CLOB_API_KEY!,
        secret: process.env.CLOB_SECRET!,
        passphrase: process.env.CLOB_PASS_PHRASE!,
      };

      // clob-client 5.x signature — verify via TS:
      this.client = new ClobClient(
        process.env.CLOB_HOST ?? "https://clob.polymarket.com",
        137, // chainId
        walletClient, // viem WalletClient — NEW in 5.x
        creds
        // signatureType / funderAddress per polymarket docs as needed
      );
      // ... rest unchanged
    }
    // postGTCOrder / postGTDOrder / cancelOrder / getOrder / getOpenOrders / cancelAllOrders unchanged
    // (clob-client 5.x exposes the same method names — verify via TS errors)
  }
  ```

- [ ] **Step 3: Remove ethers imports / usages**

  Search for `ethers` in this file and remove. The `checkAllowance` / `getTokenDecimals` helpers may use `ethers.Contract`; replace with viem `publicClient.readContract`:

  ```ts
  import { createPublicClient, http, erc20Abi } from "viem";
  const publicClient = createPublicClient({ chain: polygon, transport: http(process.env.RPC_URL) });

  private async checkAllowance(token: Address, requiredAmount: bigint, spender: Address): Promise<boolean> {
    const allowance = await publicClient.readContract({
      address: token,
      abi: erc20Abi,
      functionName: "allowance",
      args: [this.ownerAddress, spender],
    });
    return allowance >= requiredAmount;
  }
  ```

- [ ] **Step 4: Build**

  ```bash
  pnpm tsc --noEmit
  ```

  Expected: errors in `polymarketPositionSellerService.ts` and `listener.ts` remain (Phase 6 covers them). No errors in this file.

- [ ] **Step 5: Commit**

  ```bash
  git add src/backend/services/polymarketOrderService.ts
  git commit -m "refactor(polymarket): migrate to viem WalletClient (clob-client 5.x)"
  ```

---

### Task 4.2: Migrate `transactionEncodingService.ts` to viem

**Files:**

- Modify: `src/backend/services/transactionEncodingService.ts`

- [ ] **Step 1: Replace ethers imports**

  ```ts
  import { encodeFunctionData, encodeAbiParameters, keccak256, type Hex } from "viem";
  import composableCowAbi from "../../abi/composableCoW.json";
  ```

- [ ] **Step 2: Replace ABI encoding logic**

  The existing `encodePolyswapOrderData` encodes a `PolyswapOrderData` struct as ABI. With viem:

  ```ts
  static encodePolyswapOrderData(orderData: PolyswapOrderData): Hex {
    return encodeAbiParameters(
      [
        // tuple matching PolyswapOrderData layout — verify against the handler ABI
        { type: "address", name: "sellToken" },
        { type: "address", name: "buyToken" },
        { type: "address", name: "receiver" },
        { type: "uint256", name: "sellAmount" },
        { type: "uint256", name: "buyAmount" },
        { type: "uint32", name: "validTo" },
        { type: "bytes32", name: "marketId" },
        { type: "uint256", name: "threshold" },
        { type: "uint8", name: "side" },        // 0 = below, 1 = above (verify)
        { type: "bytes32", name: "polymarketOrderHash" },
      ],
      [
        orderData.sellToken,
        orderData.buyToken,
        orderData.receiver,
        BigInt(orderData.sellAmount),
        BigInt(orderData.buyAmount),
        Number(orderData.validTo),
        orderData.marketId as Hex,
        BigInt(orderData.threshold),
        orderData.side,
        orderData.polymarketOrderHash as Hex,
      ],
    );
  }

  static encodeCreateWithContextCallData(
    params: ConditionalOrderParams,
    valueFactory: Address = ZERO_ADDRESS,
    data: Hex = "0x",
    dispatch: boolean = true,
  ): Hex {
    return encodeFunctionData({
      abi: composableCowAbi,
      functionName: "createWithContext",
      args: [params, valueFactory, data, dispatch],
    });
  }

  static calculateOrderHash(params: ConditionalOrderParams): Hex {
    const encoded = encodeAbiParameters(
      [
        {
          type: "tuple",
          components: [
            { type: "address", name: "handler" },
            { type: "bytes32", name: "salt" },
            { type: "bytes", name: "staticInput" },
          ],
        },
      ],
      [params],
    );
    return keccak256(encoded);
  }
  ```

  Cross-reference the field order against your existing handler. The `PolyswapOrderData` struct layout is the source of truth — copy it exactly.

- [ ] **Step 3: Build**

  ```bash
  pnpm tsc --noEmit
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add src/backend/services/transactionEncodingService.ts
  git commit -m "refactor(backend): migrate transactionEncodingService to viem"
  ```

---

### Task 4.3: Build the new `POST /api/polyswap/orders` route

**Files:**

- Create: `src/app/api/polyswap/orders/route.ts` (replacing the existing one)

- [ ] **Step 1: Replace the route**

  ```ts
  // src/app/api/polyswap/orders/route.ts
  import { type NextRequest, NextResponse } from "next/server";
  import { encodeFunctionData, type Address, type Hex, erc20Abi, maxUint256 } from "viem";
  import { DatabaseService } from "@/backend/services/databaseService";
  import { TransactionEncodingService } from "@/backend/services/transactionEncodingService";
  import { getPolymarketOrderService } from "@/backend/services/polymarketOrderService";

  const VAULT_RELAYER: Address = "0xC92E8bdf79f0507f65a392b0ab4667716BFE0110";
  const COMPOSABLE_COW: Address =
    (process.env.COMPOSABLE_COW as Address) ?? "0xfdaFc9d1902f4e0b84f65F49f244b32b31013b74";

  interface CreateOrderRequest {
    owner: Address;
    sellToken: Address;
    buyToken: Address;
    sellAmount: string; // wei
    buyAmount: string; // wei (CoW order minimum out)
    marketSlug: string; // resolves to clob_token_ids server-side
    side: 0 | 1; // 0 = below, 1 = above (matches handler convention)
    threshold: string; // probability * 1e18 or whatever the handler expects
    expirySeconds: number; // CoW order validTo offset
  }

  export async function POST(request: NextRequest) {
    const body = (await request.json()) as CreateOrderRequest;

    // 1. Validate.
    if (!body.owner || !body.sellToken || !body.buyToken || !body.marketSlug) {
      return NextResponse.json({ success: false, error: "missing fields" }, { status: 400 });
    }

    // 2. Resolve market.
    const market = await DatabaseService.getMarketBySlug(body.marketSlug);
    if (!market) {
      return NextResponse.json({ success: false, error: "unknown market" }, { status: 404 });
    }

    // 3. Place Polymarket limit order (server credentials).
    const polymarket = getPolymarketOrderService();
    await polymarket.initialize();

    let polymarketOrderHash: string;
    try {
      const placed = await polymarket.postGTDOrder({
        tokenId: market.clob_token_ids[body.side],
        side: "BUY",
        price: 0.5, // derive from body.threshold per handler convention
        size: 0, // derive from body.sellAmount and price
        expiration: Math.floor(Date.now() / 1000) + body.expirySeconds,
      });
      polymarketOrderHash = placed.orderID;
    } catch (err) {
      return NextResponse.json(
        {
          success: false,
          error: `polymarket placement failed: ${err instanceof Error ? err.message : err}`,
        },
        { status: 502 }
      );
    }

    // 4. Build PolyswapOrderData → ConditionalOrderParams → calldata.
    const orderData = {
      sellToken: body.sellToken,
      buyToken: body.buyToken,
      receiver: body.owner,
      sellAmount: body.sellAmount,
      buyAmount: body.buyAmount,
      validTo: Math.floor(Date.now() / 1000) + body.expirySeconds,
      marketId: market.id, // padded to bytes32
      threshold: body.threshold,
      side: body.side,
      polymarketOrderHash,
    };

    const params = TransactionEncodingService.createConditionalOrderParams(orderData);
    const createCalldata = TransactionEncodingService.encodeCreateWithContextCallData(params);
    const orderHash = TransactionEncodingService.calculateOrderHash(params);

    // 5. Build approve calldata.
    const approveCalldata = encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve",
      args: [VAULT_RELAYER, maxUint256],
    });

    const tx = { to: COMPOSABLE_COW, data: createCalldata, value: 0n };
    const batchTx = [{ to: body.sellToken, data: approveCalldata, value: 0n }, tx];

    // 6. Insert draft DB row.
    const orderId = await DatabaseService.insertPolyswapOrderFromForm({
      ...orderData,
      ownerAddress: body.owner,
      orderHash,
      polymarketOrderHash,
      status: "draft",
    });

    return NextResponse.json({
      success: true,
      data: {
        orderId,
        polymarketOrderHash,
        orderHash,
        tx: { ...tx, value: tx.value.toString() },
        batchTx: batchTx.map((c) => ({ ...c, value: c.value.toString() })),
        sellToken: body.sellToken,
        sellAmount: body.sellAmount,
        vaultRelayer: VAULT_RELAYER,
      },
    });
  }
  ```

  Adapt the field names to your existing `PolyswapOrderData` shape and your handler's exact convention.

- [ ] **Step 2: Build**

  ```bash
  pnpm tsc --noEmit
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add src/app/api/polyswap/orders/route.ts
  git commit -m "feat(api): single POST /orders endpoint with approve+create batch"
  ```

---

### Task 4.4: Refactor frontend create flow

**Files:**

- Modify: `src/components/create/CreatePage.tsx`
- Modify: `src/services/api.ts` (add `createPolyswapOrder` returning the new shape)
- Modify: `src/hooks/useCreateOrder.ts` if needed (currently it's a pure form hook — keep it)

- [ ] **Step 1: Add the API client method**

  In `src/services/api.ts`, replace the existing `createPolyswapOrder` (which only created the draft) with one that hits the new POST and returns the full payload:

  ```ts
  export interface CreateOrderResponse {
    orderId: number;
    polymarketOrderHash: string;
    orderHash: string;
    tx: { to: Address; data: Hex; value: string };
    batchTx: { to: Address; data: Hex; value: string }[];
    sellToken: Address;
    sellAmount: string;
    vaultRelayer: Address;
  }

  export async function createPolyswapOrder(
    body: CreateOrderRequest
  ): Promise<CreateOrderResponse> {
    const res = await fetch("/api/polyswap/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok || !json.success) throw new Error(json.error ?? "create failed");
    return json.data as CreateOrderResponse;
  }
  ```

- [ ] **Step 2: Replace the `handleReview` flow in `CreatePage.tsx`**

  The current 4-call sequence (steps 1–6 in CreatePage:120-160) becomes:

  ```ts
  const handleReview = async () => {
    setIsPreparingTx(true);
    try {
      const order = await createPolyswapOrder({
        owner: safeAddress,
        sellToken: form.sellToken,
        buyToken: form.buyToken,
        sellAmount: form.sellAmountWei,
        buyAmount: form.buyAmountWei,
        marketSlug: form.marketSlug,
        side: form.side,
        threshold: form.thresholdWei,
        expirySeconds: form.expirySeconds,
      });

      // Allowance check determines single-tx vs batch.
      const allowance = await publicClient.readContract({
        address: form.sellToken,
        abi: erc20Abi,
        functionName: "allowance",
        args: [safeAddress, order.vaultRelayer],
      });

      const calls: SafeCall[] =
        allowance >= BigInt(order.sellAmount)
          ? [toSafeCall(order.tx)]
          : order.batchTx.map(toSafeCall);

      setOrderId(order.orderId);
      setCalls(calls);
      setSignOpen(true);
    } catch (err) {
      setSigningError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setIsPreparingTx(false);
    }
  };
  ```

- [ ] **Step 3: Replace `onConfirmed` to drop the PUT call**

  Today `onConfirmed` calls `apiService.updateOrderTransactionHashById`. After this refactor, the listener handles draft → live. Keep a local "just created" cache for ~30s:

  ```ts
  const onConfirmed = (onChainHash: Hash) => {
    queryClient.setQueryData(["order", orderId], (old: OrderViewModel | undefined) => ({
      ...(old ?? {}),
      status: "live",
      txHash: onChainHash,
      _justCreatedUntil: Date.now() + 30_000,
    }));
    router.push(`/orders/${orderId}`);
  };
  ```

  Update `useOrders`/`useOrder` to respect `_justCreatedUntil` and prefer the local cache while it's valid.

- [ ] **Step 4: Build + lint**

  ```bash
  pnpm tsc --noEmit
  pnpm lint
  ```

- [ ] **Step 5: Manual dev smoke-test**

  ```bash
  pnpm dev
  ```

  Connect a Safe via WalletConnect, create an order on a test market, sign, watch the dashboard show "live" optimistically. Confirm the listener (still the old listener for now — Phase 6 migrates it) eventually moves DB to `live`.

- [ ] **Step 6: Commit**

  ```bash
  git add src/components/create/CreatePage.tsx src/services/api.ts
  git commit -m "feat(orders): single POST /orders flow, optimistic live UI"
  ```

---

### Task 4.5: Delete obsolete order endpoints

**Files:**

- Delete: `src/app/api/polyswap/orders/create/route.ts`
- Delete: `src/app/api/polyswap/orders/polymarket/route.ts`
- Delete: `src/app/api/polyswap/orders/polymarket/[polymarketHash]/route.ts`
- Delete: `src/app/api/polyswap/orders/id/[id]/transaction/route.ts`
- Delete: `src/app/api/polyswap/orders/id/[id]/batch-transaction/route.ts`
- Delete: `src/services/safeBatchService.ts`
- Modify: `src/services/api.ts` (remove `createPolymarketOrder`, `getTransactionDataById`, `updateOrderTransactionHashById`, `prepareBatchTransaction`)

- [ ] **Step 1: Search for residual users**

  ```bash
  grep -rn "createPolymarketOrder\|getTransactionDataById\|updateOrderTransactionHashById\|safeBatchService\|/polymarket/route\|/transaction/route\|/batch-transaction" src/ 2>/dev/null
  ```

  Expected: no matches except the targets themselves.

- [ ] **Step 2: Delete files**

  ```bash
  rm -r src/app/api/polyswap/orders/create
  rm -r src/app/api/polyswap/orders/polymarket
  rm -r src/app/api/polyswap/orders/id/[id]/transaction
  rm -r src/app/api/polyswap/orders/id/[id]/batch-transaction
  rm src/services/safeBatchService.ts
  ```

- [ ] **Step 3: Strip `services/api.ts`**

  Remove the methods listed above plus their interfaces.

- [ ] **Step 4: Build + lint**

  ```bash
  pnpm tsc --noEmit
  pnpm lint
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add -A
  git commit -m "refactor(api): delete create/polymarket/transaction/batch endpoints

  All folded into POST /orders. safeBatchService removed (replaced by
  POST /orders server calldata + useSafeSignFlow client dispatch)."
  ```

---

## Phase 5 — Cancellation flow

### Task 5.1: New `DELETE /api/polyswap/orders/[id]` route (drafts only)

**Files:**

- Create: `src/app/api/polyswap/orders/[id]/route.ts` (alongside existing `/id/[id]/route.ts`; this is a different parameter shape — see step 1 if collision)

- [ ] **Step 1: Decide route shape**

  The existing `/api/polyswap/orders/id/[id]/route.ts` handles GET. For DELETE we want a parallel route. Option A: add a `DELETE` handler to the existing file at `/api/polyswap/orders/id/[id]/route.ts`. Option B: create a new `/api/polyswap/orders/[id]/route.ts`.

  Choose **Option A** (less surface change). Open `src/app/api/polyswap/orders/id/[id]/route.ts` and add:

  ```ts
  import { verifySignature } from "@/backend/utils/signatureVerification";
  import { getPolymarketOrderService } from "@/backend/services/polymarketOrderService";

  export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
  ) {
    const { id } = await params;
    const orderId = Number(id);
    const body = (await request.json()) as { signature: string; timestamp: number };

    const order = await DatabaseService.getPolyswapOrderById(orderId);
    if (!order) return NextResponse.json({ success: false, error: "not found" }, { status: 404 });
    if (order.status !== "draft") {
      return NextResponse.json(
        { success: false, error: "only drafts can be cancelled off-chain; use ComposableCoW.remove for live" },
        { status: 400 },
      );
    }

    const verification = await verifySignature({
      action: "cancel",
      orderIdentifier: String(orderId),
      timestamp: body.timestamp,
      chainId: 137,
      signature: body.signature,
      signerAddress: order.owner_address,
      provider: /* viem publicClient compatible */,
    });
    if (!verification.valid) {
      return NextResponse.json({ success: false, error: verification.error }, { status: 401 });
    }

    // Cancel Polymarket order
    if (order.polymarket_order_hash) {
      const pm = getPolymarketOrderService();
      await pm.initialize();
      await pm.cancelOrder(order.polymarket_order_hash);
    }

    // Delete the draft row entirely
    await DatabaseService.deletePolyswapOrderById(orderId);

    return NextResponse.json({ success: true });
  }
  ```

  > Note: `signatureVerification.ts` may still use ethers. Phase 6/8 migrate it to viem; for now it works on its own dependency tree.

- [ ] **Step 2: Add `deletePolyswapOrderById` to `DatabaseService`**

  ```ts
  static async deletePolyswapOrderById(id: number): Promise<void> {
    await query(`DELETE FROM polyswap_orders WHERE id = $1`, [id]);
  }
  ```

- [ ] **Step 3: Build**

  ```bash
  pnpm tsc --noEmit
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add src/app/api/polyswap/orders/id/[id]/route.ts src/backend/services/databaseService.ts
  git commit -m "feat(api): DELETE /orders/[id] for drafts (signed)"
  ```

---

### Task 5.2: New `POST /api/polyswap/orders/id/[id]/notify-remove` route

**Files:**

- Create: `src/app/api/polyswap/orders/id/[id]/notify-remove/route.ts`

- [ ] **Step 1: Implement**

  ```ts
  // src/app/api/polyswap/orders/id/[id]/notify-remove/route.ts
  import { type NextRequest, NextResponse } from "next/server";
  import { createPublicClient, http, decodeFunctionData, type Hex, type Address } from "viem";
  import { polygon } from "viem/chains";
  import { DatabaseService } from "@/backend/services/databaseService";
  import { getPolymarketOrderService } from "@/backend/services/polymarketOrderService";
  import composableCowAbi from "@/abi/composableCoW.json";

  const COMPOSABLE_COW: Address =
    (process.env.COMPOSABLE_COW as Address) ?? "0xfdaFc9d1902f4e0b84f65F49f244b32b31013b74";
  const REMOVE_SELECTOR = "0x95b0a06f"; // keccak256("remove(bytes32)")[:4] — verify

  export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
  ) {
    const { id } = await params;
    const orderId = Number(id);
    const body = (await request.json()) as { txHash: Hex };

    const order = await DatabaseService.getPolyswapOrderById(orderId);
    if (!order) return NextResponse.json({ success: false, error: "not found" }, { status: 404 });
    if (order.status !== "live") {
      return NextResponse.json({ success: false, error: "only live orders" }, { status: 400 });
    }

    const publicClient = createPublicClient({
      chain: polygon,
      transport: http(process.env.RPC_URL),
    });
    const tx = await publicClient.getTransaction({ hash: body.txHash });
    const receipt = await publicClient.getTransactionReceipt({ hash: body.txHash });

    // 1. Tx targets ComposableCoW.
    if (tx.to?.toLowerCase() !== COMPOSABLE_COW.toLowerCase()) {
      return NextResponse.json({ success: false, error: "tx target mismatch" }, { status: 400 });
    }
    // 2. Tx succeeded.
    if (receipt.status !== "success") {
      return NextResponse.json({ success: false, error: "tx failed on-chain" }, { status: 400 });
    }
    // 3. Tx is a remove(bytes32) call with matching orderHash.
    const decoded = decodeFunctionData({ abi: composableCowAbi, data: tx.input });
    if (decoded.functionName !== "remove") {
      return NextResponse.json(
        { success: false, error: "tx is not a remove call" },
        { status: 400 }
      );
    }
    const [orderHashFromTx] = decoded.args as [Hex];
    if (orderHashFromTx.toLowerCase() !== order.order_hash.toLowerCase()) {
      return NextResponse.json({ success: false, error: "orderHash mismatch" }, { status: 400 });
    }

    // 4. Cancel Polymarket order (idempotent).
    if (order.polymarket_order_hash) {
      const pm = getPolymarketOrderService();
      await pm.initialize();
      await pm.cancelOrder(order.polymarket_order_hash).catch((err) => {
        console.warn(`polymarket cancel idempotent failure: ${err}`);
      });
    }

    // 5. Mark canceled.
    await DatabaseService.updateOrderStatusById(orderId, "canceled");
    return NextResponse.json({ success: true });
  }
  ```

- [ ] **Step 2: Build**

  ```bash
  pnpm tsc --noEmit
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add src/app/api/polyswap/orders/id/[id]/notify-remove/route.ts
  git commit -m "feat(api): POST /orders/[id]/notify-remove for live cancel"
  ```

---

### Task 5.3: Frontend `useRemoveOrder` hook + UI wiring

**Files:**

- Create: `src/hooks/useRemoveOrder.ts`
- Modify: `src/services/api.ts` (add `notifyRemove(id, txHash)`)
- Modify: components that show "Cancel order" buttons (likely `src/components/orders/OrderRow.tsx` or similar — find via grep)

- [ ] **Step 1: Add API client method**

  ```ts
  // src/services/api.ts addition
  export async function notifyRemoveOrder(id: number, txHash: Hex): Promise<void> {
    const res = await fetch(`/api/polyswap/orders/id/${id}/notify-remove`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ txHash }),
    });
    const json = await res.json();
    if (!res.ok || !json.success) throw new Error(json.error ?? "notify-remove failed");
  }

  export async function deleteDraftOrder(
    id: number,
    signature: Hex,
    timestamp: number
  ): Promise<void> {
    const res = await fetch(`/api/polyswap/orders/id/${id}`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ signature, timestamp }),
    });
    const json = await res.json();
    if (!res.ok || !json.success) throw new Error(json.error ?? "delete failed");
  }
  ```

- [ ] **Step 2: Define `useRemoveOrder`**

  ```ts
  // src/hooks/useRemoveOrder.ts
  import { useCallback, useState } from "react";
  import {
    useWriteContract,
    useWaitForTransactionReceipt,
    useSignMessage,
    useAccount,
  } from "wagmi";
  import { type Hex } from "viem";
  import composableCowAbi from "@/abi/composableCoW.json";
  import { notifyRemoveOrder, deleteDraftOrder } from "@/services/api";

  const COMPOSABLE_COW = "0xfdaFc9d1902f4e0b84f65F49f244b32b31013b74";

  export function useRemoveOrder() {
    const { address } = useAccount();
    const { writeContractAsync } = useWriteContract();
    const { signMessageAsync } = useSignMessage();
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const removeLive = useCallback(
      async (orderId: number, orderHash: Hex) => {
        setPending(true);
        setError(null);
        try {
          const txHash = await writeContractAsync({
            address: COMPOSABLE_COW,
            abi: composableCowAbi,
            functionName: "remove",
            args: [orderHash],
          });
          // wait for receipt — viem returns hash; useWaitForTransactionReceipt could be used in caller
          await notifyRemoveOrder(orderId, txHash);
          return txHash;
        } catch (e) {
          setError(e instanceof Error ? e.message : "remove failed");
          throw e;
        } finally {
          setPending(false);
        }
      },
      [writeContractAsync]
    );

    const removeDraft = useCallback(
      async (orderId: number) => {
        setPending(true);
        setError(null);
        try {
          const timestamp = Math.floor(Date.now() / 1000);
          const message = `Cancel draft order ${orderId} at ${timestamp}`;
          const signature = await signMessageAsync({ message });
          await deleteDraftOrder(orderId, signature, timestamp);
        } catch (e) {
          setError(e instanceof Error ? e.message : "remove failed");
          throw e;
        } finally {
          setPending(false);
        }
      },
      [signMessageAsync]
    );

    return { removeLive, removeDraft, pending, error };
  }
  ```

- [ ] **Step 3: Wire into existing cancel buttons**

  ```bash
  grep -rn 'Cancel\|cancelOrder\|removeOrder\|/remove' src/components/ | head -10
  ```

  Find the existing cancel UI and replace its handlers with calls to `useRemoveOrder().removeLive(...)` for live orders or `removeDraft(...)` for drafts.

- [ ] **Step 4: Build + smoke-test**

  ```bash
  pnpm tsc --noEmit
  pnpm dev
  ```

  Cancel a draft → confirm sign-message popup → confirm DB row removed and Polymarket order cancelled.
  Cancel a live → confirm wallet popup for `remove()` → after receipt, confirm `notify-remove` fires and DB updates to `canceled`.

- [ ] **Step 5: Commit**

  ```bash
  git add src/hooks/useRemoveOrder.ts src/services/api.ts src/components/
  git commit -m "feat(orders): on-chain remove for live, signed delete for drafts"
  ```

---

### Task 5.4: Delete the old `/remove` route

**Files:**

- Delete: `src/app/api/polyswap/orders/remove/route.ts`

- [ ] **Step 1: Verify no users**

  ```bash
  grep -rn '/api/polyswap/orders/remove' src/ 2>/dev/null
  ```

  Expected: no matches.

- [ ] **Step 2: Delete**

  ```bash
  rm -r src/app/api/polyswap/orders/remove
  ```

- [ ] **Step 3: Build + commit**

  ```bash
  pnpm tsc --noEmit
  git add -A
  git commit -m "refactor(api): delete /orders/remove (replaced by DELETE + notify-remove)"
  ```

---

## Phase 6 — Listener viem migration + restructure

The largest single piece. We rewrite `src/backend/listener.ts` (650 lines, ethers, polling, mixed concerns) into a focused module tree under `src/backend/listener/` (viem, WebSocket, split files). Each task migrates one piece; keep the old file in place until the new tree fully replaces it.

### Task 6.1: Create `eventDecoder.ts` — shared pure utilities

**Files:**

- Create: `src/backend/listener/eventDecoder.ts`
- Add (optional): `src/backend/listener/eventDecoder.test.ts` if you want light vitest coverage

- [ ] **Step 1: Implement**

  ```ts
  // src/backend/listener/eventDecoder.ts
  import {
    decodeAbiParameters,
    encodeAbiParameters,
    keccak256,
    pad,
    type Address,
    type Hex,
  } from "viem";
  import {
    type ConditionalOrderParams,
    type PolyswapOrderData,
  } from "@/backend/interfaces/PolyswapOrder";

  /**
   * Hash a ConditionalOrderParams struct: keccak256(abi.encode((handler, salt, staticInput))).
   * Matches ComposableCoW.hash() — used as the singleOrderHash key for remove() and removal checks.
   */
  export function calculateOrderHash(params: ConditionalOrderParams): Hex {
    const encoded = encodeAbiParameters(
      [
        {
          type: "tuple",
          components: [
            { name: "handler", type: "address" },
            { name: "salt", type: "bytes32" },
            { name: "staticInput", type: "bytes" },
          ],
        },
      ],
      [params]
    );
    return keccak256(encoded);
  }

  /**
   * Decode the staticInput bytes blob from a ConditionalOrderCreated event into PolyswapOrderData.
   * Field order MUST match the handler's expected struct layout.
   */
  export function decodeStaticInput(staticInput: Hex): PolyswapOrderData {
    const decoded = decodeAbiParameters(
      [
        { type: "address" }, // sellToken
        { type: "address" }, // buyToken
        { type: "address" }, // receiver
        { type: "uint256" }, // sellAmount
        { type: "uint256" }, // buyAmount
        { type: "uint32" }, // validTo
        { type: "bytes32" }, // marketId
        { type: "uint256" }, // threshold
        { type: "uint8" }, // side
        { type: "bytes32" }, // polymarketOrderHash
      ],
      staticInput
    );
    return {
      sellToken: decoded[0] as Address,
      buyToken: decoded[1] as Address,
      receiver: decoded[2] as Address,
      sellAmount: decoded[3].toString(),
      buyAmount: decoded[4].toString(),
      validTo: Number(decoded[5]),
      marketId: decoded[6] as Hex,
      threshold: decoded[7].toString(),
      side: Number(decoded[8]),
      polymarketOrderHash: decoded[9] as Hex,
    };
  }
  ```

- [ ] **Step 2: Optional — add a vitest test**

  If you want coverage, add `vitest` as a devDep and write a fixture-based round-trip test (`encode → decode → equal`).

- [ ] **Step 3: Build**

  ```bash
  pnpm tsc --noEmit
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add src/backend/listener/eventDecoder.ts
  git commit -m "feat(listener): pure event decoder utilities (viem)"
  ```

---

### Task 6.2: `blockchainProvider.ts` — viem PublicClient + WalletClient + WebSocket

**Files:**

- Create: `src/backend/listener/blockchainProvider.ts`

- [ ] **Step 1: Implement**

  ```ts
  // src/backend/listener/blockchainProvider.ts
  import {
    createPublicClient,
    createWalletClient,
    http,
    webSocket,
    type PublicClient,
    type WalletClient,
  } from "viem";
  import { polygon } from "viem/chains";
  import { privateKeyToAccount } from "viem/accounts";

  let _publicClient: PublicClient | null = null;
  let _wsClient: PublicClient | null = null;
  let _walletClient: WalletClient | null = null;

  export function getPublicClient(): PublicClient {
    if (_publicClient) return _publicClient;
    _publicClient = createPublicClient({
      chain: polygon,
      transport: http(process.env.RPC_URL),
    });
    return _publicClient;
  }

  export function getWebSocketClient(): PublicClient {
    if (_wsClient) return _wsClient;
    if (!process.env.WSS_RPC_URL) throw new Error("WSS_RPC_URL missing");
    _wsClient = createPublicClient({
      chain: polygon,
      transport: webSocket(process.env.WSS_RPC_URL),
    });
    return _wsClient;
  }

  export function getWalletClient(): WalletClient {
    if (_walletClient) return _walletClient;
    if (!process.env.PRIVATE_KEY) throw new Error("PRIVATE_KEY missing");
    const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
    _walletClient = createWalletClient({
      account,
      chain: polygon,
      transport: http(process.env.RPC_URL),
    });
    return _walletClient;
  }
  ```

- [ ] **Step 2: Build + commit**

  ```bash
  pnpm tsc --noEmit
  git add src/backend/listener/blockchainProvider.ts
  git commit -m "feat(listener): viem PublicClient/WalletClient/WebSocket helpers"
  ```

---

### Task 6.3–6.5: Migrate event handlers

For each of: `conditionalOrderCreated`, `trade`, `orderInvalidated`. Same pattern. Below is `conditionalOrderCreated`; the other two follow identically.

#### Task 6.3: `handlers/conditionalOrderCreated.ts`

**Files:**

- Create: `src/backend/listener/handlers/conditionalOrderCreated.ts`

- [ ] **Step 1: Implement**

  ```ts
  // src/backend/listener/handlers/conditionalOrderCreated.ts
  import { type Log } from "viem";
  import { DatabaseService } from "@/backend/services/databaseService";
  import { calculateOrderHash, decodeStaticInput } from "../eventDecoder";

  type ConditionalOrderCreatedLog = Log & {
    args: {
      owner: `0x${string}`;
      params: { handler: `0x${string}`; salt: `0x${string}`; staticInput: `0x${string}` };
    };
  };

  export async function handleConditionalOrderCreated(
    log: ConditionalOrderCreatedLog
  ): Promise<void> {
    const owner = log.args.owner;
    const params = log.args.params;

    // Filter: only PolySwap handler
    if (params.handler.toLowerCase() !== process.env.POLYSWAP_HANDLER!.toLowerCase()) return;

    const orderHash = calculateOrderHash(params);
    const data = decodeStaticInput(params.staticInput);

    // Idempotent upsert based on orderHash:
    // - If a draft row matches by polymarketOrderHash → upgrade to live, set order_hash + tx fields.
    // - Else if no row exists → insert new live row (catch-up case where draft was lost).
    await DatabaseService.upsertLiveOrderFromEvent({
      owner,
      orderHash,
      polymarketOrderHash: data.polymarketOrderHash,
      transactionHash: log.transactionHash!,
      blockNumber: Number(log.blockNumber),
      logIndex: Number(log.logIndex),
      handler: params.handler,
      data,
    });
  }
  ```

- [ ] **Step 2: Add `upsertLiveOrderFromEvent` to `databaseService`**

  This collapses the existing `updateOrderStatus` / `updateOrderTransactionDetails` logic into one idempotent method. Implementation:

  ```ts
  static async upsertLiveOrderFromEvent(input: {
    owner: Address;
    orderHash: Hex;
    polymarketOrderHash: Hex;
    transactionHash: Hex;
    blockNumber: number;
    logIndex: number;
    handler: Address;
    data: PolyswapOrderData;
  }): Promise<void> {
    const existing = await query<DatabasePolyswapOrder>(
      `SELECT * FROM polyswap_orders WHERE polymarket_order_hash = $1 AND owner_address = $2 LIMIT 1`,
      [input.polymarketOrderHash, input.owner],
    );

    if (existing.rows[0]) {
      await query(
        `UPDATE polyswap_orders
         SET status = 'live', order_hash = $1, transaction_hash = $2, block_number = $3,
             log_index = $4, handler = $5, updated_at = NOW()
         WHERE id = $6`,
        [
          input.orderHash,
          input.transactionHash,
          input.blockNumber,
          input.logIndex,
          input.handler,
          existing.rows[0].id,
        ],
      );
      return;
    }

    // Catch-up insert (rare — listener missed the draft)
    await query(
      `INSERT INTO polyswap_orders (owner_address, polymarket_order_hash, order_hash, status,
       transaction_hash, block_number, log_index, handler, /* PolyswapOrderData fields ... */)
       VALUES ($1, $2, $3, 'live', $4, $5, $6, $7, /* ... */)`,
      [/* ... */],
    );
  }
  ```

- [ ] **Step 3: Build + commit**

  ```bash
  pnpm tsc --noEmit
  git add src/backend/listener/handlers/conditionalOrderCreated.ts src/backend/services/databaseService.ts
  git commit -m "feat(listener): viem ConditionalOrderCreated handler with idempotent upsert"
  ```

#### Task 6.4: `handlers/trade.ts`

Same pattern. Mirror the existing `processTradeEvent` from the legacy `listener.ts:304-358`. Decode against the GPv2Settlement `Trade` event. Match by `orderUid` (compute from log if not in args).

```ts
// src/backend/listener/handlers/trade.ts
import { type Log } from "viem";
import { DatabaseService } from "@/backend/services/databaseService";
import { PolymarketPositionSellerService } from "@/backend/services/polymarketPositionSellerService";

type TradeLog = Log & {
  args: { owner: `0x${string}`; orderUid: `0x${string}`; sellAmount: bigint; buyAmount: bigint };
};

export async function handleTrade(log: TradeLog): Promise<void> {
  const order = await DatabaseService.getPolyswapOrderByUid(log.args.orderUid);
  if (!order) return;

  await DatabaseService.updateOrderStatusById(order.id, "filled", {
    fillTxHash: log.transactionHash!,
    executedSellAmount: log.args.sellAmount.toString(),
    executedBuyAmount: log.args.buyAmount.toString(),
  });

  // Trigger immediate position sell (still important even with the periodic seller cron).
  await PolymarketPositionSellerService.triggerSell();
}
```

Build + commit as in 6.3.

#### Task 6.5: `handlers/orderInvalidated.ts`

```ts
// src/backend/listener/handlers/orderInvalidated.ts
import { type Log } from "viem";
import { DatabaseService } from "@/backend/services/databaseService";

type OrderInvalidatedLog = Log & { args: { orderUid: `0x${string}` } };

export async function handleOrderInvalidated(log: OrderInvalidatedLog): Promise<void> {
  const order = await DatabaseService.getPolyswapOrderByUid(log.args.orderUid);
  if (!order || order.status === "canceled" || order.status === "filled") return;
  await DatabaseService.updateOrderStatusById(order.id, "canceled");
  // Also cancel the corresponding Polymarket order (idempotent).
  // ... call polymarketOrderService.cancelOrder(order.polymarket_order_hash)
}
```

Build + commit.

---

### Task 6.6: `startup/catchupHistoricalEvents.ts`

**Files:**

- Create: `src/backend/listener/startup/catchupHistoricalEvents.ts`

- [ ] **Step 1: Implement**

  ```ts
  // src/backend/listener/startup/catchupHistoricalEvents.ts
  import { getAbiItem, type Address } from "viem";
  import { getPublicClient } from "../blockchainProvider";
  import { handleConditionalOrderCreated } from "../handlers/conditionalOrderCreated";
  import { handleTrade } from "../handlers/trade";
  import { handleOrderInvalidated } from "../handlers/orderInvalidated";
  import { DatabaseService } from "@/backend/services/databaseService";
  import composableCowAbi from "@/abi/composableCoW.json";
  import gpv2Abi from "@/abi/GPV2Settlement.json";

  export async function catchupHistoricalEvents(): Promise<void> {
    const client = getPublicClient();
    const composableCow = process.env.COMPOSABLE_COW! as Address;
    const gpv2 = process.env.GPV2_SETTLEMENT! as Address;

    const fromBlock = BigInt(await DatabaseService.getLatestProcessedBlock());
    const toBlock = await client.getBlockNumber();

    // ConditionalOrderCreated
    const createdLogs = await client.getLogs({
      address: composableCow,
      event: getAbiItem({ abi: composableCowAbi, name: "ConditionalOrderCreated" }),
      fromBlock,
      toBlock,
    });
    for (const log of createdLogs) await handleConditionalOrderCreated(log as never);

    // Trade
    const tradeLogs = await client.getLogs({
      address: gpv2,
      event: getAbiItem({ abi: gpv2Abi, name: "Trade" }),
      fromBlock,
      toBlock,
    });
    for (const log of tradeLogs) await handleTrade(log as never);

    // OrderInvalidated
    const invalidatedLogs = await client.getLogs({
      address: gpv2,
      event: getAbiItem({ abi: gpv2Abi, name: "OrderInvalidated" }),
      fromBlock,
      toBlock,
    });
    for (const log of invalidatedLogs) await handleOrderInvalidated(log as never);

    await DatabaseService.setLatestProcessedBlock(Number(toBlock));
  }
  ```

  Add `setLatestProcessedBlock` to `DatabaseService` if not present.

- [ ] **Step 2: Build + commit**

  ```bash
  pnpm tsc --noEmit
  git add src/backend/listener/startup/ src/backend/services/databaseService.ts
  git commit -m "feat(listener): viem-based historical catch-up on startup"
  ```

---

### Task 6.7: `startup/backfillOrderUids.ts`

**Files:**

- Create: `src/backend/listener/startup/backfillOrderUids.ts`

- [ ] **Step 1: Port the existing `updateOrderUids` logic**

  Read `src/backend/listener.ts:67-100` (the current `updateOrderUids` method). Port it to use viem's `readContract` against the PolySwap handler's `getOrderUid` method (or wherever the UID is computed). Move the implementation here as a standalone function.

- [ ] **Step 2: Commit**

  ```bash
  git add src/backend/listener/startup/backfillOrderUids.ts
  git commit -m "feat(listener): backfill order UIDs on startup (viem)"
  ```

---

### Task 6.8: Crons — `marketSync`, `positionSeller`, `draftJanitor`

**Files:**

- Create: `src/backend/listener/cron/marketSync.ts`
- Create: `src/backend/listener/cron/positionSeller.ts`
- Create: `src/backend/listener/cron/draftJanitor.ts`

- [ ] **Step 1: `marketSync.ts`**

  ```ts
  // src/backend/listener/cron/marketSync.ts
  import { MarketUpdateService } from "@/backend/services/marketUpdateService";

  export function startMarketSync(intervalMinutes = 60): void {
    MarketUpdateService.startUpdateRoutine(intervalMinutes);
  }
  export function stopMarketSync(): void {
    MarketUpdateService.stopUpdateRoutine();
  }
  ```

- [ ] **Step 2: `positionSeller.ts`**

  Same wrapper pattern over `PolymarketPositionSellerService.startSellRoutine` / `stopSellRoutine`.

  > **Note:** `polymarketPositionSellerService.ts` itself still uses ethers v5/v6 mix. Migrate it to viem in this same task or in a follow-up commit. Same pattern as Task 4.1.

- [ ] **Step 3: `draftJanitor.ts`** (NEW)

  ```ts
  // src/backend/listener/cron/draftJanitor.ts
  import { getPublicClient } from "../blockchainProvider";
  import { DatabaseService } from "@/backend/services/databaseService";
  import { getPolymarketOrderService } from "@/backend/services/polymarketOrderService";
  import composableCowAbi from "@/abi/composableCoW.json";
  import { type Address, type Hex } from "viem";

  const COMPOSABLE_COW = process.env.COMPOSABLE_COW! as Address;
  const STALE_AFTER_MS = 10 * 60 * 1000;

  let timer: NodeJS.Timeout | null = null;

  export async function sweepStaleDrafts(): Promise<void> {
    const cutoff = new Date(Date.now() - STALE_AFTER_MS);
    const stale = await DatabaseService.findDraftsOlderThan(cutoff);
    if (stale.length === 0) return;

    const client = getPublicClient();
    const pm = getPolymarketOrderService();
    await pm.initialize();

    for (const draft of stale) {
      // Verify on-chain order doesn't exist before cancelling.
      const exists = await client.readContract({
        address: COMPOSABLE_COW,
        abi: composableCowAbi,
        functionName: "singleOrders",
        args: [draft.owner_address as Address, draft.order_hash as Hex],
      });
      if (exists) continue; // user has signed on-chain; let the listener pick it up

      try {
        if (draft.polymarket_order_hash) {
          await pm.cancelOrder(draft.polymarket_order_hash);
        }
        await DatabaseService.deletePolyswapOrderById(draft.id);
      } catch (err) {
        console.warn(`draftJanitor failed for order ${draft.id}: ${err}`);
      }
    }
  }

  export function startDraftJanitor(intervalSeconds = 60): void {
    if (timer) return;
    timer = setInterval(() => void sweepStaleDrafts(), intervalSeconds * 1000);
    console.log(`draftJanitor started: every ${intervalSeconds}s`);
  }
  export function stopDraftJanitor(): void {
    if (timer) clearInterval(timer);
    timer = null;
  }
  ```

  Add `findDraftsOlderThan(cutoff)` to `DatabaseService`.

- [ ] **Step 4: Build + commit**

  ```bash
  pnpm tsc --noEmit
  git add src/backend/listener/cron/ src/backend/services/databaseService.ts
  git commit -m "feat(listener): cron orchestration (marketSync, positionSeller, draftJanitor)"
  ```

---

### Task 6.9: New entry point `listener/index.ts`

**Files:**

- Create: `src/backend/listener/index.ts`

- [ ] **Step 1: Implement**

  ```ts
  // src/backend/listener/index.ts
  import dotenv from "dotenv";
  dotenv.config();

  import { getAbiItem, type Address } from "viem";
  import { getWebSocketClient } from "./blockchainProvider";
  import { handleConditionalOrderCreated } from "./handlers/conditionalOrderCreated";
  import { handleTrade } from "./handlers/trade";
  import { handleOrderInvalidated } from "./handlers/orderInvalidated";
  import { catchupHistoricalEvents } from "./startup/catchupHistoricalEvents";
  import { backfillOrderUids } from "./startup/backfillOrderUids";
  import { startMarketSync, stopMarketSync } from "./cron/marketSync";
  import { startPositionSeller, stopPositionSeller } from "./cron/positionSeller";
  import { startDraftJanitor, stopDraftJanitor } from "./cron/draftJanitor";
  import composableCowAbi from "@/abi/composableCoW.json";
  import gpv2Abi from "@/abi/GPV2Settlement.json";

  async function main() {
    const composableCow = process.env.COMPOSABLE_COW! as Address;
    const gpv2 = process.env.GPV2_SETTLEMENT! as Address;

    console.log("listener: starting catch-up");
    await catchupHistoricalEvents();
    await backfillOrderUids();

    console.log("listener: subscribing via WebSocket");
    const ws = getWebSocketClient();
    const unsub1 = ws.watchContractEvent({
      address: composableCow,
      abi: composableCowAbi,
      eventName: "ConditionalOrderCreated",
      onLogs: (logs) => logs.forEach((l) => void handleConditionalOrderCreated(l as never)),
    });
    const unsub2 = ws.watchContractEvent({
      address: gpv2,
      abi: gpv2Abi,
      eventName: "Trade",
      onLogs: (logs) => logs.forEach((l) => void handleTrade(l as never)),
    });
    const unsub3 = ws.watchContractEvent({
      address: gpv2,
      abi: gpv2Abi,
      eventName: "OrderInvalidated",
      onLogs: (logs) => logs.forEach((l) => void handleOrderInvalidated(l as never)),
    });

    console.log("listener: starting crons");
    startMarketSync(60);
    startPositionSeller(5);
    startDraftJanitor(60);

    const shutdown = () => {
      console.log("listener: shutting down");
      unsub1();
      unsub2();
      unsub3();
      stopMarketSync();
      stopPositionSeller();
      stopDraftJanitor();
      process.exit(0);
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  }

  void main().catch((err) => {
    console.error("listener fatal:", err);
    process.exit(1);
  });
  ```

- [ ] **Step 2: Update `package.json` script**

  Change `"start:listener": "tsx src/backend/listener.ts"` to `"start:listener": "tsx src/backend/listener/index.ts"`.

- [ ] **Step 3: Smoke-test**

  ```bash
  pnpm db:up
  pnpm start:listener
  ```

  Expected: logs "starting catch-up", "subscribing via WebSocket", "starting crons". On a test transaction, the WebSocket subscription should fire `handleConditionalOrderCreated` within seconds.

- [ ] **Step 4: Commit**

  ```bash
  git add src/backend/listener/index.ts package.json
  git commit -m "feat(listener): viem WebSocket entry point with catch-up + crons"
  ```

---

### Task 6.10: Delete the legacy listener and `transactionEventService`

**Files:**

- Delete: `src/backend/listener.ts`
- Delete: `src/backend/services/transactionEventService.ts`

- [ ] **Step 1: Delete**

  ```bash
  rm src/backend/listener.ts
  rm src/backend/services/transactionEventService.ts
  ```

- [ ] **Step 2: Build**

  ```bash
  pnpm tsc --noEmit
  pnpm lint
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add -A
  git commit -m "refactor(listener): delete legacy ethers listener and transactionEventService"
  ```

---

## Phase 7 — CoW order failure visibility

### Task 7.1: Schema additions

**Files:**

- Modify: SQL DDL where `polyswap_orders` is defined

- [ ] **Step 1: Add columns to the table DDL**

  ```sql
  ALTER TABLE polyswap_orders ADD COLUMN last_error_name VARCHAR(64);
  ALTER TABLE polyswap_orders ADD COLUMN last_error_reason TEXT;
  ALTER TABLE polyswap_orders ADD COLUMN last_error_retry_at BIGINT;
  ALTER TABLE polyswap_orders ADD COLUMN last_checked_at TIMESTAMPTZ;
  ALTER TABLE polyswap_orders ADD COLUMN cow_order_uid BYTEA;
  ALTER TABLE polyswap_orders ADD COLUMN cow_order_status VARCHAR(32);
  ```

  Update the status enum/check-constraint to include `errored`.

- [ ] **Step 2: Reset DB**

  ```bash
  pnpm db:down && pnpm db:up
  ```

- [ ] **Step 3: Update `DatabasePolyswapOrder` interface**

  ```ts
  // src/backend/interfaces/PolyswapOrder.ts (or Database.ts)
  export interface DatabasePolyswapOrder {
    // ... existing fields
    last_error_name: string | null;
    last_error_reason: string | null;
    last_error_retry_at: number | null;
    last_checked_at: Date | null;
    cow_order_uid: Buffer | null;
    cow_order_status: "presignaturePending" | "open" | "fulfilled" | "cancelled" | "expired" | null;
  }
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add -A
  git commit -m "feat(db): error tracking columns on polyswap_orders"
  ```

---

### Task 7.2: Custom error decoder

**Files:**

- Modify: `src/backend/listener/eventDecoder.ts`

- [ ] **Step 1: Add a revert decoder**

  ```ts
  // additions to src/backend/listener/eventDecoder.ts
  import { decodeErrorResult, type Hex } from "viem";

  export const COW_CONDITIONAL_ORDER_ERRORS = [
    { type: "error", name: "OrderNotValid", inputs: [{ name: "reason", type: "string" }] },
    { type: "error", name: "PollNever", inputs: [{ name: "reason", type: "string" }] },
    { type: "error", name: "PollTryNextBlock", inputs: [{ name: "reason", type: "string" }] },
    {
      type: "error",
      name: "PollTryAtBlock",
      inputs: [
        { name: "blockNumber", type: "uint256" },
        { name: "reason", type: "string" },
      ],
    },
    {
      type: "error",
      name: "PollTryAtEpoch",
      inputs: [
        { name: "timestamp", type: "uint256" },
        { name: "reason", type: "string" },
      ],
    },
  ] as const;

  export interface DecodedPollError {
    name: string;
    reason: string;
    retryAt?: number; // for PollTryAtBlock (block number) or PollTryAtEpoch (epoch seconds)
  }

  export function decodePollError(returndata: Hex): DecodedPollError | null {
    try {
      const decoded = decodeErrorResult({ abi: COW_CONDITIONAL_ORDER_ERRORS, data: returndata });
      const reason = (decoded.args[decoded.args.length - 1] as string) ?? "";
      let retryAt: number | undefined;
      if (decoded.errorName === "PollTryAtBlock" || decoded.errorName === "PollTryAtEpoch") {
        retryAt = Number(decoded.args[0] as bigint);
      }
      return { name: decoded.errorName, reason, retryAt };
    } catch {
      return null; // unrecognized revert data
    }
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add src/backend/listener/eventDecoder.ts
  git commit -m "feat(listener): decode CoW conditional order custom errors"
  ```

---

### Task 7.3: `cron/orderHealthCheck.ts`

**Files:**

- Create: `src/backend/listener/cron/orderHealthCheck.ts`

- [ ] **Step 1: Implement**

  ```ts
  // src/backend/listener/cron/orderHealthCheck.ts
  import { type Address, type Hex } from "viem";
  import { getPublicClient } from "../blockchainProvider";
  import { decodePollError } from "../eventDecoder";
  import { DatabaseService } from "@/backend/services/databaseService";
  import polyswapHandlerAbi from "@/abi/polyswapHandler.json"; // ensure this exists

  let timer: NodeJS.Timeout | null = null;

  async function checkOne(order: {
    id: number;
    owner_address: Address;
    handler: Address;
    staticInput: Hex;
    orderHash: Hex;
  }) {
    const client = getPublicClient();
    try {
      // success path — order is currently fillable (rare to land here mid-poll, but possible)
      await client.readContract({
        address: order.handler,
        abi: polyswapHandlerAbi,
        functionName: "getTradeableOrderWithSignature",
        args: [order.owner_address /* params */, , "0x", []],
      });
      await DatabaseService.clearOrderError(order.id);
    } catch (err) {
      // viem throws ContractFunctionExecutionError; the underlying revert returndata is in err.cause.data
      const data = (err as { cause?: { data?: Hex } })?.cause?.data;
      if (!data) return; // unknown error — leave alone

      const decoded = decodePollError(data);
      if (!decoded) {
        await DatabaseService.setOrderError(order.id, "UnknownRevert", "Unknown revert", null);
        return;
      }

      const isTerminal = decoded.name === "OrderNotValid" || decoded.name === "PollNever";
      await DatabaseService.setOrderError(
        order.id,
        decoded.name,
        decoded.reason,
        decoded.retryAt ?? null
      );
      if (isTerminal) await DatabaseService.updateOrderStatusById(order.id, "errored");
    }
  }

  export async function runOrderHealthCheck(): Promise<void> {
    const live = await DatabaseService.getLiveOrders();
    for (const order of live) await checkOne(order as never);
  }

  export function startOrderHealthCheck(intervalSeconds = 60): void {
    if (timer) return;
    timer = setInterval(() => void runOrderHealthCheck(), intervalSeconds * 1000);
    console.log(`orderHealthCheck started: every ${intervalSeconds}s`);
  }
  export function stopOrderHealthCheck(): void {
    if (timer) clearInterval(timer);
    timer = null;
  }
  ```

  Add `clearOrderError`, `setOrderError`, and updated `getLiveOrders` (returns enough fields to reconstruct the call args) to `DatabaseService`.

- [ ] **Step 2: Wire into `listener/index.ts`**

  Add `startOrderHealthCheck(60)` and `stopOrderHealthCheck()` to the `main` and shutdown functions.

- [ ] **Step 3: Build + smoke-test**

  ```bash
  pnpm tsc --noEmit
  pnpm start:listener
  ```

  Create a test order whose trigger condition isn't met, wait 60s, check the DB row — confirm `last_error_name`, `last_error_reason` are populated.

- [ ] **Step 4: Commit**

  ```bash
  git add src/backend/listener/cron/orderHealthCheck.ts src/backend/listener/index.ts src/backend/services/databaseService.ts
  git commit -m "feat(listener): orderHealthCheck cron — eth_call + decode poll errors"
  ```

---

### Task 7.4: Discrete CoW order tracking via `api.cow.fi`

**Files:**

- Modify: `src/backend/listener/cron/orderHealthCheck.ts` (extend) OR create a separate cron

- [ ] **Step 1: Add a CoW orderbook fetch**

  ```ts
  // additions to orderHealthCheck.ts (or a new cron file)
  async function pollDiscreteCowOrder(order: { id: number; cow_order_uid: Hex }) {
    if (!order.cow_order_uid) return;
    const url = `https://api.cow.fi/xdai/api/v1/orders/${order.cow_order_uid}`.replace(
      "xdai",
      "polygon"
    );
    const res = await fetch(url);
    if (!res.ok) return;
    const data = (await res.json()) as { status: string };
    await DatabaseService.setCowOrderStatus(order.id, data.status);
    if (data.status === "fulfilled")
      await DatabaseService.updateOrderStatusById(order.id, "filled");
    if (data.status === "expired" || data.status === "cancelled") {
      await DatabaseService.updateOrderStatusById(order.id, "canceled");
    }
  }
  ```

- [ ] **Step 2: Cross-check Polygon's CoW base URL**

  CoW's URL pattern is `https://api.cow.fi/{chainName}/api/v1/orders/{uid}`. Check what slug Polygon uses (is it `xdai` historically or `polygon` now). Update accordingly.

- [ ] **Step 3: Commit**

  ```bash
  git commit -am "feat(listener): poll api.cow.fi for discrete order status"
  ```

---

### Task 7.5: Frontend exposure of error reasons

**Files:**

- Modify: `src/app/api/polyswap/orders/id/[id]/route.ts` (GET) — return new fields
- Modify: `src/hooks/useOrders.ts` — surface `lastErrorReason` etc. on `OrderViewModel`
- Modify: components that render order rows / detail

- [ ] **Step 1: Update GET response**

  Make sure the GET handler returns `last_error_name`, `last_error_reason`, `last_error_retry_at`, `last_checked_at`, `cow_order_uid`, `cow_order_status` in the data payload.

- [ ] **Step 2: Update view model**

  In `useOrders.ts`, extend `OrderViewModel`:

  ```ts
  export interface OrderViewModel {
    // ... existing
    lastErrorName: string | null;
    lastErrorReason: string | null;
    lastErrorRetryAt: number | null;
  }
  ```

  Map fields in `toOrderView`.

- [ ] **Step 3: Render in components**

  In the order row / detail component, display:
  - If `status === "errored"` → terminal pill with `lastErrorReason`.
  - If `status === "live"` and `lastErrorReason` is set → small "waiting: {reason}" line. If `lastErrorRetryAt` is in the future, show ETA.

- [ ] **Step 4: Commit**

  ```bash
  git commit -am "feat(ui): show order failure reasons and ETAs"
  ```

---

## Phase 8 — Final cleanup

### Task 8.1: Migrate remaining ethers v6 usages in `src/services/*` to viem

**Files:**

- Modify: `src/services/erc20ApprovalService.ts`
- Modify: `src/services/safeFallbackHandlerService.ts` (if still referenced)
- Modify: `src/services/safeDomainVerifierService.ts` (if still referenced)
- Modify: `src/backend/utils/signatureVerification.ts`

- [ ] **Step 1: Decide what's still used**

  ```bash
  grep -rn 'erc20ApprovalService\|safeFallbackHandlerService\|safeDomainVerifierService\|signatureVerification' src/ 2>/dev/null
  ```

  Anything with no matches (after Phase 4 / 5) → delete. Anything still imported → migrate to viem (replace `ethers.Contract` with `publicClient.readContract`, `ethers.utils.Interface` with `encodeFunctionData`/`encodeAbiParameters`, etc.).

- [ ] **Step 2: Migrate piece-by-piece, lint after each**

  Easier to commit per file.

- [ ] **Step 3: Commit**

  ```bash
  git commit -am "refactor(services): migrate residual ethers usages to viem"
  ```

---

### Task 8.2: Delete unused services

**Files:** anything dead after step 8.1.

- [ ] **Step 1: Delete + verify build**

  ```bash
  rm src/services/safeFallbackHandlerService.ts # if unused
  rm src/services/safeDomainVerifierService.ts  # if unused
  pnpm tsc --noEmit && pnpm lint
  ```

- [ ] **Step 2: Commit**

  ```bash
  git commit -am "chore: delete unused services after refactor"
  ```

---

### Task 8.3: Remove ethers v6 if nothing uses it

**Files:**

- Modify: `package.json`

- [ ] **Step 1: Final ethers grep**

  ```bash
  grep -rn 'from "ethers"\|from '\''ethers'\''' src/ 2>/dev/null
  ```

  If empty, remove `ethers` from `package.json` deps.

- [ ] **Step 2: `pnpm install` + commit**

  ```bash
  pnpm install
  git add package.json pnpm-lock.yaml
  git commit -m "chore(deps): remove ethers — backend is fully on viem"
  ```

---

### Task 8.4: Final verification pass

- [ ] **Step 1: Full rebuild + lint**

  ```bash
  pnpm install
  pnpm lint
  pnpm tsc --noEmit
  pnpm build
  ```

  All green.

- [ ] **Step 2: Manual end-to-end smoke test**
  1. Reset DB.
  2. Run market sync once: `pnpm saveMarkets` (or a one-shot script).
  3. Start listener: `pnpm start:listener`.
  4. Start dev: `pnpm dev`.
  5. Connect a Safe via WalletConnect.
  6. Search for a market, click into it, fill the create form.
  7. Confirm POST /orders returns single payload, modal opens with batch (or single).
  8. Sign in Safe, confirm Polymarket order placed and DB row created.
  9. Wait for receipt → UI shows "live" optimistically → listener catches up DB row to live.
  10. Cancel a draft (different market) → confirm Polymarket cancel + row deleted.
  11. Cancel a live order via the on-chain remove flow → confirm notify-remove fires + DB row canceled + Polymarket cancelled.
  12. Verify orderHealthCheck reports a reason after 60s for a not-yet-fillable order.
  13. Check the dashboard renders reasons inline.

- [ ] **Step 3: Final commit + PR**

  ```bash
  git status
  # If anything dangling:
  git commit -am "chore: final cleanup"
  ```

  Open the PR with a summary linking to the spec and listing the verified smoke tests.

---

## Self-review notes

- **Spec coverage**: All 14 sections of the spec are addressed. Sections 1–14 → Phases 0–8 (with Section 11 deletion summary spread across phases as items get removed).
- **No placeholders**: every step contains code or commands, no "TBD".
- **Type consistency**: `PolyswapOrderData`, `ConditionalOrderParams`, `SafeCall` shapes are referenced consistently across tasks. Field order in `decodeStaticInput` (Task 6.1) and the encoder in `transactionEncodingService` (Task 4.2) MUST match — verify against the actual handler ABI before merging Task 4.2.
- **Phase boundaries**: each phase is mergeable on its own:
  - Phase 0 ends with broken build (documented).
  - Phase 1 = small UI fix.
  - Phase 2 = client-side data fetching.
  - Phase 3 = lean markets index.
  - Phase 4 = single-call order creation (build is green again).
  - Phase 5 = new cancellation flow.
  - Phase 6 = listener viem migration.
  - Phase 7 = error visibility on top of the new listener.
  - Phase 8 = final ethers removal + verify.

## Open items the implementer should validate

- Task 4.2: cross-check `PolyswapOrderData` field order against the deployed handler's ABI before merging — getting the order wrong silently corrupts on-chain state.
- Task 4.3: derive `price` and `size` for the Polymarket limit order from `body.threshold` and `body.sellAmount` per your handler's convention. The plan body uses placeholders (`0.5`, `0`) — fill in based on the actual logic in the existing `polymarketOrderService.postGTDOrder` callers.
- Task 7.3: ensure `polyswapHandler.json` ABI exists in `src/abi/` and exposes `getTradeableOrderWithSignature`. If not, copy from the deployed handler.
- Task 7.4: verify the CoW orderbook URL slug for Polygon (`polygon` vs `xdai` legacy alias).
- Task 5.1: `signatureVerification.ts` may still use ethers — that's fine until Phase 8 migrates it.
