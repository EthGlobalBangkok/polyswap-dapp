"use client";

import { use } from "react";
import dynamic from "next/dynamic";
import Navbar from "../../../components/layout/Navbar";
import Footer from "../../../components/layout/Footer";
import CreateOrderView from "../../../components/ui/CreateOrderView";
import styles from "../../page.module.css";

const Web3Provider = dynamic(
  () => import("../../../components/providers/Web3Provider"),
  { ssr: false }
);

export default function CreateOrderPage({ params }: { params: Promise<{ marketId: string }> }) {
  const { marketId } = use(params);

  return (
    <Web3Provider>
      <div className={styles.page}>
        <Navbar />

        <main className={styles.main}>
          <div className="container">
            <CreateOrderView marketId={marketId} onBack={() => {}} />
          </div>
        </main>

        <Footer />
      </div>
    </Web3Provider>
  );
}
