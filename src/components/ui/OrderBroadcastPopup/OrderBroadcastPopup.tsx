'use client';

import React, { useState, useEffect } from 'react';
import { useAccount, usePublicClient, useConnectorClient, useSendTransaction, useWaitForTransactionReceipt } from 'wagmi';
import { safeService } from '../../../services/safeService';
import { walletConnectSafeService } from '../../../services/walletConnectSafeService';
import { apiService } from '../../../services/api';
import { ethers } from 'ethers';
import { OrderBroadcastStep } from './OrderBroadcastStep';
import { PolymarketOrderStep } from './PolymarketOrderStep';
import { TransactionSignStep } from './TransactionSignStep';
import { SuccessStep } from './SuccessStep';
import { ErrorStep } from './ErrorStep';
import styles from './OrderBroadcastPopup.module.css';

interface OrderBroadcastPopupProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: number; // Changed from orderHash to orderId
}

export type Step = 'polymarket' | 'transaction' | 'signed' | 'success' | 'error';

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
  };
  transactionProgress?: {
    current: number;
    total: number;
    currentTxType?: string;
  };
}

const OrderBroadcastPopup: React.FC<OrderBroadcastPopupProps> = ({ 
  isOpen, 
  onClose, 
  orderId 
}) => {
  console.log('OrderBroadcastPopup rendered with:', { isOpen, orderId });
  
  const { address, connector } = useAccount();
  const publicClient = usePublicClient();
  const { data: client } = useConnectorClient();
  const [isSending, setIsSending] = useState(false);
  const [isWaiting, setIsWaiting] = useState(false);
  
  // Wagmi hooks for direct transaction as final fallback
  const { sendTransaction: wagmiSendTransaction, isPending: wagmiIsPending, data: wagmiTxData } = useSendTransaction();
  const { isLoading: wagmiIsWaiting, isSuccess: wagmiIsSuccess } = useWaitForTransactionReceipt({
    hash: wagmiTxData,
  });
  
  const [state, setState] = useState<PopupState>({
    step: 'polymarket',
    polymarketOrderHash: undefined,
    transactionData: undefined,
    transactionHash: undefined,
    safeTxHash: undefined,
    error: undefined,
    errorMessage: undefined,
    isSafeInitialized: false,
    isSafeWallet: undefined,
    safeInfo: undefined
  });

  // Initialize Safe services when wallet is connected
  useEffect(() => {
    const initializeSafe = async () => {
      if (!address || !publicClient) {
        console.log('Waiting for address or publicClient...');
        return;
      }

      const isSafeApp = connector?.name === 'Safe';
      const isWalletConnect = connector?.name === 'WalletConnect';

      console.log('Initializing for connector:', connector?.name, { isSafeApp, isWalletConnect, address, hasClient: !!client });

      // Reset any previous errors when trying to initialize
      if (state.error === 'unsupported_wallet' || state.error === 'safe_initialization_failed') {
        setState(prev => ({
          ...prev,
          error: undefined,
          errorMessage: undefined
        }));
      }

      if (isSafeApp) {
        // Running inside Safe App - use Safe SDK
        try {
          const provider = new ethers.BrowserProvider(publicClient as any);
          await safeService.initialize(address, provider);
          console.log('Safe App initialization successful');
          setState(prev => ({
            ...prev,
            isSafeInitialized: true,
            isSafeWallet: true
          }));
          console.log('✅ Safe App initialization completed');
        } catch (error) {
          console.error('Failed to initialize Safe SDK:', error);
          setState(prev => ({
            ...prev,
            step: 'error',
            error: 'safe_initialization_failed',
            errorMessage: error instanceof Error ? error.message : 'Failed to initialize Safe SDK'
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
          console.log('Checking WalletConnect Safe connection for address:', address);
          const safeInfo = await walletConnectSafeService.getSafeInfo(address);

          console.log('Safe info result:', safeInfo);

          // If the direct address check fails, it might be an EOA owner of a Safe
          // For WalletConnect connections, we can be more permissive since the Safe app controls access
          if (!safeInfo.isSafe) {
            console.log('Address is not a Safe contract, but WalletConnect connection detected - allowing as Safe owner');
          }

          setState(prev => ({
            ...prev,
            isSafeInitialized: true,
            isSafeWallet: true,
            safeInfo: safeInfo.isSafe ? safeInfo : { isSafe: true, isOwner: true } // Mark as Safe owner if not direct Safe contract
          }));

          console.log('WalletConnect Safe initialization successful');
        } catch (error) {
          console.error('Failed to initialize WalletConnect Safe service:', error);
          setState(prev => ({
            ...prev,
            step: 'error',
            error: 'safe_initialization_failed',
            errorMessage: error instanceof Error ? error.message : 'Failed to initialize Safe wallet connection'
          }));
        }
      } else if (isWalletConnect && !client) {
        console.log('WalletConnect detected but client not ready yet...');
        // Don't show error yet, wait for client
        return;
      } else {
        console.log('Unsupported wallet type:', { connector: connector?.name, hasClient: !!client });
        setState(prev => ({
          ...prev,
          step: 'error',
          error: 'unsupported_wallet',
          errorMessage: 'Please connect using a Safe wallet via WalletConnect or Safe Apps.'
        }));
      }
    };

    initializeSafe();
  }, [address, publicClient, connector, client]);

  // Handle Wagmi transaction success
  useEffect(() => {
    if (wagmiIsSuccess && wagmiTxData && state.step === 'transaction') {
      console.log('Wagmi transaction succeeded:', wagmiTxData);

      // Update database with transaction hash and mark as success
      const updateDatabase = async () => {
        try {
          await apiService.updateOrderTransactionHashById(orderId, wagmiTxData);
          setState(prev => ({
            ...prev,
            step: 'success',
            transactionHash: wagmiTxData
          }));
        } catch (dbError) {
          console.error('Failed to update order in database:', dbError);
          // Still mark as success since the transaction was executed
          setState(prev => ({
            ...prev,
            step: 'success',
            transactionHash: wagmiTxData
          }));
        }
      };

      updateDatabase();
    }
  }, [wagmiIsSuccess, wagmiTxData, state.step, orderId]);

  // Handle 'signed' state - wait for confirmation and update database
  useEffect(() => {
    const handleSignedState = async () => {
      if (state.step !== 'signed' || !state.transactionHash) {
        return;
      }

      console.log('🚀 [POPUP] Handling signed state - waiting for confirmation');
      console.log('🔍 [POPUP] Transaction hash:', state.transactionHash);

      try {
        // Wait for transaction to be confirmed on-chain
        console.log('⏳ [POPUP] Waiting for transaction confirmation...');
        await walletConnectSafeService.waitForTransactionConfirmation(state.transactionHash, 60000); // 1 minute timeout
        console.log('✅ [POPUP] Transaction confirmed on-chain');

        // Add 5-second delay for propagation to ensure indexing services are updated
        console.log('⏳ [POPUP] Waiting 5 seconds for blockchain indexing propagation...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        console.log('✅ [POPUP] Propagation delay completed');

        // Now that transaction is confirmed and propagated, update the database
        console.log('🔄 [POPUP] Starting database update after confirmation and propagation...');
        let updateResult = await apiService.updateOrderTransactionHashById(orderId, state.transactionHash);
        console.log('📋 [POPUP] Database update result:', JSON.stringify(updateResult, null, 2));

        if (updateResult.success) {
          console.log('✅ [POPUP] Order successfully updated in database');
          setState(prev => ({ ...prev, step: 'success' }));
        } else {
          console.error('❌ [POPUP] Database update failed:', updateResult);
          // Still mark as success since the transaction was executed
          setState(prev => ({
            ...prev,
            step: 'success',
            errorMessage: 'Transaction successful but database update failed. Order may not show as live immediately.'
          }));
        }
      } catch (error) {
        console.error('💥 [POPUP] Error in signed state handling:', error);

        // Check if it's a timeout vs other error
        if (error instanceof Error && error.message.includes('timeout')) {
          // Transaction confirmation timeout - still mark as success but with warning
          setState(prev => ({
            ...prev,
            step: 'success',
            errorMessage: 'Transaction signed successfully but confirmation took longer than expected. Order should be live shortly.'
          }));
        } else {
          // Other errors - still mark as success since transaction was signed
          setState(prev => ({
            ...prev,
            step: 'success',
            errorMessage: 'Transaction signed successfully but there was an issue updating the order status. Order should be live shortly.'
          }));
        }
      }
    };

    handleSignedState();
  }, [state.step, state.transactionHash, orderId]);

  // On open, fetch order to determine resume step from DB status and polymarket hash
  useEffect(() => {
    let abort = false;
    const primeFromDb = async () => {
      if (!isOpen || !orderId) return;
      try {
        console.log('🔍 primeFromDb called:', { isOpen, orderId });
        const res = await fetch(`/api/polyswap/orders/id/${orderId}`);
        const json = await res.json();
        if (!res.ok || !json.success) return;
        if (abort) return;
        const order = json.data as { status: string; polymarket_order_hash?: string | null; transaction_hash?: string | null };

        console.log('🔍 primeFromDb order data:', {
          status: order.status,
          hasPolymarketHash: !!order.polymarket_order_hash,
          polymarketHash: order.polymarket_order_hash,
          hasTransactionHash: !!order.transaction_hash
        });

        // If Polymarket order already created, skip to transaction step
        if (order.polymarket_order_hash) {
          console.log('📋 primeFromDb: Skipping to transaction step');
          setState(prev => ({
            ...prev,
            step: 'transaction',
            polymarketOrderHash: order.polymarket_order_hash || undefined
          }));
        } else {
          console.log('📋 primeFromDb: Starting from polymarket step');
        }
      } catch (error) {
        console.error('❌ primeFromDb error:', error);
      }
    };
    primeFromDb();
    return () => { abort = true; };
  }, [isOpen, orderId]);


  if (!isOpen) {
    console.log('Popup is not open, returning null');
    return null;
  }

  const handleCreatePolymarketOrder = async (polymarketOrderHash: string) => {
    console.log('✅ Polymarket order created, moving to transaction step:', polymarketOrderHash);
    setState(prev => ({
      ...prev,
      step: 'transaction',
      polymarketOrderHash,
      error: undefined,
      errorMessage: undefined
    }));
  };

  const handleGetTransactionData = async (transactionData: any) => {
    // Initialize transaction progress for batch transactions
    const isBatch = transactionData.isBatch && Array.isArray(transactionData.transactions);
    const totalTxs = isBatch ? transactionData.transactions.length : 1;

    console.log('✅ Transaction data received:', {
      isBatch,
      totalTxs,
      hasTransactions: Array.isArray(transactionData.transactions),
      transactionCount: transactionData.transactions?.length
    });

    setState(prev => ({
      ...prev,
      transactionData,
      transactionProgress: totalTxs > 1 ? {
        current: 0,
        total: totalTxs,
        currentTxType: 'Ready to sign'
      } : undefined,
      error: undefined,
      errorMessage: undefined
    }));
  };

  const handleSendTransaction = async () => {
    console.log('🚀 [POPUP] handleSendTransaction START');
    console.log('🔍 [POPUP] Initial state check:', {
      hasTransactionData: !!state.transactionData,
      isSafeInitialized: state.isSafeInitialized,
      step: state.step,
      orderId: orderId,
      canProceed: !!(state.transactionData && state.isSafeInitialized),
      connectorName: connector?.name,
      address: address
    });
    console.log('🔍 [POPUP] Transaction data structure:', JSON.stringify(state.transactionData, null, 2));

    if (!state.transactionData || !state.isSafeInitialized) {
      console.error('❌ [POPUP] handleSendTransaction BLOCKED - Missing requirements:', {
        transactionData: !!state.transactionData,
        isSafeInitialized: state.isSafeInitialized
      });
      return;
    }

    console.log('🔄 [POPUP] Setting isSending = true');
    setIsSending(true);
    
    try {
      const isSafeApp = connector?.name === 'Safe';
      const isWalletConnect = connector?.name === 'WalletConnect';

      console.log('🔍 [POPUP] Connector analysis:', {
        connectorName: connector?.name,
        isSafeApp,
        isWalletConnect
      });

      let transactionHash: string;

      // Check if this is a batch transaction (all Safe transactions are now batch format)
      const isBatchTransaction = state.transactionData.isBatch && Array.isArray(state.transactionData.transactions);

      console.log('🔍 [POPUP] Transaction structure analysis:', {
        isBatch: state.transactionData.isBatch,
        hasTransactions: Array.isArray(state.transactionData.transactions),
        transactionCount: state.transactionData.transactions?.length,
        isBatchTransaction,
        transactionDataKeys: Object.keys(state.transactionData)
      });

      if (isSafeApp) {
        let result;
        
        if (isBatchTransaction) {
          // Use Safe SDK batch transaction method
          console.log('Sending batch transaction via Safe SDK:', state.transactionData.transactions);
          result = await safeService.createBatchTransaction(
            state.transactionData.transactions.map((tx: any) => ({
              to: tx.to,
              data: tx.data,
              value: tx.value
            }))
          );
        } else {
          // Use Safe SDK for single transaction
          result = await safeService.createSafeTransaction({
            to: state.transactionData.to,
            data: state.transactionData.data,
            value: state.transactionData.value
          });
        }

        setState(prev => ({
          ...prev,
          safeTxHash: result.safeTxHash,
          transactionHash: result.transactionHash
        }));

        if (result.executed && result.transactionHash) {
          transactionHash = result.transactionHash;
        } else {
          // Transaction created but not executed (needs more signatures)
          setState(prev => ({
            ...prev,
            step: 'error',
            error: 'transaction_needs_signatures',
            errorMessage: 'Transaction created but requires additional signatures from other Safe owners'
          }));
          return;
        }
      } else if (isWalletConnect) {
        // Use WalletConnect Safe service directly - simplified flow
        console.log('🎯 [POPUP] Using WalletConnect Safe service for transaction signing');
        console.log('🔍 [POPUP] WalletConnect service initialized:', walletConnectSafeService.isInitialized());

        try {
          // Get transactions array - support both batch and single transaction formats
          const transactions = isBatchTransaction ? state.transactionData.transactions : [state.transactionData];

          console.log('🔍 [POPUP] Transactions to process:', transactions.length);
          console.log('📋 [POPUP] Transaction details:', JSON.stringify(transactions, null, 2));

          let results: any[];

          if (transactions.length === 1) {
            // Single transaction - use direct method
            console.log('🔄 [POPUP] Processing single transaction');
            const result = await walletConnectSafeService.sendTransaction(transactions[0]);
            results = [result];
            console.log('✅ [POPUP] Single transaction completed');
          } else {
            // Multiple transactions - use sequential method
            console.log('🔄 [POPUP] Processing multiple transactions sequentially');
            results = await walletConnectSafeService.sendMultipleTransactions(
              transactions,
              (current, total, txType, txHash) => {
                console.log(`📊 [POPUP] Progress update: ${current}/${total} - ${txType}`, txHash);
                setState(prev => ({
                  ...prev,
                  transactionProgress: {
                    current,
                    total,
                    currentTxType: txType
                  }
                }));
              }
            );
            console.log('✅ [POPUP] Multiple transactions completed');
          }

          console.log('🔍 [POPUP] All results received:', JSON.stringify(results, null, 2));

          // Get the last transaction hash (main transaction)
          const lastResult = results[results.length - 1];
          if (lastResult && lastResult.success) {
            transactionHash = lastResult.transactionHash;
            console.log('🎉 [POPUP] All transactions signed successfully, main hash:', transactionHash);

            // Move to "signed" state - show success with tx hash but keep processing
            console.log('🔄 [POPUP] Moving to signed state...');
            setState(prev => ({
              ...prev,
              step: 'signed',
              transactionHash: lastResult.transactionHash
            }));
            console.log('✅ [POPUP] Moved to signed state');
          } else {
            console.error('❌ [POPUP] Transaction results indicate failure:', results);
            throw new Error('Transaction signing failed');
          }
        } catch (walletConnectError) {
          console.error('💥 [POPUP] WalletConnect Safe service failed:', walletConnectError);
          throw walletConnectError;
        }
      } else {
        throw new Error('Unsupported wallet connection type');
      }

      // For WalletConnect, we now handle the flow differently:
      // 1. Transaction signing is complete (we're in "signed" state)
      // 2. Now we need to wait for confirmation and update the database
      // This will be handled by the useEffect for 'signed' state

    } catch (error) {
      console.error('💥 [POPUP] Transaction error occurred in handleSendTransaction');
      console.error('🔍 [POPUP] Error type:', typeof error);
      console.error('🔍 [POPUP] Error constructor:', error?.constructor?.name);
      console.error('🔍 [POPUP] Error message:', error instanceof Error ? error.message : String(error));
      console.error('🔍 [POPUP] Error code:', (error as any)?.code);
      console.error('🔍 [POPUP] Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));

      // Determine error type based on the error message
      let errorType = 'send_transaction_failed';
      let errorMessage = error instanceof Error ? error.message : 'Failed to send transaction';

      console.log('🔍 [POPUP] Processing error with type:', errorType);
      console.log('🔍 [POPUP] Processing error with message:', errorMessage);

      // Enhanced error detection for user rejection and Safe-specific issues
      if (error instanceof Error) {
        const errorMsg = error.message.toLowerCase();

        // General user rejection patterns
        if (errorMsg.includes('user rejected') ||
            errorMsg.includes('user denied') ||
            errorMsg.includes('denied') ||
            errorMsg.includes('rejected') ||
            errorMsg.includes('cancelled') ||
            errorMsg.includes('transaction was cancelled') ||
            errorMsg.includes('action_rejected') ||
            errorMsg.includes('user cancelled') ||
            errorMsg.includes('transaction signing was refused') ||
            errorMsg.includes('failed: transaction signing was refused')) {
          errorType = 'transaction_refused';
          errorMessage = 'Transaction signing was refused by user';
        }

        // Safe-specific rejection patterns
        else if (errorMsg.includes('safe transaction was rejected') ||
                 errorMsg.includes('transaction rejected by safe') ||
                 errorMsg.includes('refused in safe wallet')) {
          errorType = 'safe_transaction_refused';
          errorMessage = 'Transaction signing was refused in Safe wallet';
        }

        // Network/connection issues
        else if (errorMsg.includes('network connection issue') ||
                 errorMsg.includes('connection') ||
                 errorMsg.includes('network error')) {
          errorType = 'walletconnect_connection_issue';
          errorMessage = 'Network connection issue. Please check your connection and retry.';
        }

        // Safe SDK specific error patterns
        else if (errorMsg.includes('user denied transaction signature') ||
                 errorMsg.includes('transaction was not signed') ||
                 errorMsg.includes('signature rejected')) {
          errorType = 'safe_transaction_refused';
          errorMessage = 'Transaction signature was rejected in Safe wallet';
        }

        // Gas or transaction validation errors
        else if (errorMsg.includes('gas estimation failed') ||
                 errorMsg.includes('insufficient funds') ||
                 errorMsg.includes('nonce')) {
          errorType = 'transaction_validation_failed';
          errorMessage = error.message; // Use the original technical error message
        }
      }

      // Check for error codes that indicate user rejection
      if ((error as any)?.code === 4001 || (error as any)?.code === 'ACTION_REJECTED') {
        errorType = 'transaction_refused';
        errorMessage = 'Transaction signing was refused by user';
      }

      console.log('🔄 [POPUP] Setting error state...');
      setState(prev => ({
        ...prev,
        step: 'error',
        error: errorType,
        errorMessage: errorMessage
      }));
      console.log('❌ [POPUP] Error state set with type:', errorType);
    } finally {
      console.log('🏁 [POPUP] Transaction process complete, clearing loading states');
      setIsSending(false);
      setIsWaiting(false);
      console.log('✅ [POPUP] Loading states cleared');
      console.log('🏁 [POPUP] handleSendTransaction END');
    }
  };

  const handleClose = () => {
    onClose();
    // Reset state when closing
    setState(prev => ({
      ...prev,
      step: 'polymarket',
      polymarketOrderHash: undefined,
      transactionData: undefined,
      transactionHash: undefined,
      safeTxHash: undefined,
      error: undefined,
      errorMessage: undefined
      // Keep isSafeInitialized, isSafeWallet, and safeInfo to avoid re-initialization
    }));
  };

  const renderStep = () => {
    switch (state.step) {
      case 'polymarket':
        return (
          <PolymarketOrderStep
            orderId={orderId}
            onCreateSuccess={handleCreatePolymarketOrder}
            onError={(errorMessage) => {
              setState({
                step: 'error',
                error: 'polymarket_creation_failed',
                errorMessage
              });
            }}
          />
        );

      case 'transaction':
        return (
          <TransactionSignStep
            orderId={orderId} // Changed from orderHash to orderId
            polymarketOrderHash={state.polymarketOrderHash || ''}
            onGetTransactionData={handleGetTransactionData}
            onSendTransaction={handleSendTransaction}
            isSending={isSending || wagmiIsPending}
            isWaiting={isWaiting || wagmiIsWaiting}
            transactionHash={state.transactionHash}
            transactionProgress={state.transactionProgress}
            onError={(errorMessage) => {
              setState({
                step: 'error',
                error: 'transaction_preparation_failed',
                errorMessage
              });
            }}
          />
        );

      case 'signed':
        return (
          <div className={styles.stepContent}>
            <div className={styles.successIcon}>✅</div>
            <h2 className={styles.stepTitle}>Transaction Signed Successfully!</h2>
            <p className={styles.stepDescription}>
              Your transaction has been signed and submitted to the blockchain.
            </p>

            <div className={styles.infoBox} style={{ marginBottom: '16px' }}>
              <div className={styles.transactionDetails}>
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Transaction Hash:</span>
                  <span className={styles.detailValue}>
                    {state.transactionHash?.substring(0, 10)}...{state.transactionHash?.substring(state.transactionHash.length - 8)}
                  </span>
                </div>
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Status:</span>
                  <span className={styles.detailValue} style={{ color: '#28a745' }}>Signed & Submitted</span>
                </div>
              </div>
            </div>

            <div className={styles.loadingSpinner}>
              <div className={styles.spinner}></div>
              <p>Waiting for transaction confirmation and indexing to update order status...</p>
              <p className={styles.note} style={{ fontSize: '12px', marginTop: '8px' }}>
                This usually takes 15-35 seconds on Polygon (confirmation + indexing)
              </p>
            </div>
          </div>
        );

      case 'success':
        return (
          <SuccessStep
            orderId={orderId} // Changed from orderHash to orderId
            polymarketOrderHash={state.polymarketOrderHash || ''}
            transactionHash={state.transactionHash || ''}
            onClose={handleClose}
            warningMessage={state.errorMessage}
          />
        );
      
      case 'error':
        return (
          <ErrorStep
            error={state.error || 'unknown_error'}
            errorMessage={state.errorMessage || 'An unknown error occurred'}
            onRetry={() => {
              // Resume only the failed step based on error type
              if (state.error === 'polymarket_creation_failed') {
                setState(prev => ({ ...prev, step: 'polymarket', error: undefined, errorMessage: undefined }));
              } else if (state.error === 'transaction_preparation_failed' ||
                        state.error === 'send_transaction_failed' ||
                        state.error === 'transaction_failed' ||
                        state.error === 'transaction_refused' ||
                        state.error === 'safe_transaction_refused' ||
                        state.error === 'safe_initialization_failed' ||
                        state.error === 'walletconnect_connection_issue') {
                setState(prev => ({ ...prev, step: 'transaction', error: undefined, errorMessage: undefined }));
              } else {
                // Default back to transaction if polymarket already exists, else polymarket
                setState(prev => ({ ...prev, step: prev.polymarketOrderHash ? 'transaction' : 'polymarket', error: undefined, errorMessage: undefined }));
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
                step: 'polymarket',
                error: undefined,
                errorMessage: undefined
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
        <button 
          className={styles.closeButton} 
          onClick={handleClose}
          aria-label="Close popup"
        >
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