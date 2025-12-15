'use client';

import Navbar from '../../components/layout/Navbar';
import Footer from '../../components/layout/Footer';
import OrdersView from '../../components/ui/OrdersView';
import styles from '../page.module.css';
import { WagmiProvider } from 'wagmi'
import { config } from '../../wagmi/config'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

export default function OrdersPage() {
  const queryClient = new QueryClient()

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <div className={styles.page}>
          <Navbar />
          
          <main className={styles.main}>
            <div className="container">
              <OrdersView onBack={() => {}} />
            </div>
          </main>
          
          <Footer />
        </div>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
