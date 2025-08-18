'use client';

import styles from './OrdersView.module.css';

interface OrdersViewProps {
  onBack: () => void;
}

export default function OrdersView({ onBack }: OrdersViewProps) {
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <button onClick={onBack} className={styles.backButton}>
          ← Back to Markets
        </button>
        <h1 className={styles.title}>My Orders</h1>
        <p className={styles.subtitle}>
          Manage your conditional swap orders
        </p>
      </div>
      
      <div className={styles.content}>
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>📄</div>
          <h2 className={styles.emptyTitle}>No Orders Yet</h2>
          <p className={styles.emptyDescription}>
            You haven't created any conditional orders yet. 
            Start by selecting a market and creating your first order.
          </p>
        </div>
      </div>
    </div>
  );
}
