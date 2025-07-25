# 🔗 PolySwap Backend API

**Backend infrastructure for automated DeFi swaps triggered by on-chain prediction market outcomes.**

This repository contains the **PolySwap backend**, a comprehensive API and blockchain listener system that monitors, indexes, and serves data for conditional swap orders created through the CoW Swap protocol on Polygon.

## 🛠️ What It Does

The PolySwap backend provides:

- **📊 Market Data API**: Access to Polymarket prediction markets data with search, filtering, and pagination
- **🔍 Order Tracking**: Real-time monitoring of PolySwap conditional orders created on-chain
- **⚡ Blockchain Listener**: Automated event detection and processing from the ComposableCoW contract
- **💾 Data Storage**: PostgreSQL database for efficient querying and historical data access
- **🚀 RESTful API**: Clean endpoints for frontend integration and external applications

## 🏗️ Architecture

### Core Components

* **Express API Server**: RESTful endpoints for market and order data
* **Blockchain Listener**: Real-time event monitoring using ethers.js
* **PostgreSQL Database**: Persistent storage with optimized indexing
* **Data Services**: Market data fetching from Polymarket CLOB API

### Event Processing

The listener monitors the **ComposableCoW** contract for `ConditionalOrderCreated` events and:

1. **Filters** events to identify PolySwap orders (by handler address)
2. **Decodes** the staticInput to extract order parameters
3. **Validates** and processes the order data
4. **Stores** order information in the database for API access

## 🧪 Stack

* **Runtime**: [Node.js](https://nodejs.org/) with [TypeScript](https://www.typescriptlang.org/)
* **API Framework**: [Express.js](https://expressjs.com/)
* **Blockchain**: [ethers.js v6](https://docs.ethers.org/v6/) for Polygon interaction
* **Database**: [PostgreSQL 15](https://www.postgresql.org/) with Docker
* **Development**: [ts-node](https://typestrong.org/ts-node/) for development server

## 📡 API Endpoints

### Market Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/markets/top` | Top 50 markets by volume |
| `GET` | `/api/markets/search?q=keywords` | Search markets by keywords |
| `GET` | `/api/markets/:id` | Get market by ID or condition ID |
| `GET` | `/api/markets` | Get all markets with pagination |

### PolySwap Order Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/polyswap/orders/:owner` | Get orders by owner address |
| `GET` | `/api/polyswap/orders/hash/:orderHash` | Get order by hash |
| `GET` | `/api/polyswap/orders` | Get all orders with pagination |
| `GET` | `/api/polyswap/orders/polymarket/:hash` | Get orders by Polymarket hash |
| `GET` | `/api/polyswap/orders/stats` | Get order statistics |

### Utility Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check endpoint |
| `GET` | `/` | Welcome message |

## 🔍 API Examples

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

## 🎧 Blockchain Listener

The listener continuously monitors the Polygon blockchain for PolySwap order creation events.

### Features

- **Historical Processing**: Catches up on missed events from a specified starting block
- **Real-time Monitoring**: Listens for new events as they occur
- **Error Handling**: Robust error recovery and reconnection logic
- **Data Validation**: Ensures order data integrity before database insertion
- **Batch Processing**: Efficient processing of large event ranges

### Order Data Structure

The listener extracts and stores the following order information:

```typescript
{
  orderHash: string;        // Unique order identifier
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
}
```

## 🗄️ Database Schema

### Markets Table

Stores Polymarket prediction market data with essential fields for efficient querying.

### PolySwap Orders Table

Stores conditional order data extracted from blockchain events with optimized indexes for common query patterns.

## 📊 Monitoring & Logging

The system provides comprehensive logging for:

- **API Requests**: Request/response logging with timing
- **Event Processing**: Detailed blockchain event processing logs
- **Database Operations**: Query execution and performance metrics
- **Error Tracking**: Structured error logging with context

### Code Structure

```
src/
├── index.ts              # Express API server entry point
├── listener.ts           # Blockchain event listener
├── db/
│   └── database.ts       # Database connection utilities
├── interfaces/
│   ├── Market.ts         # Market data types
│   ├── PolyswapOrder.ts  # Order data types
│   └── Database.ts       # Database result types
├── routes/
│   ├── market.ts         # Market API endpoints
│   └── polyswapOrder.ts  # Order API endpoints
└── services/
    ├── databaseService.ts      # Database operations
    └── polymarketAPIService.ts # External API integration
```

## 🧑‍💻 Authors

 | [<img src="https://github.com/Intermarch3.png?size=85" width=85><br><sub>Lucas Leclerc</sub>](https://github.com/Intermarch3) | [<img src="https://github.com/Pybast.png?size=85" width=85><br><sub>Baptiste Florentin</sub>](https://github.com/Pybast)
 | :---: | :---: |
