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
  setupOnlyBatch?: boolean;
  needsFallbackHandler?: boolean;
  needsDomainVerifier?: boolean;
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
  
  // Also reset when returning to transaction step (e.g., after setup step completes)
  useEffect(() => {
    // If we have no batchData, allow refetch (happens when going back to transaction step)
    if (!batchData) {
      didFetchRef.current = false;
    }
  }, [batchData]);

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
          const gasEstimate = result.data.gasEstimate;
          
          setBatchData(batch);
          setTransactionSummary(result.data.summary);
          
          // Attach gas estimates to individual transactions if available
          const transactionsWithGas = batch.transactions.map((tx: any, index: number) => ({
            ...tx,
            gas: gasEstimate?.individualGasEstimates?.[index]
          }));
          
          console.log('💡 Transactions with gas estimates:', {
            count: transactionsWithGas.length,
            gasEstimates: gasEstimate?.individualGasEstimates,
            totalGas: gasEstimate?.totalGas
          });
          
          // Check if this requires two-step setup (fallback handler must be set first)
          if (batch.setupOnlyBatch) {
            // Show the setup transaction to the user, they can sign it
            const transactionToPass = {
              transactions: transactionsWithGas,
              isBatch: true,
              needsApproval: false,
              needsFallbackHandler: true,
              setupOnlyBatch: true,
              isSetupOnly: true // Flag for UI to show special message
            };
            
            onGetTransactionData(transactionToPass);
            return;
          }
          
          // Always pass as batch structure to ensure proper Safe handling
          // This maintains consistency for both single and multi-transaction flows
          const transactionToPass = {
            transactions: transactionsWithGas,
            isBatch: true,
            needsApproval: batch.needsApproval,
            needsFallbackHandler: batch.needsFallbackHandler,
            setupOnlyBatch: batch.setupOnlyBatch
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
    const isSetupTransaction = batchData?.setupOnlyBatch;
    const setupStepInfo = isSetupTransaction 
      ? (batchData?.needsFallbackHandler ? '1/2 - Setting up handler' : '2/2 - Setting up verifier')
      : null;
    
    return (
      <div className={styles.stepContent}>
        <h2 className={styles.stepTitle}>
          {isSetupTransaction 
            ? `Setup Transaction Signed (Step ${setupStepInfo})`
            : transactionProgress && transactionProgress.total > 1
              ? `Transaction Signed (${transactionProgress.current}/${transactionProgress.total})`
              : 'Transaction Signed Successfully'
          }
        </h2>
        <p className={styles.stepDescription}>
          {isSetupTransaction
            ? 'Your Safe is being configured. The popup will automatically continue to the next step once confirmed.'
            : transactionProgress && transactionProgress.total > 1
              ? `Your ${transactionProgress.currentTxType || 'transaction'} has been signed and queued in your Safe.`
              : 'Your transaction has been signed and queued in your Safe.'
          }
        </p>
        <div className={styles.loadingSpinner}>
          <div className={styles.spinner}></div>
          <p>
            {isSetupTransaction
              ? 'Waiting for blockchain confirmation and state propagation...'
              : transactionProgress && transactionProgress.total > 1
                ? `${transactionProgress.currentTxType || 'Transaction'} signed successfully`
                : 'Finalizing order status...'
            }
          </p>
          {transactionHash && (
            <p className={styles.transactionHash}>
              Transaction Hash: {transactionHash.substring(0, 10)}...{transactionHash.substring(transactionHash.length - 8)}
            </p>
          )}
          {isSetupTransaction && (
            <p className={styles.infoText} style={{ marginTop: '12px', fontSize: '14px', color: '#666' }}>
              ⏳ This may take ~15 seconds. Please keep this window open.
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
      {batchData?.setupOnlyBatch ? (
        <>
          <h2 className={styles.stepTitle}>
            ⚙️ Safe Setup Required {batchData.needsFallbackHandler ? '(Step 1/2)' : '(Step 2/2)'}
          </h2>
          <p className={styles.stepDescription}>
            Your Safe wallet needs to be configured before creating orders. This is a one-time setup process.
          </p>
          
          <div className={styles.infoBox} style={{ marginBottom: '16px', backgroundColor: '#e3f2fd', border: '1px solid #2196f3' }}>
            <h3 style={{ color: '#1565c0', marginTop: '0' }}>
              {batchData.needsFallbackHandler ? '🔧 Step 1: Set Fallback Handler' : '🔐 Step 2: Set Domain Verifier'}
            </h3>
            <p style={{ color: '#1565c0', marginBottom: '8px' }}>
              {batchData.needsFallbackHandler 
                ? 'First, we need to set the fallback handler. This enables your Safe to route calls to CoW Protocol contracts.'
                : 'Next, we need to set the domain verifier. This authorizes your Safe to create conditional orders with CoW Protocol.'
              }
            </p>
            <p style={{ color: '#1565c0', fontWeight: 'bold', marginBottom: '8px' }}>
              ⏳ After signing this transaction and waiting for confirmation, please <strong>create your order again</strong> to continue setup.
            </p>
            {batchData.needsDomainVerifier && !batchData.needsFallbackHandler && (
              <p style={{ color: '#1565c0', fontSize: '0.9em' }}>
                ℹ️ After this step completes, your Safe will be fully configured and you can create orders normally.
              </p>
            )}
          </div>

          <div className={styles.infoBox} style={{ marginBottom: '16px' }}>
            <h3>What's happening:</h3>
            <div className={styles.transactionDetails}>
              {transactionSummary && transactionSummary.summary && (
                <ul style={{ margin: '8px 0', paddingLeft: '20px' }}>
                  {transactionSummary.summary.map((step, index) => (
                    <li key={index} style={{ marginBottom: '6px', color: '#333' }}>{step}</li>
                  ))}
                </ul>
              )}
              <div className={styles.detailRow} style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #ddd' }}>
                <span className={styles.detailLabel}>Setup Type:</span>
                <span className={styles.detailValue} style={{ color: '#28a745' }}>One-time configuration</span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Next Step:</span>
                <span className={styles.detailValue}>
                  {batchData.needsFallbackHandler 
                    ? 'Domain verifier setup' 
                    : 'Ready to create orders'}
                </span>
              </div>
            </div>
          </div>
          
          <button 
            className={styles.primaryButton}
            onClick={handleSignTransaction}
            disabled={isSending}
          >
            {isSending ? 'Signing...' : `Sign Setup Transaction ${batchData.needsFallbackHandler ? '(1/2)' : '(2/2)'}`}
          </button>
        </>
      ) : (
        <>
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
        </>
      )}
    </div>
  );
};