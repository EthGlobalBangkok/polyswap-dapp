'use client';

import React from 'react';
import styles from './OrderBroadcastPopup.module.css';

interface ErrorStepProps {
  error: string;
  errorMessage: string;
  onRetry: () => void;
  onClose: () => void;
}

export const ErrorStep: React.FC<ErrorStepProps> = ({ 
  error, 
  errorMessage, 
  onRetry, 
  onClose 
}) => {
  return (
    <div className={styles.stepContent}>
      <div className={styles.errorIcon}>⚠</div>
      <h2 className={styles.stepTitle}>Something Went Wrong</h2>
      <p className={styles.stepDescription}>
        {errorMessage}
      </p>
      
      <div className={styles.infoBox}>
        <h3>Error Details:</h3>
        <div className={styles.transactionDetails}>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Error Code:</span>
            <span className={styles.detailValue}>{error}</span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Message:</span>
            <span className={styles.detailValue}>{errorMessage}</span>
          </div>
        </div>
      </div>
      
      <div className={styles.buttonGroup}>
        <button
          className={styles.secondaryButton}
          onClick={onRetry}
        >
          Try Again
        </button>
        <button
          className={styles.primaryButton}
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </div>
  );
};