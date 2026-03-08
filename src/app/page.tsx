"use client";

import dynamic from "next/dynamic";
import Navbar from "../components/layout/Navbar";
import Footer from "../components/layout/Footer";
import MarketGrid from "../components/ui/MarketGrid";
import BetaWarningPopup from "../components/ui/BetaWarningPopup";
import styles from "./page.module.css";

const Web3Provider = dynamic(
  () => import("../components/providers/Web3Provider"),
  { ssr: false }
);

export default function Home() {
  return (
    <Web3Provider>
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
    </Web3Provider>
  );
}
