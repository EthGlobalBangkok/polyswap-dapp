import {
  Prisma,
  type Market as PrismaMarket,
  type PolyswapOrder as PrismaPolyswapOrder,
  type SoldPosition as PrismaSoldPosition,
} from "@prisma/client";
import { prisma } from "../db/prisma";
import { type Market } from "../interfaces/Market";
import { type DatabaseMarket } from "../interfaces/Database";
import {
  type PolyswapOrderData,
  type PolyswapOrderRecord,
  type DatabasePolyswapOrder,
  type SoldPosition,
  type SoldPositionInput,
} from "../interfaces/PolyswapOrder";

export interface SearchMarketsOptions {
  q?: string;
  category?: string;
  categories?: string[];
  volumeMin?: number;
  liquidityMin?: number;
  sort?: "volume" | "liquidity" | "end_date" | "interest";
  limit?: number;
  offset?: number;
}

const INTEREST_MIN_VOLUME = 10_000;

const INTEREST_CATEGORY_BOOSTS: Record<string, number> = {
  Economy: 1.1,
  Crypto: 1.05,
};

const INTEREST_NOISE_REGEX = [
  "how many tweets",
  "number of tweets",
  "tweet count",
  "tweets in \\d{4}",
  "tweets between",
  "tweets per",
  "posts? \\d+(-\\d+)? tweets",
  "posts? \\d+\\+? tweets",
].join("|");

type OrderStatus = "draft" | "live" | "filled" | "canceled" | "errored";

type CowOrderStatus = NonNullable<DatabasePolyswapOrder["cow_order_status"]>;

function buildPrefixTsQuery(input: string): string | null {
  const terms = input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 0);
  if (terms.length === 0) return null;
  return terms.map((t) => `${t}:*`).join(" & ");
}

function decimalToNumber(value: Prisma.Decimal | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === "number" ? value : value.toNumber();
}

function toMarketRow(m: PrismaMarket): DatabaseMarket {
  return {
    id: m.id,
    slug: m.slug,
    event_slug: m.eventSlug,
    question: m.question,
    description: m.description,
    category: m.category,
    tags: m.tags,
    outcomes: Array.isArray(m.outcomes) ? (m.outcomes as string[]) : [],
    volume: decimalToNumber(m.volume),
    liquidity: decimalToNumber(m.liquidity),
    end_date: m.endDate,
    clob_token_ids: m.clobTokenIds,
    active: m.active ?? true,
    updated_at: m.updatedAt ?? undefined,
  };
}

function toPolyswapOrderRow(o: PrismaPolyswapOrder): DatabasePolyswapOrder {
  return {
    id: o.id,
    order_hash: o.orderHash,
    owner: o.owner,
    handler: o.handler ?? "",
    sell_token: o.sellToken,
    buy_token: o.buyToken,
    sell_amount: o.sellAmount.toString(),
    min_buy_amount: o.minBuyAmount.toString(),
    start_time: o.startTime,
    end_time: o.endTime,
    polymarket_order_hash: o.polymarketOrderHash ?? "",
    app_data: o.appData ?? "",
    block_number: Number(o.blockNumber ?? 0),
    transaction_hash: o.transactionHash ?? "",
    log_index: o.logIndex ?? 0,
    market_id: o.marketId,
    outcome_selected: o.outcomeSelected,
    bet_percentage: o.betPercentage === null ? null : decimalToNumber(o.betPercentage),
    status: o.status as OrderStatus,
    order_uid: o.orderUid,
    salt: o.salt,
    last_error_name: o.lastErrorName,
    last_error_reason: o.lastErrorReason,
    last_error_retry_at: o.lastErrorRetryAt === null ? null : o.lastErrorRetryAt.toString(),
    last_checked_at: o.lastCheckedAt,
    cow_order_status: (o.cowOrderStatus as CowOrderStatus | null) ?? null,
    created_at: o.createdAt,
    updated_at: o.updatedAt,
  };
}

function toSoldPositionRow(s: PrismaSoldPosition): SoldPosition {
  return {
    id: s.id,
    asset_id: s.assetId,
    condition_id: s.conditionId,
    size: decimalToNumber(s.size),
    sell_price: decimalToNumber(s.sellPrice),
    current_price: decimalToNumber(s.currentPrice),
    order_id: s.orderId,
    market_title: s.marketTitle ?? "",
    outcome: s.outcome ?? "",
    sold_at: s.soldAt,
  };
}

const SEARCH_VEC_EXPR = Prisma.sql`(
  setweight(to_tsvector('english', "question"), 'A') ||
  setweight(to_tsvector('simple',  regexp_replace("tags"::text, '[{},"]', ' ', 'g')), 'B') ||
  setweight(to_tsvector('simple',  "slug"), 'C') ||
  setweight(to_tsvector('english', coalesce("description", '')), 'D')
)`;

export class DatabaseService {
  static async upsertMarket(market: Market): Promise<void> {
    // Nile blocks GENERATED columns, so we populate `search_vec` ourselves on
    // every write — matches the behaviour of the original BEFORE-trigger.
    await prisma.$executeRaw`
      INSERT INTO markets (
        id, slug, event_slug, question, description, category, tags, outcomes,
        volume, liquidity, end_date, clob_token_ids, active, updated_at, search_vec
      )
      VALUES (
        ${market.id}, ${market.slug}, ${market.eventSlug}, ${market.question},
        ${market.description}, ${market.category}, ${market.tags},
        ${JSON.stringify(market.outcomes)}::jsonb,
        ${market.volume}, ${market.liquidity}, ${market.endDate},
        ${market.clobTokenIds}, ${market.active}, NOW(),
        ${SEARCH_VEC_EXPR}
      )
      ON CONFLICT (id) DO UPDATE SET
        slug           = EXCLUDED.slug,
        event_slug     = EXCLUDED.event_slug,
        question       = EXCLUDED.question,
        description    = EXCLUDED.description,
        category       = EXCLUDED.category,
        tags           = EXCLUDED.tags,
        outcomes       = EXCLUDED.outcomes,
        volume         = EXCLUDED.volume,
        liquidity      = EXCLUDED.liquidity,
        end_date       = EXCLUDED.end_date,
        clob_token_ids = EXCLUDED.clob_token_ids,
        active         = EXCLUDED.active,
        updated_at     = NOW(),
        search_vec     = EXCLUDED.search_vec
    `;
  }

  /**
   * Tags are stored already lowercased so the suggestion lookup index can be
   * a plain B-tree (Nile blocks function calls in index expressions).
   */
  static async refreshTagIndex(): Promise<number> {
    return prisma.$transaction(async (tx) => {
      await tx.tagIndex.deleteMany();
      const rows = await tx.$queryRaw<{ tag: string; market_count: number }[]>`
        SELECT lower(tag) AS tag, COUNT(*)::int AS market_count
        FROM markets, unnest(tags) AS tag
        WHERE active = TRUE
        GROUP BY lower(tag)
      `;
      if (rows.length === 0) return 0;
      await tx.tagIndex.createMany({
        data: rows.map((r) => ({ tag: r.tag, marketCount: r.market_count })),
      });
      return rows.length;
    });
  }

  static async getTagSuggestions(
    prefix: string,
    limit: number
  ): Promise<Array<{ tag: string; count: number }>> {
    if (prefix.length === 0) return [];
    const rows = await prisma.tagIndex.findMany({
      where: { tag: { startsWith: prefix.toLowerCase() } },
      orderBy: [{ marketCount: "desc" }, { tag: "asc" }],
      take: limit,
    });
    return rows.map((r) => ({ tag: r.tag, count: r.marketCount }));
  }

  static async removeEndedMarkets(): Promise<number> {
    const { count } = await prisma.market.deleteMany({
      where: { endDate: { lt: new Date() } },
    });
    return count;
  }

  static async countMarkets(opts: SearchMarketsOptions): Promise<number> {
    const where = this.buildSearchWhere(opts);
    const rows = await prisma.$queryRaw<{ total: number }[]>`
      SELECT COUNT(*)::int AS total FROM markets WHERE ${where}
    `;
    return rows[0]?.total ?? 0;
  }

  static async getMarketCountsByCategory(categories: string[]): Promise<Record<string, number>> {
    if (categories.length === 0) return {};
    const rows = await prisma.market.groupBy({
      by: ["category"],
      where: { active: true, category: { in: categories } },
      _count: { _all: true },
    });
    const out: Record<string, number> = Object.fromEntries(categories.map((c) => [c, 0]));
    for (const r of rows) {
      if (r.category) out[r.category] = r._count._all;
    }
    return out;
  }

  static async searchMarkets(opts: SearchMarketsOptions): Promise<DatabaseMarket[]> {
    const { sort = "volume", limit = 50, offset = 0, category, q } = opts;

    const filters: Prisma.Sql[] = [this.buildSearchWhere(opts)];
    if (sort === "interest") {
      if (!category) {
        filters.push(Prisma.sql`end_date > NOW() + INTERVAL '48 hours'`);
        filters.push(Prisma.sql`volume >= ${INTEREST_MIN_VOLUME}`);
      }
      if (!q) {
        filters.push(Prisma.sql`question !~* ${INTEREST_NOISE_REGEX}`);
      }
    }
    const where = Prisma.join(filters, " AND ");

    const orderBy = this.buildOrderBy(sort, Boolean(category));

    const rows = await prisma.$queryRaw<PrismaMarket[]>`
      SELECT id, slug, event_slug AS "eventSlug", question, description, category,
             tags, outcomes, volume, liquidity, end_date AS "endDate",
             clob_token_ids AS "clobTokenIds", active, updated_at AS "updatedAt"
      FROM markets
      WHERE ${where}
      ORDER BY ${orderBy}
      LIMIT ${limit} OFFSET ${offset}
    `;
    return rows.map(toMarketRow);
  }

  static async getMarketById(id: string): Promise<DatabaseMarket | null> {
    const row = await prisma.market.findUnique({ where: { id } });
    return row ? toMarketRow(row) : null;
  }

  static async getMarketBySlug(slug: string): Promise<DatabaseMarket | null> {
    const row = await prisma.market.findUnique({ where: { slug } });
    return row ? toMarketRow(row) : null;
  }

  // ============================================================
  // PolySwap Orders
  // ============================================================

  static async insertPolyswapOrderFromForm(orderData: {
    sellToken: string;
    buyToken: string;
    sellAmount: string;
    minBuyAmount: string;
    startDate: string;
    deadline: string;
    marketId: string;
    owner: string;
    outcomeSelected: string;
    betPercentageValue: number;
    polymarketOrderHash: string;
    salt: string;
  }): Promise<number> {
    const created = await prisma.polyswapOrder.create({
      data: {
        owner: orderData.owner.toLowerCase(),
        sellToken: orderData.sellToken.toLowerCase(),
        buyToken: orderData.buyToken.toLowerCase(),
        sellAmount: new Prisma.Decimal(orderData.sellAmount),
        minBuyAmount: new Prisma.Decimal(orderData.minBuyAmount),
        startTime: new Date(orderData.startDate),
        endTime: new Date(orderData.deadline),
        marketId: orderData.marketId,
        outcomeSelected: orderData.outcomeSelected,
        betPercentage: new Prisma.Decimal(orderData.betPercentageValue),
        polymarketOrderHash: orderData.polymarketOrderHash,
        salt: orderData.salt,
        status: "draft",
      },
      select: { id: true },
    });
    return created.id;
  }

  static async insertPolyswapOrder(order: PolyswapOrderRecord): Promise<void> {
    const blockNumber = Number(order.blockNumber);
    const logIndex = Number(order.logIndex);
    if (!Number.isFinite(blockNumber) || !Number.isFinite(logIndex)) {
      throw new Error(`Invalid numeric values: blockNumber=${blockNumber}, logIndex=${logIndex}`);
    }

    const data: Prisma.PolyswapOrderUncheckedCreateInput = {
      orderHash: order.orderHash,
      owner: order.owner.toLowerCase(),
      handler: order.handler.toLowerCase(),
      sellToken: order.sellToken.toLowerCase(),
      buyToken: order.buyToken.toLowerCase(),
      sellAmount: new Prisma.Decimal(order.sellAmount),
      minBuyAmount: new Prisma.Decimal(order.minBuyAmount),
      startTime: new Date(order.startTime * 1000),
      endTime: new Date(order.endTime * 1000),
      polymarketOrderHash: order.polymarketOrderHash,
      appData: order.appData,
      blockNumber: BigInt(blockNumber),
      transactionHash: order.transactionHash,
      logIndex,
      salt: order.salt ?? null,
      status: "live",
    };

    await prisma.polyswapOrder.upsert({
      where: { orderHash: order.orderHash },
      create: data,
      update: {
        owner: data.owner,
        handler: data.handler,
        sellToken: data.sellToken,
        buyToken: data.buyToken,
        sellAmount: data.sellAmount,
        minBuyAmount: data.minBuyAmount,
        startTime: data.startTime,
        endTime: data.endTime,
        polymarketOrderHash: data.polymarketOrderHash,
        appData: data.appData,
        blockNumber: data.blockNumber,
        transactionHash: data.transactionHash,
        logIndex: data.logIndex,
        salt: data.salt,
        status: data.status,
        updatedAt: new Date(),
      },
    });
  }

  /**
   * - If a draft row exists for (polymarket_order_hash, owner) → upgrade to live
   *   and stamp the on-chain coordinates. Standard frontend-then-listener path.
   * - Otherwise → fresh live insert. Catch-up path when the draft was lost.
   */
  static async upsertLiveOrderFromEvent(input: {
    owner: string;
    orderHash: string;
    handler: string;
    salt: string;
    data: PolyswapOrderData;
    blockNumber: number;
    transactionHash: string;
    logIndex: number;
  }): Promise<void> {
    const ownerLc = input.owner.toLowerCase();
    const draft = await prisma.polyswapOrder.findFirst({
      where: {
        polymarketOrderHash: input.data.polymarketOrderHash,
        owner: ownerLc,
        status: "draft",
      },
      select: { id: true },
    });

    if (draft) {
      await prisma.polyswapOrder.update({
        where: { id: draft.id },
        data: {
          status: "live",
          orderHash: input.orderHash,
          handler: input.handler.toLowerCase(),
          transactionHash: input.transactionHash,
          blockNumber: BigInt(input.blockNumber),
          logIndex: input.logIndex,
          appData: input.data.appData,
          salt: input.salt,
          updatedAt: new Date(),
        },
      });
      return;
    }

    await this.insertPolyswapOrder({
      orderHash: input.orderHash,
      owner: ownerLc,
      handler: input.handler.toLowerCase(),
      sellToken: input.data.sellToken,
      buyToken: input.data.buyToken,
      sellAmount: input.data.sellAmount,
      minBuyAmount: input.data.minBuyAmount,
      startTime: parseInt(input.data.t0, 10),
      endTime: parseInt(input.data.t, 10),
      polymarketOrderHash: input.data.polymarketOrderHash,
      appData: input.data.appData,
      blockNumber: input.blockNumber,
      transactionHash: input.transactionHash,
      logIndex: input.logIndex,
      createdAt: new Date(),
      salt: input.salt,
    });
  }

  static async getPolyswapOrdersByOwner(
    ownerAddress: string,
    limit: number = 100,
    offset: number = 0
  ): Promise<DatabasePolyswapOrder[]> {
    const where = ownerAddress.trim() ? { owner: ownerAddress.toLowerCase() } : undefined;
    const rows = await prisma.polyswapOrder.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    });
    return rows.map(toPolyswapOrderRow);
  }

  static async getPolyswapOrderByHash(orderHash: string): Promise<DatabasePolyswapOrder | null> {
    const row = await prisma.polyswapOrder.findUnique({ where: { orderHash } });
    return row ? toPolyswapOrderRow(row) : null;
  }

  static async getPolyswapOrderById(id: number): Promise<DatabasePolyswapOrder | null> {
    const row = await prisma.polyswapOrder.findUnique({ where: { id } });
    return row ? toPolyswapOrderRow(row) : null;
  }

  /**
   * Persisted cursor lives in `listener_state.last_processed_block`. Fall back
   * to MAX(block_number) on first run / pre-cursor environments.
   */
  static async getLatestProcessedBlock(): Promise<number> {
    const state = await prisma.listenerState.findUnique({
      where: { key: "last_processed_block" },
    });
    if (state) return Number(state.value);

    const fallback = await prisma.polyswapOrder.aggregate({ _max: { blockNumber: true } });
    return Number(fallback._max.blockNumber ?? 0);
  }

  static async setLatestProcessedBlock(blockNumber: number): Promise<void> {
    await prisma.listenerState.upsert({
      where: { key: "last_processed_block" },
      create: { key: "last_processed_block", value: BigInt(blockNumber) },
      update: { value: BigInt(blockNumber), updatedAt: new Date() },
    });
  }

  static async getPolyswapOrdersByBlockRange(
    fromBlock: number,
    toBlock: number
  ): Promise<DatabasePolyswapOrder[]> {
    const rows = await prisma.polyswapOrder.findMany({
      where: { blockNumber: { gte: BigInt(fromBlock), lte: BigInt(toBlock) } },
      orderBy: [{ blockNumber: "asc" }, { logIndex: "asc" }],
    });
    return rows.map(toPolyswapOrderRow);
  }

  static async getPolyswapOrdersByPolymarketHash(
    polymarketHash: string
  ): Promise<DatabasePolyswapOrder[]> {
    const rows = await prisma.polyswapOrder.findMany({
      where: { polymarketOrderHash: polymarketHash },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(toPolyswapOrderRow);
  }

  static async updateOrderStatus(
    orderHash: string,
    status: "draft" | "live" | "filled" | "canceled"
  ): Promise<boolean> {
    try {
      const result = await prisma.polyswapOrder.updateMany({
        where: { orderHash },
        data: { status, updatedAt: new Date() },
      });
      return result.count > 0;
    } catch (error) {
      console.error(`Error updating order status for ${orderHash}:`, error);
      return false;
    }
  }

  static async updateOrderStatusById(
    orderId: number,
    status: OrderStatus,
    fillDetails?: {
      filledAt?: Date;
      fillTransactionHash?: string;
      fillBlockNumber?: number;
      fillLogIndex?: number;
      actualSellAmount?: string;
      actualBuyAmount?: string;
      feeAmount?: string;
    }
  ): Promise<boolean> {
    const data: Prisma.PolyswapOrderUpdateInput = { status, updatedAt: new Date() };
    if (fillDetails?.filledAt) data.filledAt = fillDetails.filledAt;
    if (fillDetails?.fillTransactionHash) {
      data.fillTransactionHash = fillDetails.fillTransactionHash;
    }
    if (fillDetails?.fillBlockNumber !== undefined) {
      data.fillBlockNumber = BigInt(fillDetails.fillBlockNumber);
    }
    if (fillDetails?.fillLogIndex !== undefined) data.fillLogIndex = fillDetails.fillLogIndex;
    if (fillDetails?.actualSellAmount) {
      data.actualSellAmount = new Prisma.Decimal(fillDetails.actualSellAmount);
    }
    if (fillDetails?.actualBuyAmount) {
      data.actualBuyAmount = new Prisma.Decimal(fillDetails.actualBuyAmount);
    }
    if (fillDetails?.feeAmount) data.feeAmount = new Prisma.Decimal(fillDetails.feeAmount);

    try {
      await prisma.polyswapOrder.update({ where: { id: orderId }, data });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        return false;
      }
      console.error(`Error updating order status for ID ${orderId}:`, error);
      return false;
    }
  }

  static async setOrderError(
    id: number,
    errorName: string,
    reason: string,
    retryAt: number | null
  ): Promise<void> {
    await prisma.polyswapOrder.update({
      where: { id },
      data: {
        lastErrorName: errorName,
        lastErrorReason: reason,
        lastErrorRetryAt: retryAt === null ? null : BigInt(retryAt),
        lastCheckedAt: new Date(),
        updatedAt: new Date(),
      },
    });
  }

  static async clearOrderError(id: number): Promise<void> {
    await prisma.polyswapOrder.update({
      where: { id },
      data: {
        lastErrorName: null,
        lastErrorReason: null,
        lastErrorRetryAt: null,
        lastCheckedAt: new Date(),
        updatedAt: new Date(),
      },
    });
  }

  static async setCowOrderStatus(id: number, status: string): Promise<boolean> {
    try {
      await prisma.polyswapOrder.update({
        where: { id },
        data: { cowOrderStatus: status, updatedAt: new Date() },
      });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        return false;
      }
      throw error;
    }
  }

  static async deletePolyswapOrderById(id: number): Promise<void> {
    await prisma.polyswapOrder.delete({ where: { id } });
  }

  static async findDraftsOlderThan(cutoff: Date): Promise<DatabasePolyswapOrder[]> {
    const rows = await prisma.polyswapOrder.findMany({
      where: { status: "draft", createdAt: { lt: cutoff } },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(toPolyswapOrderRow);
  }

  static async updateOrderPolymarketHash(
    orderHash: string,
    polymarketOrderHash: string
  ): Promise<boolean> {
    const result = await prisma.polyswapOrder.updateMany({
      where: { orderHash },
      data: { polymarketOrderHash, updatedAt: new Date() },
    });
    return result.count > 0;
  }

  static async updateOrderPolymarketHashById(
    orderId: number,
    polymarketOrderHash: string
  ): Promise<boolean> {
    try {
      await prisma.polyswapOrder.update({
        where: { id: orderId },
        data: { polymarketOrderHash, updatedAt: new Date() },
      });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        return false;
      }
      throw error;
    }
  }

  static async updateOrderTransactionHashById(
    orderId: number,
    transactionHash: string
  ): Promise<boolean> {
    try {
      await prisma.polyswapOrder.update({
        where: { id: orderId },
        data: { transactionHash, status: "live", updatedAt: new Date() },
      });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        return false;
      }
      throw error;
    }
  }

  static async getOrdersByStatus(
    status: "draft" | "live" | "filled" | "canceled",
    limit: number = 100,
    offset: number = 0
  ): Promise<DatabasePolyswapOrder[]> {
    const rows = await prisma.polyswapOrder.findMany({
      where: { status },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    });
    return rows.map(toPolyswapOrderRow);
  }

  static async getPolyswapOrderByHashAndOwner(
    orderHash: string,
    ownerAddress: string
  ): Promise<DatabasePolyswapOrder | null> {
    const row = await prisma.polyswapOrder.findFirst({
      where: { orderHash, owner: ownerAddress.toLowerCase() },
    });
    return row ? toPolyswapOrderRow(row) : null;
  }

  /**
   * Listener catch-up path: stamp the full set of on-chain coordinates and
   * advance the row to "live" in a single update.
   */
  static async updateOrderTransactionDetails(
    orderId: number,
    transactionHash: string,
    blockNumber: number,
    logIndex: number,
    handler: string,
    appData: string,
    orderHash: string,
    orderUid?: string
  ): Promise<boolean> {
    try {
      await prisma.polyswapOrder.update({
        where: { id: orderId },
        data: {
          transactionHash,
          blockNumber: BigInt(blockNumber),
          logIndex,
          handler: handler.toLowerCase(),
          appData,
          orderHash,
          orderUid: orderUid ?? null,
          status: "live",
          updatedAt: new Date(),
        },
      });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        return false;
      }
      throw error;
    }
  }

  static async updateOrderUid(orderHash: string, orderUid: string): Promise<boolean> {
    const result = await prisma.polyswapOrder.updateMany({
      where: { orderHash },
      data: { orderUid, updatedAt: new Date() },
    });
    return result.count > 0;
  }

  static async getPolyswapOrderByUid(orderUid: string): Promise<DatabasePolyswapOrder | null> {
    const row = await prisma.polyswapOrder.findFirst({ where: { orderUid } });
    return row ? toPolyswapOrderRow(row) : null;
  }

  static async getLiveOrdersWithoutUid(): Promise<DatabasePolyswapOrder[]> {
    const rows = await prisma.polyswapOrder.findMany({
      where: {
        status: "live",
        OR: [{ orderUid: null }, { orderUid: "" }],
      },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(toPolyswapOrderRow);
  }

  static async getLiveOrders(): Promise<DatabasePolyswapOrder[]> {
    const rows = await prisma.polyswapOrder.findMany({
      where: { status: "live" },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(toPolyswapOrderRow);
  }

  static async getAllPolyswapOrders(): Promise<DatabasePolyswapOrder[]> {
    const rows = await prisma.polyswapOrder.findMany({ orderBy: { createdAt: "asc" } });
    return rows.map(toPolyswapOrderRow);
  }

  // ============================================================
  // Sold Positions
  // ============================================================

  static async recordSoldPosition(input: SoldPositionInput): Promise<number> {
    const created = await prisma.soldPosition.create({
      data: {
        assetId: input.assetId,
        conditionId: input.conditionId,
        size: new Prisma.Decimal(input.size),
        sellPrice: new Prisma.Decimal(input.sellPrice),
        currentPrice: new Prisma.Decimal(input.currentPrice),
        orderId: input.orderId,
        marketTitle: input.marketTitle,
        outcome: input.outcome,
      },
      select: { id: true },
    });
    return created.id;
  }

  static async getRecentlySoldPositions(hoursAgo: number = 24): Promise<SoldPosition[]> {
    const since = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
    const rows = await prisma.soldPosition.findMany({
      where: { soldAt: { gt: since } },
      orderBy: { soldAt: "desc" },
    });
    return rows.map(toSoldPositionRow);
  }

  static async getSoldPositionByAsset(assetId: string): Promise<SoldPosition | null> {
    const row = await prisma.soldPosition.findFirst({
      where: { assetId },
      orderBy: { soldAt: "desc" },
    });
    return row ? toSoldPositionRow(row) : null;
  }

  static async getAllSoldPositions(
    limit: number = 100,
    offset: number = 0
  ): Promise<SoldPosition[]> {
    const rows = await prisma.soldPosition.findMany({
      orderBy: { soldAt: "desc" },
      take: limit,
      skip: offset,
    });
    return rows.map(toSoldPositionRow);
  }

  static async getSoldPositionsStats(): Promise<{
    totalSold: number;
    totalValue: number;
    last24Hours: number;
  }> {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [totalSold, last24Hours, valueAgg] = await Promise.all([
      prisma.soldPosition.count(),
      prisma.soldPosition.count({ where: { soldAt: { gt: since24h } } }),
      prisma.$queryRaw<{ total: string | null }[]>`
        SELECT COALESCE(SUM(size * sell_price), 0)::text AS total FROM sold_positions
      `,
    ]);
    return {
      totalSold,
      totalValue: parseFloat(valueAgg[0]?.total ?? "0"),
      last24Hours,
    };
  }

  static async cleanupOldSoldPositions(daysOld: number = 30): Promise<number> {
    const cutoff = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
    const { count } = await prisma.soldPosition.deleteMany({
      where: { soldAt: { lt: cutoff } },
    });
    return count;
  }

  static async deleteSoldPositionByOrderId(orderId: string): Promise<boolean> {
    const { count } = await prisma.soldPosition.deleteMany({ where: { orderId } });
    return count > 0;
  }

  static async deleteSoldPositionByAssetId(assetId: string): Promise<number> {
    const { count } = await prisma.soldPosition.deleteMany({ where: { assetId } });
    return count;
  }

  static async cleanupFailedSoldPositions(): Promise<number> {
    const { count } = await prisma.soldPosition.deleteMany({
      where: { OR: [{ orderId: "unknown" }, { orderId: "" }] },
    });
    if (count > 0) console.log(`Cleaned up ${count} failed sold position record(s)`);
    return count;
  }

  // ============================================================
  // Internal helpers for the search query
  // ============================================================

  private static buildSearchWhere(opts: SearchMarketsOptions): Prisma.Sql {
    const { q, category, categories, volumeMin = 0, liquidityMin = 0 } = opts;

    const fragments: Prisma.Sql[] = [
      Prisma.sql`active = TRUE`,
      Prisma.sql`volume >= ${volumeMin}`,
      Prisma.sql`liquidity >= ${liquidityMin}`,
    ];

    if (category) fragments.push(Prisma.sql`category = ${category}`);
    if (categories && categories.length > 0) {
      fragments.push(Prisma.sql`category = ANY(${categories}::text[])`);
    }

    if (q) {
      const tsq = buildPrefixTsQuery(q);
      if (tsq !== null) {
        fragments.push(Prisma.sql`search_vec @@ to_tsquery('simple', ${tsq})`);
      }
    }

    return Prisma.join(fragments, " AND ");
  }

  /**
   * Interest score = log-blended volume + liquidity, decayed by time-to-resolve
   * with optional category boosts. Beats raw volume for "what's hot".
   */
  private static buildOrderBy(
    sort: NonNullable<SearchMarketsOptions["sort"]>,
    hasCategoryFilter: boolean
  ): Prisma.Sql {
    if (sort === "liquidity") return Prisma.sql`liquidity DESC`;
    if (sort === "end_date") return Prisma.sql`end_date ASC`;
    if (sort !== "interest") return Prisma.sql`volume DESC`;

    const interestExpr = Prisma.sql`(
      LN(GREATEST(volume, 0) + 1) * 0.6 +
      LN(GREATEST(liquidity, 0) + 1) * 0.4
    ) / (1 + GREATEST(EXTRACT(EPOCH FROM (end_date - NOW())) / 86400.0, 1) / 30.0)`;

    if (hasCategoryFilter) return Prisma.sql`${interestExpr} DESC`;

    const boostCases = Object.entries(INTEREST_CATEGORY_BOOSTS).map(
      ([cat, mult]) => Prisma.sql`WHEN ${cat} THEN ${mult}`
    );
    return Prisma.sql`(${interestExpr}) * (CASE category ${Prisma.join(boostCases, " ")} ELSE 1 END) DESC`;
  }
}
