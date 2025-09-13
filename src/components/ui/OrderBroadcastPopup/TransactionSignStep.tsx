'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useAccount, usePublicClient } from 'wagmi';
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

interface BatchTransactionData {
  transactions: Array<{
    to: string;
    data: string;
    value: string;
  }>;
  needsApproval: boolean;
  approvalTransaction?: {
    to: string;
    data: string;
    value: string;
  };
  mainTransaction: {
    to: string;
    data: string;
    value: string;
  };
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
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const [isLoading, setIsLoading] = useState(false);
  const [batchData, setBatchData] = useState<BatchTransactionData | null>(null);
  const [transactionSummary, setTransactionSummary] = useState<{
    transactionCount: number;
    hasApproval: boolean;
    summary: string[];
  } | null>(null);
  const didFetchRef = useRef(false);

  // Reset guard when orderId changes so we fetch once per order
  useEffect(() => {
    didFetchRef.current = false;
    setBatchData(null);
    setTransactionSummary(null);
  }, [orderId]);

  useEffect(() => {
    const fetchBatchTransactionData = async () => {
      if (!address || !publicClient) {
        onError('Wallet not connected');
        return;
      }

      setIsLoading(true);
      
      try {
        // Get RPC URL from public client
        const rpcUrl = (publicClient as any).transport?.url || 'https://polygon-rpc.com';
        
        console.log('Fetching batch transaction data with:', {
          orderId,
          ownerAddress: address,
          rpcUrl
        });

        const response = await fetch(`/api/polyswap/orders/id/${orderId}/batch-transaction`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ownerAddress: address,
            rpcUrl: rpcUrl
          })
        });

        const result = await response.json();
        
        if (result.success) {
          const batch = result.data.batchTransaction;
          setBatchData(batch);
          setTransactionSummary(result.data.summary);
          
          // For backwards compatibility, pass the main transaction or first transaction
          const transactionToPass = batch.transactions.length === 1 
            ? batch.transactions[0]
            : { transactions: batch.transactions, isBatch: true };
          
          onGetTransactionData(transactionToPass);
          
          console.log('Batch transaction prepared:', {
            needsApproval: batch.needsApproval,
            transactionCount: batch.transactions.length,
            gasEstimate: result.data.gasEstimate
          });
        } else {
          if (result.error === 'insufficient_balance') {
            onError(`Insufficient balance: ${result.message}`);
          } else {
            onError(result.message || 'Failed to prepare batch transaction');
          }
        }
      } catch (error) {
        console.error('Error fetching batch transaction data:', error);
        onError(error instanceof Error ? error.message : 'Failed to prepare batch transaction');
      } finally {
        setIsLoading(false);
      }
    };

    // Guard to avoid multiple calls (e.g., React Strict Mode) and re-renders
    if (!didFetchRef.current && address && publicClient) {
      didFetchRef.current = true;
      fetchBatchTransactionData();
    }
  }, [orderId, address, publicClient, onGetTransactionData, onError]);

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
      <h2 className={styles.stepTitle}>
        {batchData?.needsApproval ? 'Sign Batch Transaction (with Approval)' : 'Sign Transaction'}
      </h2>
      <p className={styles.stepDescription}>
        Your Polymarket order has been created. Now you need to sign and broadcast 
        your PolySwap conditional order using your Safe wallet.
      </p>
      
      {batchData?.needsApproval && (
        <div className={styles.infoBox} style={{ marginBottom: '16px', backgroundColor: '#fff3cd', border: '1px solid #ffeaa7' }}>
          <h3 style={{ color: '#856404', marginTop: '0' }}>⚠️ ERC20 Approval Required</h3>
          <p style={{ color: '#856404', marginBottom: '8px' }}>
            This transaction requires approval to spend your tokens. The batch will include:
          </p>
          {transactionSummary && (
            <ol style={{ color: '#856404', marginLeft: '16px' }}>
              {transactionSummary.summary.map((step, index) => (
                <li key={index}>{step}</li>
              ))}
            </ol>
          )}
        </div>
      )}
      
      <div className={styles.infoBox} style={{ marginBottom: '16px', fontSize: '14px', color: '#666' }}>
        <p><strong>📱 For WalletConnect users:</strong></p>
        <p>• Check your Safe mobile/desktop app for the transaction request</p>
        <p>• The transaction will be queued if additional signatures are required</p>
        <p>• Multi-signature execution is handled automatically by your Safe</p>
        <p>• If you see RPC errors, the transaction may still be queued successfully</p>
        {batchData?.needsApproval && (
          <p>• <strong>Batch transactions may take longer to process</strong></p>
        )}
      </div>
      
      <div className={styles.infoBox}>
        <h3>Transaction Details:</h3>
        <div className={styles.transactionDetails}>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Transaction Type:</span>
            <span className={styles.detailValue}>
              {batchData?.needsApproval ? `Batch (${transactionSummary?.transactionCount} transactions)` : 'Single Transaction'}
            </span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Order Hash:</span>
            <span className={styles.detailValue}>{polymarketOrderHash.substring(0, 10)}...{polymarketOrderHash.substring(polymarketOrderHash.length - 8)}</span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Polymarket Hash:</span>
            <span className={styles.detailValue}>{polymarketOrderHash.substring(0, 10)}...{polymarketOrderHash.substring(polymarketOrderHash.length - 8)}</span>
          </div>
          {batchData?.needsApproval && (
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>Includes Approval:</span>
              <span className={styles.detailValue} style={{ color: '#28a745' }}>Yes (Unlimited)</span>
            </div>
          )}
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
          batchData?.needsApproval 
            ? 'Sign & Execute Batch Transaction'
            : 'Sign & Execute Safe Transaction'
        )}
      </button>
    </div>
  );
};