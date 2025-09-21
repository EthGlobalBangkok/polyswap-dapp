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
        const res = await fetch(`/api/polyswap/orders/id/${orderId}`);
        const json = await res.json();
        if (!res.ok || !json.success) return;
        if (abort) return;
        const order = json.data as { status: string; polymarket_order_hash?: string | null; transaction_hash?: string | null };
        // If Polymarket order already created, skip to transaction step
        if (order.polymarket_order_hash) {
          setState(prev => ({
            ...prev,
            step: 'transaction',
            polymarketOrderHash: order.polymarket_order_hash || undefined
          }));
        }
      } catch {}
    };
    primeFromDb();
    return () => { abort = true; };
  }, [isOpen, orderId]);


  if (!isOpen) {
    console.log('Popup is not open, returning null');
    return null;
  }

  console.log('Rendering popup content');

  const handleCreatePolymarketOrder = async (polymarketOrderHash: string) => {
    setState({
      step: 'transaction',
      polymarketOrderHash,
      error: undefined,
      errorMessage: undefined
    });
  };

  const handleGetTransactionData = async (transactionData: any) => {
    // Initialize transaction progress for batch transactions
    const isBatch = transactionData.isBatch || (Array.isArray(transactionData.transactions) && transactionData.transactions.length > 1);
    const totalTxs = isBatch ? transactionData.transactions.length : 1;

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
    if (!state.transactionData || !state.isSafeInitialized) return;
    
    setIsSending(true);
    
    try {
      const isSafeApp = connector?.name === 'Safe';
      const isWalletConnect = connector?.name === 'WalletConnect';
      
      let transactionHash: string;
      
      // Check if this is a batch transaction
      const isBatchTransaction = state.transactionData.isBatch && state.transactionData.transactions;
      
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
        // Use Safe Protocol Kit for WalletConnect - this supports proper batch transactions
        setIsWaiting(true);

        let result;
        try {
          // Initialize Safe service with WalletConnect provider if not already initialized
          if (!safeService.isInitialized()) {
            const provider = new ethers.BrowserProvider(publicClient as any);
            const signer = new ethers.BrowserProvider(client as any).getSigner();
            await safeService.initialize(address, provider, await signer);
          }

          if (isBatchTransaction) {
            // Use Safe Protocol Kit for batch transactions - this works with WalletConnect!
            console.log('Creating Safe batch transaction via Protocol Kit:', state.transactionData.transactions);

            // Initialize progress for Safe Protocol Kit batch
            const totalTxs = state.transactionData.transactions.length;
            setState(prev => ({
              ...prev,
              transactionProgress: {
                current: 0,
                total: totalTxs,
                currentTxType: 'Batch Transaction'
              }
            }));

            const safeResult = await safeService.createBatchTransaction(
              state.transactionData.transactions.map((tx: any) => ({
                to: tx.to,
                data: tx.data,
                value: tx.value
              }))
            );

            // Convert Safe result to expected format
            if (safeResult.executed && safeResult.transactionHash) {
              // Transaction fully executed - update progress to completed
              setState(prev => ({
                ...prev,
                transactionProgress: {
                  current: totalTxs,
                  total: totalTxs,
                  currentTxType: 'Batch Transaction Completed'
                }
              }));

              result = {
                transactionHash: safeResult.transactionHash,
                success: true
              };
            } else if (safeResult.safeTxHash) {
              // Transaction created and signed but needs more signatures - this is still a success for the signing process
              console.log('Safe batch transaction created and signed:', safeResult.safeTxHash);
              setState(prev => ({
                ...prev,
                step: 'error',
                error: 'transaction_needs_signatures',
                errorMessage: 'Batch transaction created and signed. Additional signatures required from other Safe owners.'
              }));
              return;
            } else {
              // Something went wrong
              throw new Error('Safe batch transaction failed - no transaction hash or safe transaction hash returned');
            }
          } else {
            // Use Safe Protocol Kit for single transactions
            console.log('Creating Safe transaction via Protocol Kit...');

            const safeResult = await safeService.createSafeTransaction({
              to: state.transactionData.to,
              data: state.transactionData.data,
              value: state.transactionData.value
            });

            if (safeResult.executed && safeResult.transactionHash) {
              // Transaction fully executed
              result = {
                transactionHash: safeResult.transactionHash,
                success: true
              };
            } else if (safeResult.safeTxHash) {
              // Transaction created and signed but needs more signatures - this is still a success for the signing process
              console.log('Safe transaction created and signed:', safeResult.safeTxHash);
              setState(prev => ({
                ...prev,
                step: 'error',
                error: 'transaction_needs_signatures',
                errorMessage: 'Transaction created and signed. Additional signatures required from other Safe owners.'
              }));
              return;
            } else {
              // Something went wrong
              throw new Error('Safe transaction failed - no transaction hash or safe transaction hash returned');
            }
          }
        } catch (protocolKitError) {
          console.log('Safe Protocol Kit failed, trying WalletConnect fallback:', protocolKitError);

          // Fallback to WalletConnect service for basic transactions
          try {
            if (isBatchTransaction) {
              // For batch, fall back to sequential
              // Note: sendTransactionsSequentially now throws an error if any transaction fails
              const sequentialResults = await walletConnectSafeService.sendTransactionsSequentially({
                transactions: state.transactionData.transactions
              }, (current, total, txType) => {
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

              // If we get here, all transactions succeeded
              const lastResult = sequentialResults[sequentialResults.length - 1];
              result = lastResult;
            } else {
              // For single transaction, try WalletConnect service
              result = await walletConnectSafeService.sendTransaction({
                to: state.transactionData.to,
                data: state.transactionData.data,
                value: state.transactionData.value
              });
            }
          } catch (fallbackError) {
            console.error('Both Safe Protocol Kit and WalletConnect service failed:', fallbackError);
            // Prioritize the WalletConnect error (fallbackError) over the Safe SDK error (protocolKitError)
            // because the WalletConnect error is more likely to be user-actionable (e.g., user rejection)
            throw fallbackError;
          }
        }

        if (result && result.success) {
          transactionHash = result.transactionHash;
          console.log('Transaction successful:', transactionHash);
          setState(prev => ({
            ...prev,
            transactionHash: result.transactionHash
          }));
        } else {
          console.error('Transaction result indicates failure:', result);
          throw new Error(result?.error || 'Transaction failed');
        }

        setIsWaiting(false);
      } else {
        throw new Error('Unsupported wallet connection type');
      }

      // Transaction was executed, update the database
      if (!transactionHash) {
        console.error('No transaction hash available for database update');
        setState(prev => ({
          ...prev,
          step: 'error',
          error: 'transaction_failed',
          errorMessage: 'Transaction completed but no transaction hash was returned'
        }));
        return;
      }

      try {
        console.log('Updating order in database with transaction hash:', transactionHash);
        const updateResult = await apiService.updateOrderTransactionHashById(orderId, transactionHash);

        if (updateResult.success) {
          console.log('Order successfully updated in database, setting status to live');
          setState(prev => ({ ...prev, step: 'success' }));
        } else {
          console.error('Database update failed:', updateResult);
          // Still mark as success since the transaction was executed
          setState(prev => ({
            ...prev,
            step: 'success',
            errorMessage: 'Transaction successful but database update failed. Order may not show as live immediately.'
          }));
        }
      } catch (dbError) {
        console.error('Failed to update order in database:', dbError);
        // Still mark as success since the transaction was executed
        setState(prev => ({
          ...prev,
          step: 'success',
          errorMessage: 'Transaction successful but database update failed. Order may not show as live immediately.'
        }));
      }

    } catch (error) {
      console.error('Transaction error:', error);

      // Determine error type based on the error message
      let errorType = 'send_transaction_failed';
      let errorMessage = error instanceof Error ? error.message : 'Failed to send transaction';

      // Enhanced error detection for user rejection
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

        // Safe SDK specific error patterns
        else if (errorMsg.includes('user denied transaction signature') ||
                 errorMsg.includes('transaction was not signed') ||
                 errorMsg.includes('signature rejected')) {
          errorType = 'safe_transaction_refused';
          errorMessage = 'Transaction signature was rejected in Safe wallet';
        }
      }

      // Check for error codes that indicate user rejection
      if ((error as any)?.code === 4001 || (error as any)?.code === 'ACTION_REJECTED') {
        errorType = 'transaction_refused';
        errorMessage = 'Transaction signing was refused by user';
      }

      setState(prev => ({
        ...prev,
        step: 'error',
        error: errorType,
        errorMessage: errorMessage
      }));
    } finally {
      console.log('Transaction process complete, clearing loading states');
      setIsSending(false);
      setIsWaiting(false);
    }
  };

  const handleClose = () => {
    onClose();
    // Reset state when closing
    setState({
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