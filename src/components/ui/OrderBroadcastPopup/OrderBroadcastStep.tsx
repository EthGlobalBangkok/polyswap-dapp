'use client';

import React from 'react';
import styles from './OrderBroadcastPopup.module.css';

interface OrderBroadcastStepProps {
  currentStep: 'polymarket' | 'transaction' | 'success' | 'error';
  polymarketOrderHash?: string;
  transactionHash?: string;
}

export const OrderBroadcastStep: React.FC<OrderBroadcastStepProps> = ({ 
  currentStep, 
  polymarketOrderHash,
  transactionHash
}) => {
  const steps = [
    { id: 'polymarket', label: 'Create Polymarket Order', number: 1 },
    { id: 'transaction', label: 'Sign Transaction', number: 2 },
    { id: 'success', label: 'Complete', number: 3 }
  ];

  const getStepStatus = (stepId: string) => {
    if (stepId === currentStep) return 'active';
    if (stepId === 'polymarket' && currentStep !== 'polymarket') return 'completed';
    if (stepId === 'transaction' && (currentStep === 'success' || currentStep === 'transaction')) return 'completed';
    return 'pending';
  };

  return (
    <div className={styles.stepIndicator}>
      <div className={styles.stepLine}></div>
      
      {steps.map((step) => {
        const status = getStepStatus(step.id);
        const isCompleted = status === 'completed';
        const isActive = status === 'active';
        
        return (
          <div key={step.id} className={styles.stepItem}>
            <div className={`${styles.stepNumber} ${isCompleted ? styles.completed : ''} ${isActive ? styles.active : ''}`}>
              {isCompleted ? '✓' : step.number}
            </div>
            <div className={`${styles.stepLabel} ${isActive ? styles.active : ''}`}>
              {step.label}
            </div>
          </div>
        );
      })}
    </div>
  );
};