'use client';

import React, { useState } from 'react';
import styles from './OrderBroadcastPopup.module.css';

interface PolymarketOrderStepProps {
  orderId: number; // Changed from orderHash to orderId
  onCreateSuccess: (polymarketOrderHash: string) => void;
  onError: (errorMessage: string) => void;
}

export const PolymarketOrderStep: React.FC<PolymarketOrderStepProps> = ({ 
  orderId, // Changed from orderHash to orderId
  onCreateSuccess, 
  onError 
}) => {
  const [isLoading, setIsLoading] = useState(false);

  const handleCreatePolymarketOrder = async () => {
    setIsLoading(true);
    
    try {
      const response = await fetch('/api/polyswap/orders/polymarket', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ orderId }), // Changed from orderHash to orderId
      });

      const result = await response.json();
      
      if (result.success) {
        onCreateSuccess(result.data.polymarketOrderHash);
      } else {
        // More detailed error handling
        const errorMessage = result.message || result.error || 'Failed to create Polymarket order';
        console.error('Polymarket order creation failed:', result);
        onError(`Polymarket order creation failed: ${errorMessage}`);
      }
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Failed to create Polymarket order');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.stepContent}>
      <h2 className={styles.stepTitle}>Create Polymarket Order</h2>
      <p className={styles.stepDescription}>
        First, we need to create your Polymarket order which will be linked to your PolySwap order.
      </p>
      
      <div className={styles.infoBox}>
        <h3>What happens next:</h3>
        <ul>
          <li>We'll create a matching order on Polymarket</li>
          <li>The Polymarket order hash will be linked to your PolySwap order</li>
          <li>You'll then sign a transaction to broadcast your PolySwap order on-chain</li>
        </ul>
      </div>
      
      <button
        className={styles.primaryButton}
        onClick={handleCreatePolymarketOrder}
        disabled={isLoading}
      >
        {isLoading ? (
          <>
            <span className={styles.spinner}></span>
            Creating Polymarket Order...
          </>
        ) : (
          'Create Polymarket Order'
        )}
      </button>
    </div>
  );
};