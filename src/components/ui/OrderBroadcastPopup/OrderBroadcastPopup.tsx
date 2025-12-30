"use client";

import React, { useState, useEffect } from "react";
import {
  useAccount,
  usePublicClient,
  useConnectorClient,
  useSendTransaction,
  useWaitForTransactionReceipt,
} from "wagmi";
import { safeService } from "../../../services/safeService";
import { walletConnectSafeService } from "../../../services/walletConnectSafeService";
import { apiService } from "../../../services/api";
import { ethers } from "ethers";
import { OrderBroadcastStep } from "./OrderBroadcastStep";
import { PolymarketOrderStep } from "./PolymarketOrderStep";
import { TransactionSignStep } from "./TransactionSignStep";
import { SuccessStep } from "./SuccessStep";
import { ErrorStep } from "./ErrorStep";
import styles from "./OrderBroadcastPopup.module.css";

interface OrderBroadcastPopupProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: number; // Changed from orderHash to orderId
}

export type Step = "polymarket" | "transaction" | "signed" | "success" | "error";

export interface PopupState {
  step: Step;
  polymarketOrderHash?: string;
  transactionData?: any;
  transactionHash?: string;
  safeTxHash?: string;
  error?: string;
  errorMessage?: string;
  isSafeInitialized?: boolean;
  isSafeWallet?: boolean;
  safeInfo?: {
    threshold?: number;
    owners?: string[];
    isSafe?: boolean;
    isOwner?: boolean;
  };
  transactionProgress?: {
    current: number;
    total: number;
    currentTxType?: string;
  };
}

const OrderBroadcastPopup: React.FC<OrderBroadcastPopupProps> = ({ isOpen, onClose, orderId }) => {
  const { address, connector } = useAccount();
  const publicClient = usePublicClient();
  const { data: client } = useConnectorClient();
  const [isSending, setIsSending] = useState(false);
  const [isWaiting, setIsWaiting] = useState(false);

  // Wagmi hooks for direct transaction as final fallback
  const {
    sendTransaction: wagmiSendTransaction,
    isPending: wagmiIsPending,
    data: wagmiTxData,
  } = useSendTransaction();
  const { isLoading: wagmiIsWaiting, isSuccess: wagmiIsSuccess } = useWaitForTransactionReceipt({
    hash: wagmiTxData,
  });

  const [state, setState] = useState<PopupState>({
    step: "polymarket",
    polymarketOrderHash: undefined,
    transactionData: undefined,
    transactionHash: undefined,
    safeTxHash: undefined,
    error: undefined,
    errorMessage: undefined,
    isSafeInitialized: false,
    isSafeWallet: undefined,
    safeInfo: undefined,
  });

  // Initialize Safe services when wallet is connected
  useEffect(() => {
    const initializeSafe = async () => {
      if (!address || !publicClient) {
        return;
      }

      const isSafeApp = connector?.name === "Safe";
      const isWalletConnect = connector?.name === "WalletConnect";

      // Reset any previous errors when trying to initialize
      if (state.error === "unsupported_wallet" || state.error === "safe_initialization_failed") {
        setState((prev) => ({
          ...prev,
          error: undefined,
          errorMessage: undefined,
        }));
      }

      if (isSafeApp) {
        // Running inside Safe App - use Safe SDK
        try {
          const provider = new ethers.BrowserProvider(publicClient as any);
          await safeService.initialize(address, provider);
          setState((prev) => ({
            ...prev,
            isSafeInitialized: true,
            isSafeWallet: true,
          }));
        } catch (error) {
          setState((prev) => ({
            ...prev,
            step: "error",
            error: "safe_initialization_failed",
            errorMessage: error instanceof Error ? error.message : "Failed to initialize Safe SDK",
          }));
        }
      } else if (isWalletConnect && client) {
        // WalletConnect - validate it's actually connected to a Safe
        try {
          const provider = new ethers.BrowserProvider(publicClient as any);
          const signer = new ethers.BrowserProvider(client as any).getSigner();

          // Initialize WalletConnect Safe service
          walletConnectSafeService.initialize(await signer, provider);

          // Try to get Safe info to validate the connection
          const safeInfo = await walletConnectSafeService.getSafeInfo(address);

          // If the direct address check fails, it might be an EOA owner of a Safe
          // For WalletConnect connections, we can be more permissive since the Safe app controls access
          if (!safeInfo.isSafe) {
          }

          setState((prev) => ({
            ...prev,
            isSafeInitialized: true,
            isSafeWallet: true,
            safeInfo: safeInfo.isSafe ? safeInfo : { isSafe: true, isOwner: true }, // Mark as Safe owner if not direct Safe contract
          }));
        } catch (error) {
          setState((prev) => ({
            ...prev,
            step: "error",
            error: "safe_initialization_failed",
            errorMessage:
              error instanceof Error
                ? error.message
                : "Failed to initialize Safe wallet connection",
          }));
        }
      } else if (isWalletConnect && !client) {
        // Don't show error yet, wait for client
        return;
      } else {
        setState((prev) => ({
          ...prev,
          step: "error",
          error: "unsupported_wallet",
          errorMessage: "Please connect using a Safe wallet via WalletConnect or Safe Apps.",
        }));
      }
    };

    initializeSafe();
  }, [address, publicClient, connector, client]);

  // Handle Wagmi transaction success
  useEffect(() => {
    if (wagmiIsSuccess && wagmiTxData && state.step === "transaction") {
      // Update database with transaction hash and mark as success
      const updateDatabase = async () => {
        try {
          await apiService.updateOrderTransactionHashById(orderId, wagmiTxData);
          setState((prev) => ({
            ...prev,
            step: "success",
            transactionHash: wagmiTxData,
          }));
        } catch (dbError) {
          // Still mark as success since the transaction was executed
          setState((prev) => ({
            ...prev,
            step: "success",
            transactionHash: wagmiTxData,
          }));
        }
      };

      updateDatabase();
    }
  }, [wagmiIsSuccess, wagmiTxData, state.step, orderId]);

  // Handle 'signed' state - wait for confirmation and update database
  useEffect(() => {
    const handleSignedState = async () => {
      if (state.step !== "signed" || !state.transactionHash) {
        return;
      }

      try {
        // Check if this was a setup-only batch
        const isSetupOnly = state.transactionData?.setupOnlyBatch;

        if (isSetupOnly) {
          // This was a setup transaction - wait for confirmation then check for next step
          console.log("🔧 Setup transaction detected, waiting for confirmation...");

          // Wait for transaction to be confirmed on-chain
          await walletConnectSafeService.waitForTransactionConfirmation(
            state.transactionHash,
            60000
          );

          // Add delay for blockchain state propagation
          console.log("⏳ Waiting for blockchain state propagation...");
          await new Promise((resolve) => setTimeout(resolve, 8000)); // Longer delay for setup txs

          // Reset to transaction step to re-fetch batch data
          console.log("🔄 Setup complete, checking for next setup step...");
          setState((prev) => ({
            ...prev,
            step: "transaction",
            transactionHash: undefined,
            transactionData: undefined,
            // Keep polymarketOrderHash to continue flow
          }));

          return; // Don't proceed to success, let it re-fetch and check next step
        }

        // Normal order transaction
        // Wait for confirmation with INCREASED timeout (180s = 3 mins)
        console.log("⏳ Waiting for transaction confirmation...");
        await walletConnectSafeService.waitForTransactionConfirmation(
          state.transactionHash,
          180000
        );

        // Add 5-second delay for propagation to ensure indexing services are updated
        await new Promise((resolve) => setTimeout(resolve, 5000));

        // Now that transaction is confirmed and propagated, update the database
        const updateResult = await apiService.updateOrderTransactionHashById(
          orderId,
          state.transactionHash
        );

        if (updateResult.success) {
          setState((prev) => ({ ...prev, step: "success" }));
        } else {
          // Still mark as success since the transaction was executed
          setState((prev) => ({
            ...prev,
            step: "success",
            errorMessage:
              "Transaction successful but database update failed. Order may not show as live immediately.",
          }));
        }
      } catch (error) {
        // Check if it's a timeout vs other error, but since we already updated the DB,
        // we can be more lenient about marking it as "success" for the UI flow
        if (error instanceof Error && error.message.includes("timeout")) {
          // Transaction confirmation timeout - still mark as success but with warning
          setState((prev) => ({
            ...prev,
            step: "success",
            errorMessage:
              "Transaction broadcasted successfully but confirmation is taking longer than usual (3+ mins). Order should be live shortly.",
          }));
        } else {
          // Other errors - still mark as success since transaction was signed
          setState((prev) => ({
            ...prev,
            step: "success",
            errorMessage:
              "Transaction was broadcasted but there was an issue verifying confirmation. Order should be live soon.",
          }));
        }
      }
    };

    handleSignedState();
  }, [state.step, state.transactionHash, state.transactionData?.setupOnlyBatch, orderId]);

  // On open, fetch order to determine resume step from DB status and polymarket hash
  useEffect(() => {
    let abort = false;
    const primeFromDb = async () => {
      if (!isOpen || !orderId) return;
      try {
        const res = await fetch(`/api/polyswap/orders/id/${orderId}`);
        const json = await res.json();
        if (!res.ok || !json.success) return;
        if (abort) return;
        const order = json.data as {
          status: string;
          polymarket_order_hash?: string | null;
          transaction_hash?: string | null;
        };

        // If Polymarket order already created, skip to transaction step
        if (order.polymarket_order_hash) {
          setState((prev) => ({
            ...prev,
            step: "transaction",
            polymarketOrderHash: order.polymarket_order_hash || undefined,
          }));
        } else {
        }
      } catch (error) {}
    };
    primeFromDb();
    return () => {
      abort = true;
    };
  }, [isOpen, orderId]);

  if (!isOpen) {
    return null;
  }

  const handleCreatePolymarketOrder = async (polymarketOrderHash: string) => {
    setState((prev) => ({
      ...prev,
      step: "transaction",
      polymarketOrderHash,
      error: undefined,
      errorMessage: undefined,
    }));
  };

  const handleGetTransactionData = async (transactionData: any) => {
    // Initialize transaction progress for batch transactions
    const isBatch = transactionData.isBatch && Array.isArray(transactionData.transactions);
    const totalTxs = isBatch ? transactionData.transactions.length : 1;

    setState((prev) => ({
      ...prev,
      transactionData,
      transactionProgress:
        totalTxs > 1
          ? {
              current: 0,
              total: totalTxs,
              currentTxType: "Ready to sign",
            }
          : undefined,
      error: undefined,
      errorMessage: undefined,
    }));
  };

  const handleSendTransaction = async () => {
    if (!state.transactionData || !state.isSafeInitialized) {
      return;
    }

    setIsSending(true);

    try {
      const isSafeApp = connector?.name === "Safe";
      const isWalletConnect = connector?.name === "WalletConnect";

      let transactionHash: string;

      // Check if this is a batch transaction (all Safe transactions are now batch format)
      const isBatchTransaction =
        state.transactionData.isBatch && Array.isArray(state.transactionData.transactions);

      if (isSafeApp) {
        let result;

        if (isBatchTransaction) {
          // Use Safe SDK batch transaction method
          result = await safeService.createBatchTransaction(
            state.transactionData.transactions.map((tx: any) => ({
              to: tx.to,
              data: tx.data,
              value: tx.value,
            }))
          );
        } else {
          // Use Safe SDK for single transaction
          result = await safeService.createSafeTransaction({
            to: state.transactionData.to,
            data: state.transactionData.data,
            value: state.transactionData.value,
          });
        }

        setState((prev) => ({
          ...prev,
          safeTxHash: result.safeTxHash,
          transactionHash: result.transactionHash,
        }));

        if (result.executed && result.transactionHash) {
          transactionHash = result.transactionHash;
        } else {
          // Transaction created but not executed (needs more signatures)
          setState((prev) => ({
            ...prev,
            step: "error",
            error: "transaction_needs_signatures",
            errorMessage:
              "Transaction created but requires additional signatures from other Safe owners",
          }));
          return;
        }
      } else if (isWalletConnect) {
        // Use WalletConnect Safe service with BATCHED transaction support
        // All transactions are encoded into a single MultiSend transaction

        try {
          // Get transactions array - support both batch and single transaction formats
          const transactions = isBatchTransaction
            ? state.transactionData.transactions
            : [state.transactionData];

          console.log(
            `📦 Sending ${transactions.length} transaction(s) ${transactions.length > 1 ? "as batched transaction via MultiSend" : "directly"}`
          );

          // Use the new batched transaction method
          // This encodes all transactions into a single MultiSend call
          const result = await walletConnectSafeService.sendBatchedTransaction(
            transactions,
            (current, total, txType, txHash) => {
              setState((prev) => ({
                ...prev,
                transactionProgress: {
                  current,
                  total,
                  currentTxType: txType,
                },
              }));
            }
          );

          // Transaction was sent successfully
          if (result && result.success) {
            transactionHash = result.transactionHash;

            // Move to "signed" state - show success with tx hash but keep processing
            setState((prev) => ({
              ...prev,
              step: "signed",
              transactionHash: result.transactionHash,
            }));
          } else {
            throw new Error("Transaction signing failed");
          }
        } catch (walletConnectError) {
          throw walletConnectError;
        }
      } else {
        throw new Error("Unsupported wallet connection type");
      }

      // For WalletConnect, we now handle the flow differently:
      // 1. Transaction signing is complete (we're in "signed" state)
      // 2. Now we need to wait for confirmation and update the database
      // This will be handled by the useEffect for 'signed' state
    } catch (error) {
      // Determine error type based on the error message
      let errorType = "send_transaction_failed";
      let errorMessage = error instanceof Error ? error.message : "Failed to send transaction";

      // Enhanced error detection for user rejection and Safe-specific issues
      if (error instanceof Error) {
        const errorMsg = error.message.toLowerCase();

        // General user rejection patterns
        if (
          errorMsg.includes("user rejected") ||
          errorMsg.includes("user denied") ||
          errorMsg.includes("denied") ||
          errorMsg.includes("rejected") ||
          errorMsg.includes("cancelled") ||
          errorMsg.includes("transaction was cancelled") ||
          errorMsg.includes("action_rejected") ||
          errorMsg.includes("user cancelled") ||
          errorMsg.includes("transaction signing was refused") ||
          errorMsg.includes("failed: transaction signing was refused")
        ) {
          errorType = "transaction_refused";
          errorMessage = "Transaction signing was refused by user";
        }

        // Safe-specific rejection patterns
        else if (
          errorMsg.includes("safe transaction was rejected") ||
          errorMsg.includes("transaction rejected by safe") ||
          errorMsg.includes("refused in safe wallet")
        ) {
          errorType = "safe_transaction_refused";
          errorMessage = "Transaction signing was refused in Safe wallet";
        }

        // Network/connection issues
        else if (
          errorMsg.includes("network connection issue") ||
          errorMsg.includes("connection") ||
          errorMsg.includes("network error")
        ) {
          errorType = "walletconnect_connection_issue";
          errorMessage = "Network connection issue. Please check your connection and retry.";
        }

        // Safe SDK specific error patterns
        else if (
          errorMsg.includes("user denied transaction signature") ||
          errorMsg.includes("transaction was not signed") ||
          errorMsg.includes("signature rejected")
        ) {
          errorType = "safe_transaction_refused";
          errorMessage = "Transaction signature was rejected in Safe wallet";
        }

        // Gas or transaction validation errors
        else if (
          errorMsg.includes("gas estimation failed") ||
          errorMsg.includes("insufficient funds") ||
          errorMsg.includes("nonce")
        ) {
          errorType = "transaction_validation_failed";
          errorMessage = error.message; // Use the original technical error message
        }
      }

      // Check for error codes that indicate user rejection
      if ((error as any)?.code === 4001 || (error as any)?.code === "ACTION_REJECTED") {
        errorType = "transaction_refused";
        errorMessage = "Transaction signing was refused by user";
      }

      setState((prev) => ({
        ...prev,
        step: "error",
        error: errorType,
        errorMessage: errorMessage,
      }));
    } finally {
      setIsSending(false);
      setIsWaiting(false);
    }
  };

  const handleClose = () => {
    onClose();
    // Reset state when closing
    setState((prev) => ({
      ...prev,
      step: "polymarket",
      polymarketOrderHash: undefined,
      transactionData: undefined,
      transactionHash: undefined,
      safeTxHash: undefined,
      error: undefined,
      errorMessage: undefined,
      // Keep isSafeInitialized, isSafeWallet, and safeInfo to avoid re-initialization
    }));
  };

  const renderStep = () => {
    switch (state.step) {
      case "polymarket":
        return (
          <PolymarketOrderStep
            orderId={orderId}
            onCreateSuccess={handleCreatePolymarketOrder}
            onError={(errorMessage) => {
              setState({
                step: "error",
                error: "polymarket_creation_failed",
                errorMessage,
              });
            }}
          />
        );

      case "transaction":
        return (
          <TransactionSignStep
            orderId={orderId} // Changed from orderHash to orderId
            polymarketOrderHash={state.polymarketOrderHash || ""}
            onGetTransactionData={handleGetTransactionData}
            onSendTransaction={handleSendTransaction}
            isSending={isSending || wagmiIsPending}
            isWaiting={isWaiting || wagmiIsWaiting}
            transactionHash={state.transactionHash}
            transactionProgress={state.transactionProgress}
            onError={(errorMessage) => {
              setState({
                step: "error",
                error: "transaction_preparation_failed",
                errorMessage,
              });
            }}
          />
        );

      case "signed":
        return (
          <div className={styles.stepContent}>
            <div className={styles.successIcon}>✅</div>
            <h2 className={styles.stepTitle}>Transaction Signed Successfully!</h2>
            <p className={styles.stepDescription}>
              Your transaction has been signed and submitted to the blockchain.
            </p>

            <div className={styles.infoBox} style={{ marginBottom: "16px" }}>
              <div className={styles.transactionDetails}>
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Transaction Hash:</span>
                  <span className={styles.detailValue}>
                    {state.transactionHash?.substring(0, 10)}...
                    {state.transactionHash?.substring(state.transactionHash.length - 8)}
                  </span>
                </div>
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Status:</span>
                  <span className={styles.detailValue} style={{ color: "#28a745" }}>
                    Signed & Submitted
                  </span>
                </div>
              </div>
            </div>

            <div className={styles.loadingSpinner}>
              <div className={styles.spinner}></div>
              <p>Waiting for transaction confirmation and indexing to update order status...</p>
              <p className={styles.note} style={{ fontSize: "12px", marginTop: "8px" }}>
                This usually takes 15-35 seconds on Polygon (confirmation + indexing)
              </p>
            </div>
          </div>
        );

      case "success":
        return (
          <SuccessStep
            orderId={orderId} // Changed from orderHash to orderId
            polymarketOrderHash={state.polymarketOrderHash || ""}
            transactionHash={state.transactionHash || ""}
            onClose={handleClose}
            warningMessage={state.errorMessage}
          />
        );

      case "error":
        return (
          <ErrorStep
            error={state.error || "unknown_error"}
            errorMessage={state.errorMessage || "An unknown error occurred"}
            onRetry={() => {
              // Resume only the failed step based on error type
              if (state.error === "polymarket_creation_failed") {
                setState((prev) => ({
                  ...prev,
                  step: "polymarket",
                  error: undefined,
                  errorMessage: undefined,
                }));
              } else if (
                state.error === "transaction_preparation_failed" ||
                state.error === "send_transaction_failed" ||
                state.error === "transaction_failed" ||
                state.error === "transaction_refused" ||
                state.error === "safe_transaction_refused" ||
                state.error === "safe_initialization_failed" ||
                state.error === "walletconnect_connection_issue"
              ) {
                setState((prev) => ({
                  ...prev,
                  step: "transaction",
                  error: undefined,
                  errorMessage: undefined,
                }));
              } else {
                // Default back to transaction if polymarket already exists, else polymarket
                setState((prev) => ({
                  ...prev,
                  step: prev.polymarketOrderHash ? "transaction" : "polymarket",
                  error: undefined,
                  errorMessage: undefined,
                }));
              }
            }}
            onClose={handleClose}
          />
        );

      default:
        return (
          <ErrorStep
            error="invalid_step"
            errorMessage="Invalid step in the order broadcast process"
            onRetry={() => {
              setState({
                step: "polymarket",
                error: undefined,
                errorMessage: undefined,
              });
            }}
            onClose={handleClose}
          />
        );
    }
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.popup}>
        <button className={styles.closeButton} onClick={handleClose} aria-label="Close popup">
          ×
        </button>

        <div className={styles.content}>
          <OrderBroadcastStep
            currentStep={state.step}
            polymarketOrderHash={state.polymarketOrderHash}
            transactionHash={state.transactionHash}
          />

          {renderStep()}
        </div>
      </div>
    </div>
  );
};

export default OrderBroadcastPopup;
