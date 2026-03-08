"use client";

import dynamic from "next/dynamic";
import Navbar from "../../components/layout/Navbar";
import Footer from "../../components/layout/Footer";
import OrdersView from "../../components/ui/OrdersView";
import styles from "../page.module.css";

const Web3Provider = dynamic(
  () => import("../../components/providers/Web3Provider"),
  { ssr: false }
);

export default function OrdersPage() {
  return (
    <Web3Provider>
      <div className={styles.page}>
        <Navbar />

        <main className={styles.main}>
          <div className="container">
            <OrdersView onBack={() => {}} />
          </div>
        </main>

        <Footer />
      </div>
    </Web3Provider>
  );
}
