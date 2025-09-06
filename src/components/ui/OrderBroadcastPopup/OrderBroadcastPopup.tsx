'use client';

import React, { useState, useEffect } from 'react';
import { useSendTransaction, useWaitForTransactionReceipt } from 'wagmi';
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
  error?: string;
  errorMessage?: string;
}

const OrderBroadcastPopup: React.FC<OrderBroadcastPopupProps> = ({ 
  isOpen, 
  onClose, 
  orderId 
}) => {
  console.log('OrderBroadcastPopup rendered with:', { isOpen, orderId });
  
  const [state, setState] = useState<PopupState>({
    step: 'polymarket',
    polymarketOrderHash: undefined,
    transactionData: undefined,
    transactionHash: undefined,
    error: undefined,
    errorMessage: undefined
  });

  const { sendTransaction, isPending: isSending, data: transactionData } = useSendTransaction();
  const { isLoading: isWaiting, isSuccess, isError, error: txError } = useWaitForTransactionReceipt({
    hash: state.transactionHash as `0x${string}`,
  });

  // Handle transaction status changes
  useEffect(() => {
    if (isSuccess && state.step === 'transaction') {
      setState(prev => ({
        ...prev,
        step: 'success'
      }));
    } else if (isError && state.step === 'transaction') {
      setState(prev => ({
        ...prev,
        step: 'error',
        error: 'transaction_failed',
        errorMessage: txError?.message || 'Transaction failed'
      }));
    }
  }, [isSuccess, isError, txError, state.step]);

  // Handle transaction hash from wagmi
  useEffect(() => {
    if (transactionData && state.step === 'transaction') {
      setState(prev => ({
        ...prev,
        transactionHash: transactionData
      }));
    }
  }, [transactionData, state.step]);

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
    if (!state.transactionData) return;
    
    try {
      sendTransaction({
        to: state.transactionData.to as `0x${string}`,
        data: state.transactionData.data as `0x${string}`,
        value: BigInt(state.transactionData.value),
      });
    } catch (error) {
      setState(prev => ({
        ...prev,
        step: 'error',
        error: 'send_transaction_failed',
        errorMessage: error instanceof Error ? error.message : 'Failed to send transaction'
      }));
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
      error: undefined,
      errorMessage: undefined
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
            isSending={isSending}
            isWaiting={isWaiting}
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
              // Reset to polymarket step to retry the whole process
              setState({
                step: 'polymarket',
                error: undefined,
                errorMessage: undefined
              });
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