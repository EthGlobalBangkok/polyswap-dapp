# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PolySwap is a DeFi application that enables automated token swaps triggered by prediction market outcomes. It consists of a Next.js frontend and Node.js backend that monitors Polygon blockchain events and serves Polymarket data.

## Commands

### Development
```bash
# Frontend development
pnpm dev                    # Start Next.js dev server (port 3000)
pnpm build                  # Build production frontend
pnpm start                  # Start production frontend
pnpm lint                   # Run ESLint

# Backend services
pnpm start:listener         # Start blockchain listener + market updater
pnpm start:listener-only    # Start only blockchain listener
pnpm start:market-updater   # Start only market updater (via listener)
pnpm start:market-updater-standalone # Start standalone market updater

# Database management
pnpm db:up                  # Start PostgreSQL container
pnpm db:down               # Stop PostgreSQL container
pnpm db:logs               # View database logs
pnpm db:import             # Import market data to database

# Market data management
pnpm saveMarkets           # Fetch markets from Polymarket API to data.json

# Utility scripts
pnpm get-polymarket-creds  # Get Polymarket credentials
pnpm cancel-polymarket-orders # Cancel all Polymarket orders
pnpm sell-polymarket-positions # Sell all Polymarket positions
```

### Testing and Linting
- Use `pnpm lint` to check code style with ESLint
- No specific test script configured - check if tests exist before assuming testing framework

## Architecture

### Frontend Structure
- **Next.js 15 with App Router**: Main frontend framework using React 19
- **Wagmi & Viem**: Ethereum wallet connection and blockchain interactions
- **TanStack Query**: Data fetching and caching
- **Safe Integration**: Gnosis Safe wallet support for batch transactions

### Backend Structure
- **Next API**: Serves market data and order information (src/app/api/)
- **Blockchain Listener**: Monitors ComposableCoW contract events (src/backend/listener.ts)
- **Database Services**: PostgreSQL operations (src/backend/services/)
- **Safe Services**: Gnosis Safe integration (src/services/)

### Key Components
- **Market Data**: Fetched from Polymarket CLOB API, stored in PostgreSQL
- **Order Processing**: Monitors ConditionalOrderCreated events, filters by PolySwap handler
- **Conditional Orders**: Built on CoW Swap's conditional order framework
- **Safe Integration**: Supports only Gnosis Safe wallets for order creation

### Database Schema
- **Markets table**: Stores Polymarket prediction market data
- **PolySwap Orders table**: Stores conditional order data from blockchain events

## Environment Configuration

Key environment variables (see .env.sample):
- **Database**: DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
- **Polymarket API**: CLOB_API_KEY, CLOB_SECRET, CLOB_PASS_PHRASE
- **Blockchain**: RPC_URL, STARTING_BLOCK, COMPOSABLE_COW, POLYSWAP_HANDLER
- **Market Updates**: MARKET_UPDATE_INTERVAL_MINUTES, AUTO_REMOVE_CLOSED_MARKETS

## Development Notes

### Package Manager
- Uses **pnpm** as package manager (not npm)
- Lock file is pnpm-lock.yaml

### TypeScript Configuration
- Uses ES2020 target with ESNext modules
- Path alias: `@/*` maps to `./src/*`
- Strict mode enabled

### Code Organization
- **src/app/**: Next.js App Router pages and API routes
- **src/backend/**: Standalone backend services (listener, database)
- **src/services/**: Frontend service layers (API, Safe, wallet)
- **src/components/**: React UI components
- **src/types/**: TypeScript type definitions
- **script/**: Utility scripts for data management

### API Endpoints
- **Markets**: `/api/markets/*` - Market data from Polymarket
- **Orders**: `/api/polyswap/orders/*` - PolySwap conditional orders
- **Health**: `/api/health` - Service health check

### Safe Integration
The application heavily integrates with Gnosis Safe for batch transaction support:
- **Safe Apps SDK**: For running inside Safe interface
- **WalletConnect Safe**: For connecting external Safe wallets
- **Batch Transactions**: Multiple operations combined into single Safe transaction
- **ERC20 Approvals**: Automated token approval management

### Event Monitoring
The blockchain listener monitors the ComposableCoW contract for:
- **ConditionalOrderCreated** events
- **Filters by handler**: Only processes PolySwap orders
- **Decodes staticInput**: Extracts order parameters from event data
- **Batch processing**: Handles large event ranges efficiently

### Market Data Flow
1. **Polymarket API** → fetch active markets
2. **Database storage** → persistent market data
3. **API endpoints** → serve to frontend
4. **Auto-updates** → configurable interval updates

## Common Development Patterns

### API Route Structure
All API routes follow Next.js App Router conventions in `src/app/api/`

### Database Operations
Use DatabaseService class in `src/backend/services/databaseService.ts` for all DB operations

### Safe Transaction Building
Use SafeBatchService for building multi-operation Safe transactions

### Error Handling
API routes include structured error responses with proper HTTP status codes

Don't create any migration script when the db need to be changed as i will reset entirely the db instead of doing a migration.
Keep in mind that the etherjs lib compatibility is not the same between the polymarket sdk and the wagmi lib so some tweak have been made.
Always watch out to not break any functionnalities when fixing or creating a new one. keep your code clean and easy to understand.
When changing a moajor thing in the architecture, ask me before doing anything and explain me why this changes are necessary.
Always do some web research one the official documentation when using some sdk, libs ... to make sur our up to date.
when creating some script only to test a feature. remove it at the end of the implementation.
code with industry quality.