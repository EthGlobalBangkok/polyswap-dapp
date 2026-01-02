"use client";

import Navbar from "../components/layout/Navbar";
import Footer from "../components/layout/Footer";
import MarketGrid from "../components/ui/MarketGrid";
import BetaWarningPopup from "../components/ui/BetaWarningPopup";
import styles from "./page.module.css";

import { WagmiProvider } from "wagmi";
import { config } from "../wagmi/config";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

export default function Home() {
  const queryClient = new QueryClient();

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <div className={styles.page}>
          <BetaWarningPopup />
          <Navbar />

          <main className={styles.main}>
            <div className="container">
              <MarketGrid />
            </div>
          </main>

          <Footer />
        </div>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
