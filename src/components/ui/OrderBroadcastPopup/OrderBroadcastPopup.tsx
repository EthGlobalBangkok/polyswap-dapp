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

export type Step = 'polymarket' | 'transaction' | 'success' | 'error';

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
        // Use WalletConnect Safe service directly - optimized for Safe + WalletConnect
        console.log('🎯 [POPUP] Using WalletConnect Safe service for transaction signing');
        console.log('🔍 [POPUP] WalletConnect service initialized:', walletConnectSafeService.isInitialized());

        let result;
        try {
          if (isBatchTransaction) {
            console.log('📦 [POPUP] Starting BATCH transaction flow');
            console.log('🔍 [POPUP] Batch transactions to send:', state.transactionData.transactions.length);
            console.log('📋 [POPUP] Batch transaction details:', JSON.stringify(state.transactionData.transactions, null, 2));

            // Use sequential transaction signing for Safe + WalletConnect
            console.log('🔄 [POPUP] Calling sendTransactionsSequentially...');
            const sequentialResults = await walletConnectSafeService.sendTransactionsSequentially({
              transactions: state.transactionData.transactions
            }, (current, total, txType) => {
              console.log(`📊 [POPUP] Progress update: ${current}/${total} - ${txType}`);
              // Update progress in real-time
              setState(prev => ({
                ...prev,
                transactionProgress: {
                  current,
                  total,
                  currentTxType: txType
                }
              }));
            });

            console.log('✅ [POPUP] Sequential transactions completed:', sequentialResults.length);
            console.log('📋 [POPUP] Sequential results:', JSON.stringify(sequentialResults, null, 2));

            // All transactions signed successfully
            const lastResult = sequentialResults[sequentialResults.length - 1];
            result = lastResult;

            console.log('🎉 [POPUP] All batch transactions signed successfully');
          } else {
            console.log('🔄 [POPUP] Starting SINGLE transaction flow');
            console.log('📋 [POPUP] Single transaction details:', {
              to: state.transactionData.to,
              data: state.transactionData.data,
              value: state.transactionData.value
            });

            // Single transaction signing
            console.log('🔄 [POPUP] Calling sendTransaction...');
            result = await walletConnectSafeService.sendTransaction({
              to: state.transactionData.to,
              data: state.transactionData.data,
              value: state.transactionData.value
            });

            console.log('✅ [POPUP] Single transaction completed');
          }

          console.log('🔍 [POPUP] Final result received:', JSON.stringify(result, null, 2));

          if (result && result.success) {
            transactionHash = result.transactionHash;
            console.log('🎉 [POPUP] Transaction(s) signed successfully, hash:', transactionHash);

            console.log('🔄 [POPUP] Updating state with transaction hash...');
            setState(prev => ({
              ...prev,
              transactionHash: result.transactionHash
            }));
            console.log('✅ [POPUP] State updated with transaction hash');
          } else {
            console.error('❌ [POPUP] Transaction result indicates failure:', result);
            throw new Error(result?.error || 'Transaction signing failed');
          }
        } catch (walletConnectError) {
          console.error('💥 [POPUP] WalletConnect Safe service failed:', walletConnectError);
          throw walletConnectError;
        }
      } else {
        throw new Error('Unsupported wallet connection type');
      }

      // Transaction was executed, update the database
      console.log('🔍 [POPUP] Post-transaction processing...');
      console.log('🔍 [POPUP] Transaction hash available:', !!transactionHash);
      console.log('🔍 [POPUP] Transaction hash value:', transactionHash);

      if (!transactionHash) {
        console.error('❌ [POPUP] No transaction hash available for database update');
        setState(prev => ({
          ...prev,
          step: 'error',
          error: 'transaction_failed',
          errorMessage: 'Transaction completed but no transaction hash was returned'
        }));
        return;
      }

      try {
        console.log('🔄 [POPUP] Starting database update process...');
        console.log('🔍 [POPUP] Order ID:', orderId);
        console.log('🔍 [POPUP] Transaction hash for DB:', transactionHash);

        let updateResult = await apiService.updateOrderTransactionHashById(orderId, transactionHash);
        console.log('📋 [POPUP] First database update result:', JSON.stringify(updateResult, null, 2));

        // Retry once after 2 seconds if the first attempt fails (node latency issue)
        if (!updateResult.success) {
          console.log('⚠️ [POPUP] First database update attempt failed, retrying in 2 seconds...');
          await new Promise(resolve => setTimeout(resolve, 2000));
          console.log('🔄 [POPUP] Retrying database update...');
          updateResult = await apiService.updateOrderTransactionHashById(orderId, transactionHash);
          console.log('📋 [POPUP] Retry database update result:', JSON.stringify(updateResult, null, 2));
        }

        if (updateResult.success) {
          console.log('✅ [POPUP] Order successfully updated in database');
          console.log('🔄 [POPUP] Setting state to success...');
          setState(prev => ({ ...prev, step: 'success' }));
          console.log('✅ [POPUP] State set to success');
        } else {
          console.error('❌ [POPUP] Database update failed after retry:', updateResult);
          // Still mark as success since the transaction was executed
          console.log('🔄 [POPUP] Setting state to success with warning message...');
          setState(prev => ({
            ...prev,
            step: 'success',
            errorMessage: 'Transaction successful but database update failed after retry. Order may not show as live immediately.'
          }));
          console.log('✅ [POPUP] State set to success with warning');
        }
      } catch (dbError) {
        console.error('💥 [POPUP] Database update exception:', dbError);
        // Still mark as success since the transaction was executed
        console.log('🔄 [POPUP] Setting state to success despite DB error...');
        setState(prev => ({
          ...prev,
          step: 'success',
          errorMessage: 'Transaction successful but database update failed. Order may not show as live immediately.'
        }));
        console.log('✅ [POPUP] State set to success despite DB error');
      }

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
      
      case 'success':
        return (
          <SuccessStep
            orderId={orderId} // Changed from orderHash to orderId
            polymarketOrderHash={state.polymarketOrderHash || ''}
            transactionHash={state.transactionHash || ''}
            onClose={handleClose}
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