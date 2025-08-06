'use client';

import { useState } from 'react';
import styles from './WalletButton.module.css';

const WalletButton = () => {
  // Mock state - will be replaced with actual wallet connection logic later
  const [isConnected, setIsConnected] = useState(false);
  const mockAddress = '0x1234567890123456789012345678901234567890';

  const truncateAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const handleClick = () => {
    // Mock toggle - will be replaced with wallet connection logic
    setIsConnected(!isConnected);
  };

  return (
    <button 
      className={`${styles.walletButton} ${isConnected ? styles.connected : ''}`}
      onClick={handleClick}
    >
      {isConnected ? (
        <div className={styles.addressContainer}>
          <div className={styles.statusDot}></div>
          <span className={styles.address}>
            {truncateAddress(mockAddress)}
          </span>
        </div>
      ) : (
        <span>Connect Wallet</span>
      )}
    </button>
  );
};

export default WalletButton; 