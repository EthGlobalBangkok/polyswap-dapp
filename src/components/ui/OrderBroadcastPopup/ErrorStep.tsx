"use client";

import React from "react";
import styles from "./OrderBroadcastPopup.module.css";

interface ErrorStepProps {
  error: string;
  errorMessage: string;
  onRetry: () => void;
  onClose: () => void;
}

export const ErrorStep: React.FC<ErrorStepProps> = ({ error, errorMessage, onRetry, onClose }) => {
  // Get user-friendly title and description based on error type
  const getErrorContent = () => {
    switch (error) {
      case "transaction_refused":
      case "safe_transaction_refused":
        return {
          icon: "🚫",
          title: "Transaction Signing Refused",
          description: "You declined to sign the transaction in your Safe wallet.",
          showRetry: true,
        };

      case "not_safe_wallet":
        return {
          icon: "🔒",
          title: "Safe Wallet Required",
          description:
            "Please connect using a Safe wallet. Only Safe wallets are supported for conditional orders.",
          showRetry: false,
        };

      case "safe_initialization_failed":
        return {
          icon: "⚙️",
          title: "Safe Wallet Connection Failed",
          description:
            "Failed to initialize connection with your Safe wallet. Please reconnect and try again.",
          showRetry: true,
        };

      case "unsupported_wallet":
        return {
          icon: "❌",
          title: "Unsupported Wallet",
          description: "Please connect using a Safe wallet via WalletConnect or Safe Apps.",
          showRetry: false,
        };

      case "transaction_needs_signatures":
        return {
          icon: "✋",
          title: "Additional Signatures Required",
          description:
            "Transaction created but requires additional signatures from other Safe owners.",
          showRetry: false,
        };

      case "walletconnect_connection_issue":
        return {
          icon: "📱",
          title: "Connection Issue",
          description:
            "WalletConnect connection issue. Please disconnect and reconnect your Safe wallet.",
          showRetry: true,
        };

      case "transaction_timeout":
        return {
          icon: "⏱️",
          title: "Transaction Timeout",
          description:
            "The transaction took longer than expected to process. It may still be pending in your Safe wallet. Please check your Safe app or try again.",
          showRetry: true,
        };

      default:
        return {
          icon: "⚠️",
          title: "Something Went Wrong",
          description: errorMessage,
          showRetry: true,
        };
    }
  };

  const errorContent = getErrorContent();

  return (
    <div className={styles.stepContent}>
      <div className={styles.errorIcon}>{errorContent.icon}</div>
      <h2 className={styles.stepTitle}>{errorContent.title}</h2>
      <p className={styles.stepDescription}>{errorContent.description}</p>

      <div className={styles.infoBox}>
        <h3>Error Details:</h3>
        <div className={styles.transactionDetails}>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Error Code:</span>
            <span className={styles.detailValue}>{error}</span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Message:</span>
            <span className={styles.detailValue}>{errorMessage}</span>
          </div>
        </div>
      </div>

      <div className={styles.buttonGroup}>
        {errorContent.showRetry && (
          <button className={styles.secondaryButton} onClick={onRetry}>
            Try Again
          </button>
        )}
        <button className={styles.primaryButton} onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
};
