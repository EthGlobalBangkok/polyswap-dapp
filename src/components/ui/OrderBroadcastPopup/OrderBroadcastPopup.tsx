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
      if (!address || !publicClient || state.isSafeInitialized) return;
      
      const isSafeApp = connector?.name === 'Safe';
      const isWalletConnect = connector?.name === 'WalletConnect';
      
      console.log('Initializing for connector:', connector?.name, { isSafeApp, isWalletConnect });
      
      if (isSafeApp) {
        // Running inside Safe App - use Safe SDK
        try {
          const provider = new ethers.BrowserProvider(publicClient as any);
          await safeService.initialize(address, provider);
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
        // WalletConnect - check if connected wallet is a Safe
        try {
          const provider = new ethers.BrowserProvider(publicClient as any);
          const signer = new ethers.BrowserProvider(client as any).getSigner();
          
          // Initialize WalletConnect Safe service
          walletConnectSafeService.initialize(await signer, provider);
          
          // Check if the connected wallet is a Safe wallet
          const safeInfo = await walletConnectSafeService.getSafeInfo(address);
          
          if (!safeInfo.isSafe) {
            setState(prev => ({
              ...prev,
              step: 'error',
              error: 'not_safe_wallet',
              errorMessage: 'Please connect using a Safe wallet. Only Safe wallets are supported for conditional orders.'
            }));
            return;
          }
          
          setState(prev => ({ 
            ...prev, 
            isSafeInitialized: true,
            isSafeWallet: true,
            safeInfo: safeInfo 
          }));
        } catch (error) {
          console.error('Failed to initialize WalletConnect Safe service:', error);
          setState(prev => ({
            ...prev,
            step: 'error',
            error: 'safe_initialization_failed',
            errorMessage: error instanceof Error ? error.message : 'Failed to initialize Safe wallet connection'
          }));
        }
      } else {
        setState(prev => ({
          ...prev,
          step: 'error',
          error: 'unsupported_wallet',
          errorMessage: 'Please connect using a Safe wallet via WalletConnect or Safe Apps.'
        }));
      }
    };

    initializeSafe();
  }, [address, publicClient, connector, client, state.isSafeInitialized]);

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
    setState(prev => ({
      ...prev,
      transactionData,
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
      
      if (isSafeApp) {
        // Use Safe SDK for Safe Apps
        const result = await safeService.createSafeTransaction({
          to: state.transactionData.to,
          data: state.transactionData.data,
          value: state.transactionData.value
        });

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
        // Use WalletConnect Safe service
        setIsWaiting(true);
        
        let result;
        try {
          // Try the raw method first (more compatible with Safe)
          console.log('Attempting Safe transaction via WalletConnect...');
          result = await walletConnectSafeService.sendTransactionRaw({
            to: state.transactionData.to,
            data: state.transactionData.data,
            value: state.transactionData.value
          });
        } catch (rawError) {
          console.log('Raw method failed, trying standard method:', rawError);
          
          // Check if it's a WalletConnect connection issue
          if (rawError instanceof Error && 
              (rawError.message.includes('WalletConnect connection') || 
               rawError.message.includes('publish payload') ||
               rawError.message.includes('Failed to publish'))) {
            
            setState(prev => ({
              ...prev,
              step: 'error',
              error: 'walletconnect_connection_issue',
              errorMessage: 'WalletConnect connection issue. Please disconnect and reconnect your Safe wallet, then try again.'
            }));
            return;
          }
          
          // Fallback to standard transaction method
          try {
            result = await walletConnectSafeService.sendTransaction({
              to: state.transactionData.to,
              data: state.transactionData.data,
              value: state.transactionData.value
            });
          } catch (standardError) {
            console.error('Both Safe service methods failed, trying Wagmi direct transaction:', standardError);
            
            // Final fallback: use Wagmi's direct transaction
            try {
              console.log('Using Wagmi direct transaction as final fallback');
              wagmiSendTransaction({
                to: state.transactionData.to as `0x${string}`,
                data: state.transactionData.data as `0x${string}`,
                value: BigInt(state.transactionData.value || '0'),
              });
              
              // This is async, we'll handle the result in the useEffect
              return;
            } catch (wagmiError) {
              console.error('All transaction methods failed including Wagmi:', wagmiError);
              throw new Error('All transaction methods failed. Please check your connection and try again.');
            }
          }
        }

        if (result.success) {
          transactionHash = result.transactionHash;
          setState(prev => ({
            ...prev,
            transactionHash: result.transactionHash
          }));
        } else {
          throw new Error('Transaction failed');
        }
        
        setIsWaiting(false);
      } else {
        throw new Error('Unsupported wallet connection type');
      }

      // Transaction was executed, update the database
      try {
        await apiService.updateOrderTransactionHashById(orderId, transactionHash);
        setState(prev => ({ ...prev, step: 'success' }));
      } catch (dbError) {
        console.error('Failed to update order in database:', dbError);
        // Still mark as success since the transaction was executed
        setState(prev => ({ ...prev, step: 'success' }));
      }

    } catch (error) {
      setState(prev => ({
        ...prev,
        step: 'error',
        error: 'send_transaction_failed',
        errorMessage: error instanceof Error ? error.message : 'Failed to send transaction'
      }));
    } finally {
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
              // Resume only the failed step
              if (state.error === 'polymarket_creation_failed') {
                setState(prev => ({ ...prev, step: 'polymarket', error: undefined, errorMessage: undefined }));
              } else if (state.error === 'transaction_preparation_failed' || state.error === 'send_transaction_failed' || state.error === 'transaction_failed') {
                setState(prev => ({ ...prev, step: 'transaction', error: undefined, errorMessage: undefined }));
              } else {
                // default back to transaction if polymarket already exists, else polymarket
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