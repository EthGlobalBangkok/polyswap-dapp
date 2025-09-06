'use client';

import React, { useState, useEffect } from 'react';
import styles from './OrderBroadcastPopup.module.css';

interface TransactionSignStepProps {
  orderId: number; // Changed from orderHash to orderId
  polymarketOrderHash: string;
  onGetTransactionData: (transactionData: any) => void;
  onSendTransaction: () => void;
  isSending: boolean;
  isWaiting: boolean;
  transactionHash?: string;
  onError: (errorMessage: string) => void;
}

export const TransactionSignStep: React.FC<TransactionSignStepProps> = ({ 
  orderId, // Changed from orderHash to orderId
  polymarketOrderHash,
  onGetTransactionData,
  onSendTransaction,
  isSending,
  isWaiting,
  transactionHash,
  onError
}) => {
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const fetchTransactionData = async () => {
      setIsLoading(true);
      
      try {
        const response = await fetch(`/api/polyswap/orders/id/${orderId}/transaction`); // Updated to use numerical ID endpoint
        const result = await response.json();
        
        if (result.success) {
          onGetTransactionData(result.data.transaction);
        } else {
          onError(result.message || 'Failed to get transaction data');
        }
      } catch (error) {
        onError(error instanceof Error ? error.message : 'Failed to get transaction data');
      } finally {
        setIsLoading(false);
      }
    };

    fetchTransactionData();
  }, [orderId, onGetTransactionData, onError]); // Updated dependency

  const handleSignTransaction = () => {
    onSendTransaction();
  };

  if (isLoading) {
    return (
      <div className={styles.stepContent}>
        <h2 className={styles.stepTitle}>Preparing Transaction</h2>
        <p className={styles.stepDescription}>
          Generating transaction data for your wallet...
        </p>
        <div className={styles.loadingSpinner}>
          <div className={styles.spinner}></div>
        </div>
      </div>
    );
  }

  if (isSending) {
    return (
      <div className={styles.stepContent}>
        <h2 className={styles.stepTitle}>Sign Transaction</h2>
        <p className={styles.stepDescription}>
          Please sign the transaction in your wallet.
        </p>
        <div className={styles.loadingSpinner}>
          <div className={styles.spinner}></div>
          <p>Waiting for signature...</p>
        </div>
      </div>
    );
  }

  if (isWaiting) {
    return (
      <div className={styles.stepContent}>
        <h2 className={styles.stepTitle}>Transaction Broadcasting</h2>
        <p className={styles.stepDescription}>
          Your transaction is being processed on the blockchain.
        </p>
        <div className={styles.loadingSpinner}>
          <div className={styles.spinner}></div>
          <p>Waiting for confirmation...</p>
          {transactionHash && (
            <p className={styles.transactionHash}>
              Transaction Hash: {transactionHash.substring(0, 10)}...{transactionHash.substring(transactionHash.length - 8)}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.stepContent}>
      <h2 className={styles.stepTitle}>Sign Transaction</h2>
      <p className={styles.stepDescription}>
        Your Polymarket order has been created. Now you need to sign and broadcast 
        your PolySwap order on-chain.
      </p>
      
      <div className={styles.infoBox}>
        <h3>Transaction Details:</h3>
        <div className={styles.transactionDetails}>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Order Hash:</span>
            <span className={styles.detailValue}>{orderHash.substring(0, 10)}...{orderHash.substring(orderHash.length - 8)}</span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Polymarket Hash:</span>
            <span className={styles.detailValue}>{polymarketOrderHash.substring(0, 10)}...{polymarketOrderHash.substring(polymarketOrderHash.length - 8)}</span>
          </div>
        </div>
      </div>
      
      <button
        className={styles.primaryButton}
        onClick={handleSignTransaction}
        disabled={isSending || isWaiting}
      >
        {isSending ? (
          <>
            <span className={styles.spinner}></span>
            Signing...
          </>
        ) : (
          'Sign & Broadcast Order'
        )}
      </button>
    </div>
  );
};