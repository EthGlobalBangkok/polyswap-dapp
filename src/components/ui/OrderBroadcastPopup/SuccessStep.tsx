'use client';

import React from 'react';
import styles from './OrderBroadcastPopup.module.css';

interface SuccessStepProps {
  orderId: number; // Changed from orderHash to orderId
  polymarketOrderHash: string;
  transactionHash: string;
  onClose: () => void;
  warningMessage?: string;
}

export const SuccessStep: React.FC<SuccessStepProps> = ({
  orderId, // Changed from orderHash to orderId
  polymarketOrderHash,
  transactionHash,
  onClose,
  warningMessage
}) => {
  const handleViewOnExplorer = () => {
    const explorerUrl = `https://polygonscan.com/tx/${transactionHash}`;
    window.open(explorerUrl, '_blank');
  };

  return (
    <div className={styles.stepContent}>
      <div className={styles.successIcon}>✓</div>
      <h2 className={styles.stepTitle}>Order Created Successfully!</h2>
      <p className={styles.stepDescription}>
        Your PolySwap order has been successfully broadcast on-chain.
      </p>
      
      <div className={styles.infoBox}>
        <h3>Order Details:</h3>
        <div className={styles.transactionDetails}>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Order ID:</span>
            <span className={styles.detailValue}>{orderId}</span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Polymarket Hash:</span>
            <span className={styles.detailValue}>{polymarketOrderHash.substring(0, 10)}...{polymarketOrderHash.substring(polymarketOrderHash.length - 8)}</span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Transaction Hash:</span>
            <span className={styles.detailValue}>{transactionHash.substring(0, 10)}...{transactionHash.substring(transactionHash.length - 8)}</span>
          </div>
        </div>
      </div>

      {warningMessage && (
        <div className={styles.infoBox} style={{ backgroundColor: '#fff3cd', border: '1px solid #ffeaa7', marginTop: '16px' }}>
          <p style={{ color: '#856404', margin: '0' }}>
            ⚠️ {warningMessage}
          </p>
        </div>
      )}

      <div className={styles.buttonGroup}>
        <button
          className={styles.secondaryButton}
          onClick={handleViewOnExplorer}
        >
          View on Explorer
        </button>
        <button
          className={styles.primaryButton}
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </div>
  );
};