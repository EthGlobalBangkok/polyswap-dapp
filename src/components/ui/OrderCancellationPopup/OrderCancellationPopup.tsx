"use client";

import React, { useState, useEffect } from "react";
import { useAccount, usePublicClient, useConnectorClient, useSignMessage } from "wagmi";
import { safeService } from "../../../services/safeService";
import { walletConnectSafeService } from "../../../services/walletConnectSafeService";
import { ethers } from "ethers";
import { DatabasePolyswapOrder } from "../../../backend/interfaces/PolyswapOrder";
import styles from "./OrderCancellationPopup.module.css";

interface OrderCancellationPopupProps {
  isOpen: boolean;
  onClose: () => void;
  order: DatabasePolyswapOrder;
}

type CancellationStep =
  | "confirm"
  | "signing"
  | "polymarket"
  | "transaction"
  | "signed"
  | "success"
  | "error";

interface PopupState {
  step: CancellationStep;
  polymarketCanceled: boolean;
  transactionData: any;
  transactionHash?: string;
  safeTxHash?: string;
  error?: string;
  errorMessage?: string;
  isSafeInitialized: boolean;
}

export default function OrderCancellationPopup({
  isOpen,
  onClose,
  order,
}: OrderCancellationPopupProps) {
  const { address, connector, chainId } = useAccount();
  const publicClient = usePublicClient();
  const { data: client } = useConnectorClient();
  const { signMessageAsync } = useSignMessage();

  const [state, setState] = useState<PopupState>({
    step: "confirm",
    polymarketCanceled: false,
    transactionData: null,
    isSafeInitialized: false,
  });

  const [isSending, setIsSending] = useState(false);
  const [isWaiting, setIsWaiting] = useState(false);

  // Reset state when popup opens/closes
  useEffect(() => {
    if (isOpen) {
      setState({
        step: "confirm",
        polymarketCanceled: false,
        transactionData: null,
        isSafeInitialized: false,
      });
      setIsSending(false);
      setIsWaiting(false);
    }
  }, [isOpen]);

  // Initialize Safe services when wallet is connected
  useEffect(() => {
    const initializeSafeServices = async () => {
      if (!address || !client || !publicClient) {
        setState((prev) => ({ ...prev, isSafeInitialized: false }));
        return;
      }

      try {
        const provider = new ethers.BrowserProvider(publicClient as any);
        const signer = new ethers.BrowserProvider(client as any).getSigner();

        // Initialize WalletConnect Safe service
        walletConnectSafeService.initialize(await signer, provider);

        setState((prev) => ({ ...prev, isSafeInitialized: true }));
      } catch (error) {
        console.error("Failed to initialize Safe services:", error);
        setState((prev) => ({ ...prev, isSafeInitialized: false }));
      }
    };

    if (isOpen) {
      initializeSafeServices();
    }
  }, [address, client, publicClient, isOpen]);

  // Handle 'signed' state - wait for confirmation and update database
  useEffect(() => {
    const handleSignedState = async () => {
      if (state.step !== "signed" || !state.transactionHash) {
        return;
      }

      try {
        // Wait for transaction to be confirmed on-chain
        await walletConnectSafeService.waitForTransactionConfirmation(state.transactionHash, 60000);

        // Add 5-second delay for propagation to ensure indexing services are updated
        await new Promise((resolve) => setTimeout(resolve, 5000));

        // Call the API to update order status in database
        // Note: No signature needed here - ownership was verified in POST before Polymarket cancellation
        const response = await fetch("/api/polyswap/orders/remove", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            orderHash: order.order_hash,
            transactionHash: state.transactionHash,
            confirmed: true,
          }),
        });

        const result = await response.json();

        if (result.success) {
          setState((prev) => ({ ...prev, step: "success" }));
        } else {
          console.error("Database update failed:", result);
          // Still mark as success since the transaction was executed
          setState((prev) => ({
            ...prev,
            step: "success",
            errorMessage:
              "Transaction successful but database update failed. Order cancellation may not show immediately.",
          }));
        }
      } catch (error) {
        console.error("Error in cancellation confirmation:", error);

        // Check if it's a timeout vs other error
        if (error instanceof Error && error.message.includes("timeout")) {
          // Transaction confirmation timeout - still mark as success but with warning
          setState((prev) => ({
            ...prev,
            step: "success",
            errorMessage:
              "Transaction signed successfully but confirmation took longer than expected. Order should be canceled shortly.",
          }));
        } else {
          // Other errors - still mark as success since transaction was signed
          setState((prev) => ({
            ...prev,
            step: "success",
            errorMessage:
              "Transaction signed successfully but there was an issue updating the order status. Order should be canceled shortly.",
          }));
        }
      }
    };

    handleSignedState();
  }, [state.step, state.transactionHash, order.order_hash]);

  const handleConfirmCancellation = async () => {
    // Step 1: Show signing step
    setState((prev) => ({ ...prev, step: "signing" }));

    try {
      // Step 2: Sign message to prove ownership (EIP-191)
      const timestamp = Math.floor(Date.now() / 1000);
      const message = `PolySwap Action Request\nAction: cancel_order\nOrder: ${order.order_hash}\nTimestamp: ${timestamp}\nChain: ${chainId}`;

      let signature: string;
      try {
        signature = await signMessageAsync({ message });
      } catch (signError: unknown) {
        // User rejected signature
        const errorMsg = signError instanceof Error ? signError.message.toLowerCase() : "";
        if (
          errorMsg.includes("rejected") ||
          errorMsg.includes("denied") ||
          errorMsg.includes("cancelled")
        ) {
          setState((prev) => ({
            ...prev,
            step: "error",
            error: "signature_refused",
            errorMessage: "Signature was rejected. Cancellation aborted.",
          }));
        } else {
          setState((prev) => ({
            ...prev,
            step: "error",
            error: "signature_error",
            errorMessage: "Failed to sign cancellation request",
          }));
        }
        return;
      }

      setState((prev) => ({ ...prev, step: "polymarket" }));

      // Step 2: Cancel Polymarket order and get transaction data (with signature proof)
      const response = await fetch("/api/polyswap/orders/remove", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          orderHash: order.order_hash,
          ownerAddress: address,
          signature,
          timestamp,
          chainId,
        }),
      });

      const result = await response.json();

      if (!result.success) {
        setState((prev) => ({
          ...prev,
          step: "error",
          error: "api_error",
          errorMessage: result.message || "Failed to prepare order cancellation",
        }));
        return;
      }

      // Step 3: Move to transaction step
      setState((prev) => ({
        ...prev,
        step: "transaction",
        polymarketCanceled: result.data.polymarketCanceled,
        transactionData: result.data.transaction,
      }));
    } catch (error) {
      console.error("Error preparing cancellation:", error);
      setState((prev) => ({
        ...prev,
        step: "error",
        error: "preparation_error",
        errorMessage: "Failed to prepare order cancellation",
      }));
    }
  };

  const handleSendTransaction = async () => {
    if (!state.transactionData || !state.isSafeInitialized) {
      console.error("Missing requirements for sending transaction");
      return;
    }

    setIsSending(true);

    try {
      const isSafeApp = connector?.name === "Safe";
      const isWalletConnect = connector?.name === "WalletConnect";

      let transactionHash: string;

      if (isSafeApp) {
        // Use Safe SDK for Safe app connections
        const result = await safeService.createSafeTransaction({
          to: state.transactionData.to,
          data: state.transactionData.data,
          value: state.transactionData.value,
        });

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
        // Use WalletConnect Safe service directly - optimized for Safe + WalletConnect
        try {
          const result = await walletConnectSafeService.sendTransaction({
            to: state.transactionData.to,
            data: state.transactionData.data,
            value: state.transactionData.value,
          });

          if (result && result.success) {
            transactionHash = result.transactionHash;
            setState((prev) => ({
              ...prev,
              transactionHash: result.transactionHash,
            }));
          } else {
            console.error("Transaction failed:", result);
            throw new Error("Transaction signing failed");
          }
        } catch (walletConnectError) {
          console.error("💥 [CANCEL] WalletConnect Safe service failed:", walletConnectError);
          throw walletConnectError;
        }
      } else {
        throw new Error("Unsupported wallet connection type");
      }

      // Transaction was executed, mark as success
      console.log("🔍 [CANCEL] Post-transaction processing...");
      console.log("🔍 [CANCEL] Transaction hash available:", !!transactionHash);
      console.log("🔍 [CANCEL] Transaction hash value:", transactionHash);

      if (!transactionHash) {
        console.error("❌ [CANCEL] No transaction hash available");
        setState((prev) => ({
          ...prev,
          step: "error",
          error: "transaction_failed",
          errorMessage: "Transaction completed but no transaction hash was returned",
        }));
        return;
      }

      console.log(
        "✅ [CANCEL] Order cancellation transaction signed successfully:",
        transactionHash
      );
      console.log("🔄 [CANCEL] Moving to signed state...");
      setState((prev) => ({
        ...prev,
        step: "signed",
        transactionHash,
      }));
      console.log("✅ [CANCEL] Moved to signed state");
    } catch (error: any) {
      console.error("💥 [CANCEL] Transaction error occurred in handleSendTransaction");
      console.error("🔍 [CANCEL] Error type:", typeof error);
      console.error("🔍 [CANCEL] Error constructor:", error?.constructor?.name);
      console.error(
        "🔍 [CANCEL] Error message:",
        error instanceof Error ? error.message : String(error)
      );
      console.error("🔍 [CANCEL] Error code:", (error as any)?.code);
      console.error(
        "🔍 [CANCEL] Full error object:",
        JSON.stringify(error, Object.getOwnPropertyNames(error), 2)
      );

      // Determine error type based on the error message
      let errorType = "send_transaction_failed";
      let errorMessage = error instanceof Error ? error.message : "Failed to send transaction";

      console.log("🔍 [CANCEL] Processing error with type:", errorType);
      console.log("🔍 [CANCEL] Processing error with message:", errorMessage);

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

      console.log("🔄 [CANCEL] Setting error state...");
      setState((prev) => ({
        ...prev,
        step: "error",
        error: errorType,
        errorMessage,
      }));
      console.log("❌ [CANCEL] Error state set with type:", errorType);
    } finally {
      console.log("🏁 [CANCEL] Transaction process complete, clearing loading states");
      setIsSending(false);
      setIsWaiting(false);
      console.log("✅ [CANCEL] Loading states cleared");
      console.log("🏁 [CANCEL] handleSendTransaction END");
    }
  };

  const getStepTitle = (): string => {
    switch (state.step) {
      case "confirm":
        return "Confirm Order Cancellation";
      case "signing":
        return "Sign to Verify Ownership";
      case "polymarket":
        return "Canceling Polymarket Order";
      case "transaction":
        return "Sign Cancellation Transaction";
      case "signed":
        return "Transaction Signed Successfully";
      case "success":
        return "Order Cancellation Complete";
      case "error":
        return "Cancellation Error";
      default:
        return "Cancel Order";
    }
  };

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>{getStepTitle()}</h2>
          <button className={styles.closeButton} onClick={onClose}>
            ×
          </button>
        </div>

        <div className={styles.content}>
          {state.step === "confirm" && (
            <div className={styles.stepContent}>
              <div className={styles.orderSummary}>
                <h3>Order Details</h3>
                <div className={styles.orderInfo}>
                  <p>
                    <strong>Order ID:</strong> #{order.id}
                  </p>
                  <p>
                    <strong>Order Hash:</strong> {order.order_hash?.slice(0, 10)}...
                    {order.order_hash?.slice(-8)}
                  </p>
                  <p>
                    <strong>Status:</strong> {order.status}
                  </p>
                </div>
              </div>

              <div className={styles.warningBox}>
                <h4>⚠️ This will:</h4>
                <ul>
                  <li>Cancel the associated Polymarket order (if exists)</li>
                  <li>Remove the conditional order from CoW Protocol</li>
                  <li>Mark the order as canceled in the system</li>
                </ul>
                <p>
                  <strong>This action cannot be undone.</strong>
                </p>
              </div>

              <div className={styles.buttonGroup}>
                <button className={styles.cancelButton} onClick={onClose}>
                  Keep Order
                </button>
                <button className={styles.confirmButton} onClick={handleConfirmCancellation}>
                  Confirm Cancellation
                </button>
              </div>
            </div>
          )}

          {state.step === "signing" && (
            <div className={styles.stepContent}>
              <div className={styles.loadingSection}>
                <div className={styles.spinner}></div>
                <p>Waiting for signature...</p>
                <p className={styles.subText}>
                  Please check your Safe Wallet app to sign the verification message.
                </p>
                <div className={styles.infoBox} style={{ marginTop: "16px" }}>
                  <p>
                    <strong>Why sign?</strong>
                  </p>
                  <p>This signature proves you own this order and authorizes its cancellation.</p>
                </div>
              </div>
            </div>
          )}

          {state.step === "polymarket" && (
            <div className={styles.stepContent}>
              <div className={styles.loadingSection}>
                <div className={styles.spinner}></div>
                <p>Canceling Polymarket order...</p>
                <p className={styles.subText}>
                  Please wait while we process the Polymarket order cancellation.
                </p>
              </div>
            </div>
          )}

          {state.step === "transaction" && (
            <div className={styles.stepContent}>
              <div className={styles.successMessage}>
                <p>
                  ✅{" "}
                  {state.polymarketCanceled
                    ? "Polymarket order canceled successfully"
                    : "Polymarket cancellation completed"}
                </p>
              </div>

              <div className={styles.transactionSection}>
                <h3>Sign Cancellation Transaction</h3>
                <p>
                  Now you need to sign the transaction to remove the conditional order from CoW
                  Protocol.
                </p>
              </div>

              <button
                className={styles.primaryButton}
                onClick={handleSendTransaction}
                disabled={isSending || isWaiting || !state.isSafeInitialized}
              >
                {isSending ? (
                  <>
                    <span className={styles.spinner}></span>
                    Signing...
                  </>
                ) : isWaiting ? (
                  <>
                    <span className={styles.spinner}></span>
                    Waiting for confirmation...
                  </>
                ) : (
                  "Sign & Execute Transaction"
                )}
              </button>
            </div>
          )}

          {state.step === "signed" && (
            <div className={styles.stepContent}>
              <div className={styles.successIcon}>✅</div>
              <h3>Transaction Signed Successfully!</h3>
              <p className={styles.stepDescription}>
                Your cancellation transaction has been signed and submitted to the blockchain.
              </p>

              <div className={styles.successDetails}>
                {state.polymarketCanceled && <p>✅ Polymarket order canceled</p>}
                {state.transactionHash && (
                  <p>
                    ✅ Transaction Hash:
                    <a
                      href={`https://polygonscan.com/tx/${state.transactionHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "#0066cc", textDecoration: "underline", marginLeft: "4px" }}
                    >
                      {state.transactionHash.slice(0, 10)}...{state.transactionHash.slice(-8)}
                    </a>
                  </p>
                )}
              </div>

              <div className={styles.loadingSection} style={{ marginTop: "16px" }}>
                <div className={styles.spinner}></div>
                <p>Waiting for transaction confirmation and indexing to update order status...</p>
                <p className={styles.subText}>
                  This usually takes 15-35 seconds on Polygon (confirmation + indexing)
                </p>
              </div>
            </div>
          )}

          {state.step === "success" && (
            <div className={styles.stepContent}>
              <div className={styles.successIcon}>✅</div>
              <h3>Order Cancellation Complete!</h3>

              <div className={styles.successDetails}>
                {state.polymarketCanceled && <p>✅ Polymarket order canceled</p>}
                {state.transactionHash && (
                  <p>
                    ✅ CoW Protocol transaction executed:
                    <a
                      href={`https://polygonscan.com/tx/${state.transactionHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "#0066cc", textDecoration: "underline", marginLeft: "4px" }}
                    >
                      {state.transactionHash.slice(0, 10)}...{state.transactionHash.slice(-8)}
                    </a>
                  </p>
                )}
              </div>

              {state.errorMessage && (
                <div
                  className={styles.infoBox}
                  style={{
                    backgroundColor: "#fff3cd",
                    border: "1px solid #ffeaa7",
                    marginTop: "16px",
                  }}
                >
                  <p style={{ color: "#856404", margin: "0" }}>⚠️ {state.errorMessage}</p>
                </div>
              )}

              <p className={styles.note}>
                The order has been successfully canceled and will be updated in your order list.
              </p>

              <button className={styles.primaryButton} onClick={onClose}>
                Close
              </button>
            </div>
          )}

          {state.step === "error" && (
            <div className={styles.stepContent}>
              {state.error === "transaction_needs_signatures" ? (
                <>
                  <div className={styles.successIcon}>✅</div>
                  <h3>Transaction Signed Successfully!</h3>

                  <div className={styles.successDetails}>
                    {state.polymarketCanceled && <p>✅ Polymarket order canceled</p>}
                    <p>✅ Safe transaction signed and queued</p>
                  </div>

                  <div className={styles.waitingNote}>
                    <p>
                      <strong>Additional signatures required</strong>
                    </p>
                    <p>{state.errorMessage}</p>
                    <p>
                      The order will be canceled once all required signatures are collected and the
                      transaction is executed.
                    </p>
                  </div>

                  <button className={styles.primaryButton} onClick={onClose}>
                    Close
                  </button>
                </>
              ) : (
                <>
                  <div className={styles.errorIcon}>❌</div>
                  <h3>Cancellation Error</h3>

                  <div className={styles.errorMessage}>
                    {state.error === "transaction_refused" || state.error === "user_rejected" ? (
                      <p>Transaction was rejected. No changes have been made to your order.</p>
                    ) : state.error === "transaction_timeout" ? (
                      <>
                        <p>
                          Transaction took too long to process. It may still be pending in your Safe
                          wallet.
                        </p>
                        <p className={styles.note}>
                          Check your Safe wallet to see if the transaction is still pending. If it's
                          there, you can complete it from your Safe interface.
                        </p>
                      </>
                    ) : (
                      <p>
                        {state.errorMessage || "An unexpected error occurred during cancellation."}
                      </p>
                    )}
                  </div>

                  <div className={styles.buttonGroup}>
                    <button className={styles.cancelButton} onClick={onClose}>
                      Close
                    </button>
                    {state.error !== "transaction_refused" &&
                      state.error !== "user_rejected" &&
                      state.error !== "transaction_timeout" && (
                        <button
                          className={styles.retryButton}
                          onClick={() => setState((prev) => ({ ...prev, step: "confirm" }))}
                        >
                          Try Again
                        </button>
                      )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
