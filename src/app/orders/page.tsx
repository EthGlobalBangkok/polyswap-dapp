'use client';

import Navbar from '../../components/layout/Navbar';
import Footer from '../../components/layout/Footer';
import styles from './page.module.css';

export default function OrdersPage() {
  return (
    <div className={styles.page}>
      <Navbar />
      
      <main className={styles.main}>
        <div className="container">
          <div className={styles.content}>
            <h1 className={styles.title}>My Orders</h1>
            <p className={styles.subtitle}>
              View and manage your conditional swap orders
            </p>
            
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>📋</div>
              <h2 className={styles.emptyTitle}>No Orders Yet</h2>
              <p className={styles.emptyDescription}>
                You haven't created any conditional swap orders yet. 
                Browse markets and create your first automated swap!
              </p>
            </div>
          </div>
        </div>
      </main>
      
      <Footer />
    </div>
  );
} 