"use client";

import { useState, useEffect } from "react";
import { useAccount } from "wagmi";
import Link from "next/link";
import { apiService, ApiMarket } from "../../services/api";
import { DatabasePolyswapOrder } from "../../backend/interfaces/PolyswapOrder";
import OrderBroadcastPopup from "./OrderBroadcastPopup/OrderBroadcastPopup";
import OrderCancellationPopup from "./OrderCancellationPopup/OrderCancellationPopup";
import styles from "./OrdersView.module.css";

interface Token {
  chainId: number;
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  logoURI?: string;
}

interface OrdersViewProps {
  onBack: () => void;
}

export default function OrdersView({ onBack }: OrdersViewProps) {
  const { address } = useAccount();
  const [orders, setOrders] = useState<DatabasePolyswapOrder[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
  const [tokens, setTokens] = useState<Map<string, Token>>(new Map());
  const [tokensLoading, setTokensLoading] = useState(true);
  const [markets, setMarkets] = useState<Map<string, ApiMarket>>(new Map());

  // OrderBroadcastPopup state
  const [showBroadcastPopup, setShowBroadcastPopup] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);

  // OrderCancellationPopup state
  const [showCancellationPopup, setShowCancellationPopup] = useState(false);
  const [selectedOrderForCancellation, setSelectedOrderForCancellation] =
    useState<DatabasePolyswapOrder | null>(null);

  // Fetch tokens on component mount
  useEffect(() => {
    fetchTokens();
  }, []);

  // Fetch orders when component mounts or address changes
  useEffect(() => {
    if (address) {
      fetchOrders();
    } else {
      setOrders([]);
      setError(null);
    }
  }, [address]);

  const fetchTokens = async () => {
    setTokensLoading(true);
    try {
      const response = await fetch("/api/tokens");
      const data = await response.json();

      if (data.success && data.tokens) {
        const tokenMap = new Map<string, Token>();
        data.tokens.forEach((token: Token) => {
          tokenMap.set(token.address.toLowerCase(), token);
        });
        setTokens(tokenMap);
      } else {
        console.error("Failed to fetch tokens:", data.error);
      }
    } catch (err) {
      console.error("Error fetching tokens:", err);
    } finally {
      setTokensLoading(false);
    }
  };

  const fetchOrders = async () => {
    if (!address) return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await apiService.getOrdersByOwner(address);

      if (result.success && result.data) {
        setOrders(result.data);
        setError(null);

        // Fetch market details for correct slugs
        const uniqueIds = Array.from(
          new Set(
            result.data
              .map((o) => String(o.market_id))
              .filter((id) => !!id && id !== "undefined" && id !== "null")
          )
        );

        // Don't block UI for market data, fetch it in background
        Promise.all(
          uniqueIds.map(async (id) => {
            try {
              const market = await apiService.getMarketById(id);
              return { id, market }; // Return the requested ID along with the market
            } catch (e) {
              console.warn(`Failed to fetch market info for ${id}`, e);
              return null;
            }
          })
        ).then((results) => {
          const newMarketsMap = new Map<string, ApiMarket>();
          results.forEach((item) => {
            if (item && item.market) {
              // Map the REQUESTED id to the market object.
              // This ensures that even if the market has a different internal ID, we can look it up by the ID stored in the order.
              newMarketsMap.set(item.id, item.market);
            }
          });
          setMarkets(newMarketsMap);
        });
      } else {
        setError(result.message || "Failed to fetch orders");
        setOrders([]);
      }
    } catch (err) {
      console.error("Error fetching orders:", err);
      setError("Failed to fetch orders");
      setOrders([]);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleOrderExpansion = (orderId: string) => {
    const newExpanded = new Set(expandedOrders);
    if (newExpanded.has(orderId)) {
      newExpanded.delete(orderId);
    } else {
      newExpanded.add(orderId);
    }
    setExpandedOrders(newExpanded);
  };

  const handleContinueCreation = (order: DatabasePolyswapOrder) => {
    console.log("Continuing creation for order:", order.id, {
      hasPolymarketOrder:
        !!order.polymarket_order_hash &&
        order.polymarket_order_hash !==
          "0x0000000000000000000000000000000000000000000000000000000000000000",
      hasTransaction:
        !!order.transaction_hash &&
        order.transaction_hash !==
          "0x0000000000000000000000000000000000000000000000000000000000000000",
    });
    setSelectedOrderId(order.id);
    setShowBroadcastPopup(true);
  };

  const getContinueButtonText = (order: DatabasePolyswapOrder): string => {
    const hasPolymarketOrder =
      order.polymarket_order_hash &&
      order.polymarket_order_hash !==
        "0x0000000000000000000000000000000000000000000000000000000000000000";
    const hasTransaction =
      order.transaction_hash &&
      order.transaction_hash !==
        "0x0000000000000000000000000000000000000000000000000000000000000000";

    if (!hasPolymarketOrder) {
      return "Create Polymarket Order";
    } else if (!hasTransaction) {
      return "Sign Transaction";
    } else {
      return "View Status";
    }
  };

  const getContinueButtonTitle = (order: DatabasePolyswapOrder): string => {
    const hasPolymarketOrder =
      order.polymarket_order_hash &&
      order.polymarket_order_hash !==
        "0x0000000000000000000000000000000000000000000000000000000000000000";
    const hasTransaction =
      order.transaction_hash &&
      order.transaction_hash !==
        "0x0000000000000000000000000000000000000000000000000000000000000000";

    if (!hasPolymarketOrder) {
      return "Continue with creating the Polymarket order";
    } else if (!hasTransaction) {
      return "Continue with signing and broadcasting the transaction";
    } else {
      return "View the current status of the order broadcast process";
    }
  };

  const handleCloseBroadcastPopup = () => {
    setShowBroadcastPopup(false);
    setSelectedOrderId(null);
    // Refresh orders to get updated status
    fetchOrders();
  };

  const handleRemoveOrder = (order: DatabasePolyswapOrder) => {
    if (!order.order_hash) {
      alert("Cannot remove order: Order hash not available");
      return;
    }

    setSelectedOrderForCancellation(order);
    setShowCancellationPopup(true);
  };

  const handleCloseCancellationPopup = () => {
    setShowCancellationPopup(false);
    setSelectedOrderForCancellation(null);
    // Refresh orders to get updated status
    fetchOrders();
  };

  const getStatusDisplay = (status: string) => {
    const statusMap = {
      draft: { label: "Draft", className: styles.statusDraft },
      live: { label: "Live", className: styles.statusLive },
      filled: { label: "Filled", className: styles.statusFilled },
      canceled: { label: "Canceled", className: styles.statusCanceled },
    };
    return (
      statusMap[status as keyof typeof statusMap] || {
        label: status,
        className: styles.statusUnknown,
      }
    );
  };

  const getTokenInfo = (address: string) => {
    const token = tokens.get(address.toLowerCase());
    if (token) {
      return {
        symbol: token.symbol,
        decimals: token.decimals,
        name: token.name,
        logoURI: token.logoURI,
      };
    }

    // Fallback for unknown tokens
    return {
      symbol: `${address.slice(0, 6)}...${address.slice(-4)}`,
      decimals: 18, // Default to 18 decimals
      name: `Token ${address.slice(0, 6)}...${address.slice(-4)}`,
      logoURI: undefined,
    };
  };

  const formatTokenAmount = (amount: string, tokenAddress: string, showSymbol: boolean = true) => {
    const tokenInfo = getTokenInfo(tokenAddress);
    const num = parseFloat(amount) / Math.pow(10, tokenInfo.decimals);

    if (num === 0) return showSymbol ? `0 ${tokenInfo.symbol}` : "0";
    if (num < 0.01) return showSymbol ? `<0.01 ${tokenInfo.symbol}` : "<0.01";

    const formatted = num.toLocaleString(undefined, {
      maximumFractionDigits: tokenInfo.decimals > 6 ? 6 : tokenInfo.decimals,
    });

    return showSymbol ? `${formatted} ${tokenInfo.symbol}` : formatted;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getTokenSymbol = (address: string) => {
    return getTokenInfo(address).symbol;
  };

  const getTokenName = (address: string) => {
    return getTokenInfo(address).name;
  };

  const renderTokenName = (address: string) => {
    const tokenInfo = getTokenInfo(address);
    return (
      <a
        href={getBlockExplorerLink(address, "address")}
        target="_blank"
        rel="noopener noreferrer"
        className={styles.tokenLink}
        title={`View ${tokenInfo.name} contract on block explorer`}
      >
        {tokenInfo.name}
      </a>
    );
  };

  const getBlockExplorerLink = (hash: string, type: "tx" | "address" = "tx") => {
    const baseUrl = "https://polygonscan.com";
    if (!hash || hash === "N/A") {
      return "#";
    }
    return `${baseUrl}/${type}/${hash}`;
  };

  if (!address) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <Link href="/" className={styles.backButton}>
            ← Back to Markets
          </Link>
          <h1 className={styles.title}>My Orders</h1>
          <p className={styles.subtitle}>Manage your conditional swap orders</p>
        </div>

        <div className={styles.content}>
          <div className={styles.walletWarning}>
            <div className={styles.warningIcon}>🔗</div>
            <h2 className={styles.warningTitle}>Connect Your Wallet</h2>
            <p className={styles.warningDescription}>
              Please connect your wallet to view your conditional swap orders.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <Link href="/" className={styles.backButton}>
          ← Back to Markets
        </Link>
        <h1 className={styles.title}>My Orders</h1>
        <p className={styles.subtitle}>Manage your conditional swap orders</p>
      </div>

      <div className={styles.content}>
        {isLoading || tokensLoading ? (
          <div className={styles.loading}>
            <div className={styles.spinner}></div>
            <p>
              {tokensLoading && isLoading
                ? "Loading token data and orders..."
                : tokensLoading
                  ? "Loading token data..."
                  : "Loading your orders..."}
            </p>
          </div>
        ) : error ? (
          <div className={styles.error}>
            <div className={styles.errorIcon}>⚠️</div>
            <h2 className={styles.errorTitle}>Error Loading Orders</h2>
            <p className={styles.errorDescription}>{error}</p>
            <button onClick={fetchOrders} className={styles.retryButton}>
              Try Again
            </button>
          </div>
        ) : orders.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>📄</div>
            <h2 className={styles.emptyTitle}>No Orders Yet</h2>
            <p className={styles.emptyDescription}>
              You haven't created any conditional orders yet. Start by selecting a market and
              creating your first order.
            </p>
          </div>
        ) : (
          <div className={styles.ordersTable}>
            <div className={styles.tableHeader}>
              <div className={styles.headerCell}>Market & Condition</div>
              <div className={styles.headerCell}>Token Swap</div>
              <div className={styles.headerCell}>Status</div>
              <div className={styles.headerCell}>Created</div>
              <div className={styles.headerCell}>Actions</div>
            </div>

            {orders.map((order) => (
              <div key={order.id} className={styles.orderRow}>
                <div
                  className={styles.orderMain}
                  onClick={() => toggleOrderExpansion(String(order.id))}
                >
                  <div className={styles.cell}>
                    <div className={styles.marketInfo}>
                      <div className={styles.orderHash}>Order #{order.id}</div>
                      <div className={styles.orderCondition}>
                        {order.outcome_selected && order.bet_percentage
                          ? `${order.outcome_selected} > ${order.bet_percentage}%`
                          : "Condition-based swap"}
                      </div>
                    </div>
                  </div>

                  <div className={styles.cell}>
                    <div className={styles.tokenSwap}>
                      <div className={styles.tokenFlow}>
                        <span className={styles.sellToken}>{getTokenSymbol(order.sell_token)}</span>
                        <span className={styles.swapArrow}>→</span>
                        <span className={styles.buyToken}>{getTokenSymbol(order.buy_token)}</span>
                      </div>
                    </div>
                  </div>

                  <div className={styles.cell}>
                    <span
                      className={`${styles.status} ${getStatusDisplay(order.status).className}`}
                    >
                      {getStatusDisplay(order.status).label}
                    </span>
                  </div>

                  <div className={styles.cell}>
                    <div className={styles.dateInfo}>
                      <div className={styles.createdDate}>
                        {formatDate(order.created_at.toString())}
                      </div>
                    </div>
                  </div>

                  <div className={styles.cell}>
                    <div className={styles.actionButtons}>
                      {order.status === "draft" && (
                        <button
                          className={styles.continueButton}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleContinueCreation(order);
                          }}
                          title={getContinueButtonTitle(order)}
                        >
                          {getContinueButtonText(order)}
                        </button>
                      )}
                      {order.status === "live" && (
                        <button
                          className={styles.removeButton}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveOrder(order);
                          }}
                          title="Cancel this order"
                        >
                          Cancel
                        </button>
                      )}
                      <button
                        className={styles.expandButton}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleOrderExpansion(String(order.id));
                        }}
                      >
                        {expandedOrders.has(String(order.id)) ? "▲" : "▼"}
                      </button>
                    </div>
                  </div>
                </div>

                {expandedOrders.has(String(order.id)) && (
                  <div className={styles.orderDetails}>
                    <div className={styles.progressSection}>
                      <h4>Order Progress</h4>
                      <div className={styles.progressSteps}>
                        {/* Step 1: Order Created */}
                        <div className={styles.progressStep}>
                          <span className={`${styles.stepIndicator} ${styles.stepCompleted}`}>
                            ✓
                          </span>
                          <span className={styles.stepText}>Order Created</span>
                        </div>

                        {/* Step 2: Polymarket Order */}
                        <div className={styles.progressStep}>
                          <span
                            className={`${styles.stepIndicator} ${
                              order.polymarket_order_hash &&
                              order.polymarket_order_hash !==
                                "0x0000000000000000000000000000000000000000000000000000000000000000"
                                ? styles.stepCompleted
                                : styles.stepPending
                            }`}
                          >
                            {order.polymarket_order_hash &&
                            order.polymarket_order_hash !==
                              "0x0000000000000000000000000000000000000000000000000000000000000000"
                              ? "✓"
                              : "2"}
                          </span>
                          <span className={styles.stepText}>Polymarket Order</span>
                        </div>

                        {/* Step 3: Transaction Signed */}
                        <div className={styles.progressStep}>
                          <span
                            className={`${styles.stepIndicator} ${
                              order.transaction_hash &&
                              order.transaction_hash !==
                                "0x0000000000000000000000000000000000000000000000000000000000000000"
                                ? styles.stepCompleted
                                : styles.stepPending
                            }`}
                          >
                            {order.transaction_hash &&
                            order.transaction_hash !==
                              "0x0000000000000000000000000000000000000000000000000000000000000000"
                              ? "✓"
                              : "3"}
                          </span>
                          <span className={styles.stepText}>Transaction Signed</span>
                        </div>

                        {/* Step 4: Swap Filled (Order Executed) */}
                        <div className={styles.progressStep}>
                          <span
                            className={`${styles.stepIndicator} ${
                              order.status === "filled"
                                ? styles.stepCompleted
                                : order.status === "live"
                                  ? styles.stepPending
                                  : styles.stepPending
                            }`}
                          >
                            {order.status === "filled" ? "✓" : "4"}
                          </span>
                          <span className={styles.stepText}>Swap Filled</span>
                        </div>
                      </div>
                    </div>

                    <div className={styles.detailsCard}>
                      <div className={styles.detailsGrid}>
                        {/* 1. Compact Swap */}
                        <div className={styles.compactSwap}>
                          <div className={styles.tokenPair}>
                            <span className={styles.tokenVal}>
                              {formatTokenAmount(order.sell_amount, order.sell_token, false)}
                            </span>
                            <span className={styles.tokenSym}>
                              {getTokenSymbol(order.sell_token)}
                            </span>
                          </div>
                          <div className={styles.arrow}>➜</div>
                          <div className={styles.tokenPair}>
                            <span className={styles.tokenVal}>
                              {formatTokenAmount(order.min_buy_amount, order.buy_token, false)}
                            </span>
                            <span className={styles.tokenSym}>
                              {getTokenSymbol(order.buy_token)}
                            </span>
                          </div>
                        </div>

                        {/* 2. Compact Trigger */}
                        <div className={styles.infoBox}>
                          <span className={styles.boxLabel}>TRIGGER</span>
                          <div className={styles.boxValue}>
                            {order.outcome_selected || "Yes"} {">"} {order.bet_percentage}%
                          </div>
                        </div>

                        {/* 3. Current Price / Distance */}
                        {order.market_id &&
                          markets.get(String(order.market_id)) &&
                          (() => {
                            const m = markets.get(String(order.market_id));
                            let currentProb = 0;
                            const target = order.bet_percentage || 0;
                            const outcome = order.outcome_selected || "Yes";

                            if (m?.type === "binary") {
                              if (outcome === "Yes") currentProb = m.yesOdds || 0;
                              else if (outcome === "No") currentProb = m.noOdds || 0;
                            } else if (m?.options) {
                              const opt = m.options.find((o) => o.text === outcome);
                              if (opt) currentProb = opt.odds;
                            }

                            const diff = currentProb - target;
                            const isMet = currentProb > target;

                            return (
                              <div className={styles.infoBox}>
                                <span className={styles.boxLabel}>CURRENT PRICE</span>
                                <div className={styles.boxValue}>
                                  {currentProb}%
                                  <span
                                    className={`${styles.diffBadge} ${diff >= 0 ? styles.diffPos : styles.diffNeg}`}
                                  >
                                    {diff > 0 ? "+" : ""}
                                    {diff.toFixed(1)}%
                                  </span>
                                </div>
                              </div>
                            );
                          })()}

                        {/* 4. Status */}
                        <div className={styles.infoBox}>
                          <span className={styles.boxLabel}>STATUS</span>
                          <span
                            className={`${styles.statusBadge} ${getStatusDisplay(order.status).className}`}
                          >
                            {getStatusDisplay(order.status).label}
                          </span>
                        </div>

                        {/* 5. Links */}
                        <div className={styles.linksActions}>
                          {order.transaction_hash &&
                            order.transaction_hash !== "0x" &&
                            order.transaction_hash !==
                              "0x0000000000000000000000000000000000000000000000000000000000000000" && (
                              <a
                                href={getBlockExplorerLink(order.transaction_hash)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={styles.miniIconLink}
                                title="View Transaction"
                              >
                                ↗
                              </a>
                            )}

                          {order.order_hash && order.status === "filled" && (
                            <a
                              href={`https://explorer.cow.fi/pol/orders/${order.order_hash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={styles.miniIconLink}
                              title="View on CoW Explorer"
                            >
                              🐮
                            </a>
                          )}

                          {order.market_id &&
                            (() => {
                              const market = markets.get(String(order.market_id));
                              if (!market) return null;
                              const slug = market.eventSlug || market.slug;
                              if (!slug) return null;
                              return (
                                <a
                                  href={`https://polymarket.com/event/${slug}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={styles.miniIconLink}
                                  title="View on Polymarket"
                                >
                                  📈
                                </a>
                              );
                            })()}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Order Broadcast Popup for continuing draft orders */}
      {selectedOrderId && (
        <OrderBroadcastPopup
          isOpen={showBroadcastPopup}
          onClose={handleCloseBroadcastPopup}
          orderId={selectedOrderId}
        />
      )}

      {/* Order Cancellation Popup for canceling live orders */}
      {selectedOrderForCancellation && (
        <OrderCancellationPopup
          isOpen={showCancellationPopup}
          onClose={handleCloseCancellationPopup}
          order={selectedOrderForCancellation}
        />
      )}
    </div>
  );
}
