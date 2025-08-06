'use client';

import { useRouter } from 'next/navigation';
import styles from './Navbar.module.css';
import WalletButton from '../ui/WalletButton';

const Navbar = () => {
  const router = useRouter();

  const handleOrdersClick = () => {
    router.push('/orders');
  };

  const handleLogoClick = () => {
    router.push('/');
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
          <WalletButton />
        </div>
      </div>
    </nav>
  );
};

export default Navbar; 