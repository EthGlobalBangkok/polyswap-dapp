"use client";

import Link from "next/link";
import styles from "./Navbar.module.css";
import { ConnectWallet } from "../ui/Wallet";

const Navbar = () => {
  return (
    <nav className={styles.navbar}>
      <div className={`container ${styles.navContent}`}>
        {/* Logo */}
        <Link href="/" className={styles.logo}>
          <span className={styles.logoIcon}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M7.5 21L3 16.5M3 16.5L7.5 12M3 16.5H16.5C18.1569 16.5 19.5 15.1569 19.5 13.5V12" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M16.5 3L21 7.5M21 7.5L16.5 12M21 7.5H7.5C5.84315 7.5 4.5 8.84315 4.5 10.5V12" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>
          <span className={styles.logoText}>
            Poly<span className="text-gradient">Swap</span>
          </span>
        </Link>

        {/* Navigation Items */}
        <div className={styles.navItems}>
          <Link href="/orders" className={styles.ordersButton}>
            <svg className={styles.ordersIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M9 5H7C5.89543 5 5 5.89543 5 7V19C5 20.1046 5.89543 21 7 21H17C18.1046 21 19 20.1046 19 19V7C19 5.89543 18.1046 5 17 5H15M9 5C9 6.10457 9.89543 7 11 7H13C14.1046 7 15 6.10457 15 5M9 5C9 3.89543 9.89543 3 11 3H13C14.1046 3 15 3.89543 15 5M12 12H15M12 16H15M9 12H9.01M9 16H9.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span>My Swaps</span>
          </Link>
          <ConnectWallet />
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
