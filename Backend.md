# 🔗 PolySwap Backend API

**Backend infrastructure for automated DeFi swaps triggered by on-chain prediction market outcomes.**

This repository contains the **PolySwap backend**, a comprehensive API and blockchain listener system that monitors, indexes, and serves data for conditional swap orders created through the CoW Swap protocol on Polygon.

## 🛠️ What It Does

The PolySwap backend provides:

- **📊 Market Data API**: Access to Polymarket prediction markets data with search, filtering, and pagination
- **🔍 Order Tracking**: Real-time monitoring of PolySwap conditional orders created on-chain
- **⚡ Blockchain Listener**: Automated event detection and processing from the ComposableCoW contract
- **💾 Data Storage**: PostgreSQL database for efficient querying and historical data access
- **🚀 Next.js API Routes**: Integrated API endpoints for frontend integration
- **🔢 Order UID Management**: Automatic calculation and storage of CoW Protocol order UIDs

## 🏗️ Architecture

### Core Components

- **Next.js API Routes**: RESTful endpoints integrated with the frontend application
- **Blockchain Listener**: Real-time event monitoring using viem (HTTP + WebSocket)
- **PostgreSQL Database**: Persistent storage with optimized indexing
- **Data Services**: Market data fetching from Polymarket CLOB API
- **Order UID Calculation**: Automatic order UID generation using PolySwap Handler contract

### Event Processing

The listener monitors the **ComposableCoW** contract for `ConditionalOrderCreated` events and:

1. **Filters** events to identify PolySwap orders (by handler address)
2. **Decodes** the staticInput to extract order parameters
3. **Calculates** order UIDs using the PolySwap Handler contract
4. **Validates** and processes the order data
5. **Stores** order information with UIDs in the database for API access

### Order UID Calculation

PolySwap automatically calculates and stores CoW Protocol order UIDs:

- Uses the PolySwap Handler contract for order hash calculation
- Combines order hash with owner address and validity timestamp
- Stores UIDs for efficient order lookup and matching
- Enables proper integration with CoW Protocol settlement

## 🧪 Stack

- **Runtime**: [Node.js](https://nodejs.org/) 20+ with [TypeScript](https://www.typescriptlang.org/) 5
- **Framework**: [Next.js 15](https://nextjs.org/) with App Router
- **Blockchain**: [viem](https://viem.sh/) + [wagmi](https://wagmi.sh/) for Polygon
- **Database**: [PostgreSQL](https://www.postgresql.org/) (managed — Nile) accessed via [Prisma 7](https://www.prisma.io/)
- **Package Manager**: [pnpm](https://pnpm.io/)

## 📡 API Endpoints

The full schema is generated from JSDoc `@swagger` blocks above each handler and served at `/api/swagger` (Swagger UI). The tables below are the canonical inventory.

### Market Endpoints

| Method | Endpoint                                 | Description                                                     |
| ------ | ---------------------------------------- | --------------------------------------------------------------- |
| `GET`  | `/api/markets/search?q=...&category=...` | Search markets (sort: volume / liquidity / end_date / interest) |
| `GET`  | `/api/markets/suggest?q=<prefix>`        | Tag autocomplete for the search bar                             |
| `GET`  | `/api/markets/counts?categories=A,B,C`   | Per-category market counts for the filter chips                 |
| `GET`  | `/api/markets/[slug]?track=1`            | Single market by slug or id; `?track=1` also bumps `view_count` |

### PolySwap Order Endpoints

| Method   | Endpoint                                     | Description                                                                        |
| -------- | -------------------------------------------- | ---------------------------------------------------------------------------------- |
| `GET`    | `/api/polyswap/orders`                       | List orders (filter by owner / block range; pagination)                            |
| `POST`   | `/api/polyswap/orders`                       | Create draft + place Polymarket GTD + return single-tx and approve+create batch    |
| `GET`    | `/api/polyswap/orders/[owner]`               | Orders for a specific owner address                                                |
| `GET`    | `/api/polyswap/orders/hash/[orderHash]`      | Lookup order by its on-chain `orderHash`                                           |
| `GET`    | `/api/polyswap/orders/id/[id]`               | Lookup order by numeric DB id                                                      |
| `DELETE` | `/api/polyswap/orders/id/[id]`               | Off-chain draft cancellation (signed `cancel_draft` EIP-191 message required)      |
| `POST`   | `/api/polyswap/orders/id/[id]/notify-remove` | Server-side finalisation after on-chain `ComposableCoW.remove(orderHash)` confirms |

### Utility Endpoints

| Method | Endpoint       | Description                     |
| ------ | -------------- | ------------------------------- |
| `GET`  | `/api/health`  | Health check                    |
| `GET`  | `/api/swagger` | Generated OpenAPI JSON (and UI) |

## 🔍 API Examples

### Create a new order

```bash
curl -X POST "http://localhost:3000/api/polyswap/orders" \
  -H "Content-Type: application/json" \
  -d '{
    "sellToken": "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
    "buyToken":  "0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6",
    "sellAmount": "1000000000",
    "minBuyAmount": "1",
    "selectedOutcome": "Yes",
    "betPercentage": 30,
    "startDate": "now",
    "marketId": "0x...",
    "owner": "0x1234...5678"
  }'
```

The response includes `tx` (single create call) and `batchTx` (approve + create), plus `fallbackSetupTx` — a self-call installing CoW's ExtensibleFallbackHandler when the Safe doesn't already have it.

### Search markets

```bash
curl "http://localhost:3000/api/markets/search?q=fed,rates&sort=interest"
```

### List orders for an owner

```bash
curl "http://localhost:3000/api/polyswap/orders/0x1234...5678?limit=50"
```

### Cancel a draft (off-chain)

```bash
curl -X DELETE "http://localhost:3000/api/polyswap/orders/id/123" \
  -H "Content-Type: application/json" \
  -d '{ "signature": "0x...", "timestamp": 1715200000 }'
```

## 🎧 Blockchain Listener

The listener continuously monitors the Polygon blockchain for PolySwap order creation events.

### Features

- **Historical Processing**: Catches up on missed events from a specified starting block
- **Real-time Monitoring**: Listens for new events as they occur
- **Error Handling**: Robust error recovery and reconnection logic
- **Data Validation**: Ensures order data integrity before database insertion
- **Batch Processing**: Efficient processing of large event ranges
- **Order UID Calculation**: Automatic generation of CoW Protocol order UIDs

### Order Data Structure

The listener extracts and stores the following order information:

```typescript
{
  id: number; // Database ID
  orderHash: string; // Unique order identifier from event
  orderUid: string; // CoW Protocol order UID (calculated)
  owner: string; // Order creator address
  handler: string; // PolySwap handler contract
  sellToken: string; // Token to sell
  buyToken: string; // Token to buy
  sellAmount: string; // Amount to sell
  minBuyAmount: string; // Minimum amount to receive
  startTime: Date; // Order validity start
  endTime: Date; // Order validity end
  polymarketOrderHash: string; // Related Polymarket order
  appData: string; // Additional order data
  blockNumber: number; // Block where order was created
  transactionHash: string; // Transaction hash
  logIndex: number; // Event log index
  status: string; // Order status (draft, live, filled, canceled)
}
```

## 🗄️ Database Schema

### Markets Table

Stores Polymarket prediction market data with essential fields for efficient querying:

- Market identifiers and metadata
- Outcome information and pricing
- Volume and liquidity data
- Category and search indexing

### PolySwap Orders Table

Stores conditional order data extracted from blockchain events with optimized indexes:

- Order parameters and timing
- Blockchain event data
- **Order UID storage** for CoW Protocol integration
- Status tracking and lifecycle management
- Foreign key relationships to markets

### Key Database Features

- **Order UID Indexing**: Fast lookup by CoW Protocol order UID
- **Owner Indexing**: Efficient queries by wallet address
- **Status Filtering**: Quick retrieval by order status
- **Timestamp Indexing**: Time-based queries and analytics

## 🔢 Order UID Management

PolySwap includes comprehensive order UID calculation and management:

### Calculation Process

1. **Event Detection**: ConditionalOrderCreated event triggers UID calculation
2. **Data Assembly**: Combines order parameters from database and event
3. **Contract Call**: Uses PolySwap Handler contract to calculate order hash
4. **UID Generation**: Combines order hash + owner + validTo timestamp
5. **Storage**: Saves UID to database for future reference

### Service Integration

- Automatic calculation during order finalization
- Integration with CoW Protocol settlement
- Support for order lookup by UID
- Efficient batching for historical orders

## 📊 Monitoring & Logging

The system provides comprehensive logging for:

- **API Requests**: Request/response logging with timing
- **Event Processing**: Detailed blockchain event processing logs
- **Database Operations**: Query execution and performance metrics
- **Order UID Calculation**: UID generation process and results
- **Error Tracking**: Structured error logging with context

### Code Structure

```
src/
├── app/
│   └── api/                              # Next.js API routes
│       ├── health/                       # Health check
│       ├── markets/                      # Market search / suggest / counts / [slug]
│       ├── polyswap/orders/              # Order CRUD + per-id sub-routes
│       └── swagger/                      # Generated OpenAPI JSON + UI
├── backend/
│   ├── listener/
│   │   ├── index.ts                      # Listener entry (also handles --listener-only / --market-update-only)
│   │   ├── blockchainProvider.ts         # viem public/wallet/websocket clients
│   │   ├── eventDecoder.ts               # ConditionalOrderCreated decoding
│   │   ├── handlers/                     # Per-event handlers
│   │   ├── startup/                      # Catch-up / backfill on boot
│   │   └── cron/                         # Recurring jobs (orderHealthCheck, marketUpdater, draftJanitor, positionSeller)
│   ├── db/                               # Prisma client + connection wiring
│   ├── services/
│   │   ├── databaseService.ts            # Prisma-backed data access
│   │   ├── polymarketAPIService.ts       # Polymarket gamma/data APIs
│   │   ├── polymarketOrderService.ts     # CLOB v2 order placement
│   │   ├── polymarketPositionSellerService.ts
│   │   ├── orderUidCalculationService.ts # CoW order UID calc
│   │   ├── transactionEncodingService.ts # CoW createWithContext + setFallbackHandler
│   │   ├── safeFallbackHandlerService.ts # Detects fresh Safes that need ExtensibleFallbackHandler
│   │   └── marketUpdateService.ts        # Polymarket → DB sync
│   ├── interfaces/                       # Shared TS types (Market, PolyswapOrder, Database)
│   ├── utils/                            # Misc helpers
│   └── logger.ts                         # createLogger() factory
├── components/                           # Frontend (App Router client components)
├── hooks/                                # React-query hooks + Safe sign flow
├── lib/                                  # Frontend utilities (format, posthog, rpc)
└── services/                             # Frontend service layer (apiService, safe types)
```

## 🧑‍💻 Authors

| [<img src="https://github.com/Intermarch3.png?size=85" width=85><br><sub>Lucas Leclerc</sub>](https://github.com/Intermarch3) | [<img src="https://github.com/Pybast.png?size=85" width=85><br><sub>Baptiste Florentin</sub>](https://github.com/Pybast) |
| :---------------------------------------------------------------------------------------------------------------------------: | :----------------------------------------------------------------------------------------------------------------------: |
