'use client';

import Link from 'next/link';
import styles from './Navbar.module.css';
import { ConnectWallet } from '../ui/Wallet';

const Navbar = () => {
  return (
    <nav className={styles.navbar}>
      <div className={`container ${styles.navContent}`}>
        {/* Logo */}
        <Link href="/" className={styles.logo}>
          <span className={styles.logoIcon}>🔄</span>
          <span className={styles.logoText}>
            Poly<span className="text-gradient">Swap</span>
          </span>
        </Link>

        {/* Navigation Items */}
        <div className={styles.navItems}>
          <Link href="/orders" className={styles.ordersButton}>
            <span>My Orders</span>
          </Link>
          <ConnectWallet />
        </div>
      </div>
    </nav>
  );
};

export default Navbar; 