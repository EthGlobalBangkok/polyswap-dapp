"use client";

import { useRef } from "react";
import dynamic from "next/dynamic";
import Navbar from "../components/layout/Navbar";
import Footer from "../components/layout/Footer";
import Hero from "../components/ui/Hero";
import MarketGrid from "../components/ui/MarketGrid";
import BetaWarningPopup from "../components/ui/BetaWarningPopup";
import styles from "./page.module.css";

const Web3Provider = dynamic(
  () => import("../components/providers/Web3Provider"),
  { ssr: false }
);

export default function Home() {
  const marketsRef = useRef<HTMLDivElement>(null);

  const scrollToMarkets = () => {
    marketsRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <Web3Provider>
      <div className={styles.page}>
        <BetaWarningPopup />
        <Navbar />

        <main className={styles.main}>
          <div className="container">
            <Hero onExploreClick={scrollToMarkets} />
            
            <div ref={marketsRef}>
              <MarketGrid />
            </div>
          </div>
        </main>

        <Footer />
      </div>
    </Web3Provider>
  );
}
