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
  transactionProgress?: {
    current: number;
    total: number;
    currentTxType?: string;
  };
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
  onError,
  transactionProgress
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
          
          // Always pass as batch structure to ensure proper Safe handling
          // This maintains consistency for both single and multi-transaction flows
          const transactionToPass = {
            transactions: batch.transactions,
            isBatch: true,
            needsApproval: batch.needsApproval,
            needsFallbackHandler: batch.needsFallbackHandler
          };

          onGetTransactionData(transactionToPass);
          
        } else {
          if (result.error === 'insufficient_balance') {
            onError(`Insufficient balance: ${result.message}`);
          } else {
            onError(result.message || 'Failed to prepare batch transaction');
          }
        }
      } catch (error) {
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
        <h2 className={styles.stepTitle}>
          {transactionProgress && transactionProgress.total > 1
            ? `Sign Transactions (${transactionProgress.current}/${transactionProgress.total})`
            : 'Sign Transaction'
          }
        </h2>
        <p className={styles.stepDescription}>
          {transactionProgress && transactionProgress.total > 1
            ? `Please sign the ${transactionProgress.currentTxType || 'transaction'} in your wallet.`
            : 'Please sign the transaction in your wallet.'
          }
        </p>
        <div className={styles.loadingSpinner}>
          <div className={styles.spinner}></div>
          <p>
            {transactionProgress && transactionProgress.total > 1
              ? `Waiting for signature... (${transactionProgress.currentTxType || 'Transaction'})`
              : 'Waiting for signature...'
            }
          </p>
        </div>

        {transactionProgress && transactionProgress.total > 1 && (
          <div className={styles.progressBar} style={{ marginTop: '20px' }}>
            <div className={styles.progressBarFill} style={{
              width: `${(transactionProgress.current / transactionProgress.total) * 100}%`
            }}></div>
            <span className={styles.progressText}>
              {transactionProgress.current}/{transactionProgress.total} transactions completed
            </span>
          </div>
        )}
      </div>
    );
  }

  if (isWaiting) {
    return (
      <div className={styles.stepContent}>
        <h2 className={styles.stepTitle}>
          {transactionProgress && transactionProgress.total > 1
            ? `Transaction Signed (${transactionProgress.current}/${transactionProgress.total})`
            : 'Transaction Signed Successfully'
          }
        </h2>
        <p className={styles.stepDescription}>
          {transactionProgress && transactionProgress.total > 1
            ? `Your ${transactionProgress.currentTxType || 'transaction'} has been signed and queued in your Safe.`
            : 'Your transaction has been signed and queued in your Safe.'
          }
        </p>
        <div className={styles.loadingSpinner}>
          <div className={styles.spinner}></div>
          <p>
            {transactionProgress && transactionProgress.total > 1
              ? `${transactionProgress.currentTxType || 'Transaction'} signed successfully`
              : 'Finalizing order status...'
            }
          </p>
          {transactionHash && (
            <p className={styles.transactionHash}>
              Transaction Hash: {transactionHash.substring(0, 10)}...{transactionHash.substring(transactionHash.length - 8)}
            </p>
          )}
        </div>

        {transactionProgress && transactionProgress.total > 1 && (
          <div className={styles.progressBar} style={{ marginTop: '20px' }}>
            <div className={styles.progressBarFill} style={{
              width: `${(transactionProgress.current / transactionProgress.total) * 100}%`
            }}></div>
            <span className={styles.progressText}>
              {transactionProgress.current}/{transactionProgress.total} transactions signed
            </span>
          </div>
        )}
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
        <p><strong>⚠️ Attention:</strong></p>
        <p>• Do not execute the transaction with the gas sponsored by Safe</p>
        <p>• Execute each transaction one by one, do not batch the transactions</p>
        {batchData?.needsApproval && (
          <p>• <strong>Each transaction in the batch requires individual signing</strong></p>
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
        disabled={isSending || isWaiting || !batchData}
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