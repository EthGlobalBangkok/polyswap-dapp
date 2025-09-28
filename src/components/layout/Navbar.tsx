'use client';

import styles from './Navbar.module.css';
import {ConnectWallet} from '../ui/Wallet';

interface NavbarProps {
  onOrdersClick?: () => void;
  onLogoClick?: () => void;
}

const Navbar = ({ onOrdersClick, onLogoClick }: NavbarProps) => {
  const handleOrdersClick = () => {
    if (onOrdersClick) {
      onOrdersClick();
    }
  };

  const handleLogoClick = () => {
    if (onLogoClick) {
      onLogoClick();
    }
  };

  return (
    <nav className={styles.navbar}>
      <div className={`container ${styles.navContent}`}>
        {/* Logo */}
        <div className={styles.logo} onClick={handleLogoClick}>
          <span className={styles.logoIcon}>🔄</span>
          <span className={styles.logoText}>
            Poly<span className="text-gradient">Swap</span>
          </span>
        </div>

        {/* Navigation Items */}
        <div className={styles.navItems}>
          <button className={styles.ordersButton} onClick={handleOrdersClick}>
            <span>My Orders</span>
          </button>
          <ConnectWallet />
        </div>
      </div>
    </nav>
  );
};

export default Navbar; 