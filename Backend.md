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

* **Next.js API Routes**: RESTful endpoints integrated with the frontend application
* **Blockchain Listener**: Real-time event monitoring using ethers.js
* **PostgreSQL Database**: Persistent storage with optimized indexing
* **Data Services**: Market data fetching from Polymarket CLOB API
* **Order UID Calculation**: Automatic order UID generation using PolySwap Handler contract

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

* **Runtime**: [Node.js](https://nodejs.org/) with [TypeScript](https://www.typescriptlang.org/)
* **Framework**: [Next.js 15](https://nextjs.org/) with App Router
* **Blockchain**: [ethers.js v6](https://docs.ethers.org/v6/) for Polygon interaction
* **Database**: [PostgreSQL 15](https://www.postgresql.org/) with Docker
* **Package Manager**: [pnpm](https://pnpm.io/) for fast, efficient dependency management

## 📡 API Endpoints

### Market Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/markets/top` | Top markets by volume |
| `GET` | `/api/markets/search?q=keywords` | Search markets by keywords |
| `GET` | `/api/markets/:id` | Get market by ID or condition ID |
| `GET` | `/api/markets/category/:category` | Get markets by category |
| `GET` | `/api/markets` | Get all markets with pagination |

### PolySwap Order Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/polyswap/orders/create` | Create a new draft order |
| `GET` | `/api/polyswap/orders/:owner` | Get orders by owner address |
| `GET` | `/api/polyswap/orders/hash/:orderHash` | Get order by hash |
| `GET` | `/api/polyswap/orders/id/:id` | Get order by ID |
| `PUT` | `/api/polyswap/orders/id/:id/transaction` | Update order with transaction hash |
| `GET` | `/api/polyswap/orders/id/:id/batch-transaction` | Get batch transaction data |
| `GET` | `/api/polyswap/orders` | Get all orders with pagination |
| `GET` | `/api/polyswap/orders/polymarket/:hash` | Get orders by Polymarket hash |
| `PUT` | `/api/polyswap/orders/remove` | Cancel/remove orders |

### Token Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/tokens` | Get supported token list |

### Utility Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Health check endpoint |

## 🔍 API Examples

### Create a New Order

```bash
curl -X POST "http://localhost:3000/api/polyswap/orders/create" \
  -H "Content-Type: application/json" \
  -d '{
    "sellToken": "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
    "buyToken": "0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6",
    "sellAmount": "1000000000",
    "minBuyAmount": "500000000000000000",
    "selectedOutcome": 0,
    "betPercentage": "50",
    "startDate": "now",
    "deadline": "2024-12-31T23:59:59Z",
    "marketId": "market_123",
    "owner": "0x1234...5678"
  }'
```

### Get Top Markets

```bash
curl "http://localhost:3000/api/markets/top"
```

### Search Markets

```bash
curl "http://localhost:3000/api/markets/search?q=trump,election&type=all"
```

### Get Orders by Owner

```bash
curl "http://localhost:3000/api/polyswap/orders/0x1234...5678"
```

### Update Order with Transaction Hash

```bash
curl -X PUT "http://localhost:3000/api/polyswap/orders/id/123/transaction" \
  -H "Content-Type: application/json" \
  -d '{
    "transactionHash": "0xabcd...1234"
  }'
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
  id: number;              // Database ID
  orderHash: string;       // Unique order identifier from event
  orderUid: string;        // CoW Protocol order UID (calculated)
  owner: string;           // Order creator address
  handler: string;         // PolySwap handler contract
  sellToken: string;       // Token to sell
  buyToken: string;        // Token to buy
  sellAmount: string;      // Amount to sell
  minBuyAmount: string;    // Minimum amount to receive
  startTime: Date;         // Order validity start
  endTime: Date;           // Order validity end
  polymarketOrderHash: string; // Related Polymarket order
  appData: string;         // Additional order data
  blockNumber: number;     // Block where order was created
  transactionHash: string; // Transaction hash
  logIndex: number;        // Event log index
  status: string;          // Order status (draft, live, filled, canceled)
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
│   └── api/                    # Next.js API routes
│       ├── health/            # Health check endpoints
│       ├── markets/           # Market data endpoints
│       ├── polyswap/          # Order management endpoints
│       └── tokens/            # Token information endpoints
├── backend/
│   ├── listener.ts            # Blockchain event listener
│   ├── db/
│   │   └── database.ts        # Database connection utilities
│   ├── interfaces/
│   │   ├── Market.ts          # Market data types
│   │   ├── PolyswapOrder.ts   # Order data types
│   │   └── Database.ts        # Database result types
│   └── services/
│       ├── databaseService.ts           # Database operations
│       ├── polymarketAPIService.ts      # External API integration
│       ├── orderUidCalculationService.ts # Order UID calculation
│       ├── transactionEventService.ts   # Event processing
│       └── transactionEncodingService.ts # Transaction encoding
└── components/                 # Frontend components
    └── ui/                    # UI components and order management
```

## 🧑‍💻 Authors

 | [<img src="https://github.com/Intermarch3.png?size=85" width=85><br><sub>Lucas Leclerc</sub>](https://github.com/Intermarch3) | [<img src="https://github.com/Pybast.png?size=85" width=85><br><sub>Baptiste Florentin</sub>](https://github.com/Pybast)
 | :---: | :---: |