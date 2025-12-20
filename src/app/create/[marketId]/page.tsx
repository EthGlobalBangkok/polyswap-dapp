"use client";

import { use } from "react";
import Navbar from "../../../components/layout/Navbar";
import Footer from "../../../components/layout/Footer";
import CreateOrderView from "../../../components/ui/CreateOrderView";
import styles from "../../page.module.css";
import { WagmiProvider } from "wagmi";
import { config } from "../../../wagmi/config";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

export default function CreateOrderPage({ params }: { params: Promise<{ marketId: string }> }) {
  const queryClient = new QueryClient();
  const { marketId } = use(params);

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <div className={styles.page}>
          <Navbar />

          <main className={styles.main}>
            <div className="container">
              <CreateOrderView marketId={marketId} onBack={() => {}} />
            </div>
          </main>

          <Footer />
        </div>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
