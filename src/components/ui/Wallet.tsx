'use client';

import * as React from 'react';
import { useConnect, useAccount, useDisconnect, useEnsAvatar, useEnsName } from 'wagmi';
import styles from './Wallet.module.css';

// Utility function to truncate address
const truncateAddress = (address: string) => {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

// Hook to check if component is mounted (prevents hydration issues)
function useMounted() {
  const [mounted, setMounted] = React.useState(false);
  
  React.useEffect(() => {
    setMounted(true);
  }, []);
  
  return mounted;
}

// Wallet options list component
export function WalletOptions() {
  const mounted = useMounted();
  const { connectors, connect, isPending } = useConnect();

  // Check if we're in Safe Apps environment
  const isSafeApp = typeof window !== 'undefined' && window.parent !== window;
  
  // Debug: log available connectors
  React.useEffect(() => {
    if (mounted) {
      console.log('Available connectors:', connectors.map(c => ({ name: c.name, id: c.id })));
      console.log('Is Safe App environment:', isSafeApp);
    }
  }, [connectors, isSafeApp, mounted]);

  // Don't render until mounted to prevent hydration mismatch
  if (!mounted) {
    return (
      <button className={styles.connectButton} disabled>
        <span>Connect Wallet</span>
      </button>
    );
  }
  
  // Use Safe connector if in Safe Apps environment, otherwise use WalletConnect
  const primaryConnector = isSafeApp 
    ? connectors.find(connector => connector.name === 'Safe') 
    : connectors.find(connector => connector.name === 'WalletConnect') || connectors[0];

  if (!primaryConnector) {
    return (
      <button className={styles.connectButton} disabled>
        <div className={styles.loading}>
          <div className={styles.spinner}></div>
          <span>Loading...</span>
        </div>
      </button>
    );
  }

  // Show connector selection if we have multiple options
  if (connectors.length > 1 && !isSafeApp) {
    return (
      <div className={styles.walletOptions}>
        {connectors.map((connector) => (
          <button
            key={connector.id}
            className={styles.connectButton}
            onClick={() => connect({ connector })}
            disabled={isPending}
          >
            {isPending ? (
              <>
                <div className={styles.spinner}></div>
                <span>Connecting...</span>
              </>
            ) : (
              <span>
                {connector.name === 'WalletConnect' ? 'Connect with Safe Mobile' : connector.name}
              </span>
            )}
          </button>
        ))}
      </div>
    );
  }

  return (
    <button 
      className={styles.connectButton}
      onClick={() => connect({ connector: primaryConnector })}
      disabled={isPending}
    >
      {isPending ? (
        <>
          <div className={styles.spinner}></div>
          <span>Connecting...</span>
        </>
      ) : (
        <span>
          {isSafeApp ? 'Connect Safe Wallet' : 'Connect Wallet'}
        </span>
      )}
    </button>
  );
}

// Account display component
export function Account() {
  const mounted = useMounted();
  const { address } = useAccount();
  const { disconnect } = useDisconnect();
  const { data: ensName } = useEnsName({ address });
  const { data: ensAvatar } = useEnsAvatar({ name: ensName! });

  // Don't render until mounted to prevent hydration mismatch
  if (!mounted || !address) return null;

  return (
    <div className={styles.accountContainer}>
      <div className={styles.statusIndicator}></div>
      
      {ensAvatar && (
        <img 
          className={styles.avatar} 
          alt="ENS Avatar" 
          src={ensAvatar} 
        />
      )}
      
      <div className={styles.accountInfo}>
        {ensName && (
          <div className={styles.ensName}>{ensName}</div>
        )}
        <div className={styles.address}>
          {truncateAddress(address)}
        </div>
      </div>
      
      <button 
        className={styles.disconnectButton} 
        onClick={() => disconnect()}
        title="Disconnect wallet"
      >
        ✕
      </button>
    </div>
  );
}

// Main wallet component
export function ConnectWallet() {
  const { isConnected, isConnecting } = useAccount();

  if (isConnected) {
    return <Account />;
  }

  if (isConnecting) {
    return (
      <button className={styles.connectButton} disabled>
        <div className={styles.spinner}></div>
        <span>Connecting...</span>
      </button>
    );
  }

  return <WalletOptions />;
}