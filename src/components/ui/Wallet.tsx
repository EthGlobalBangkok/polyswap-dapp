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

// Enhanced Safe App environment detection
function useSafeAppDetection() {
  const [isSafeApp, setIsSafeApp] = React.useState<boolean | null>(null);
  const [isDetecting, setIsDetecting] = React.useState(true);

  React.useEffect(() => {
    const detectSafeApp = async () => {
      try {
        // Method 1: Check if we're in an iframe
        const inIframe = window.parent !== window && window.parent !== undefined;

        // Method 2: Check for Safe-specific properties
        const hasSafeGlobal = typeof window !== 'undefined' &&
                             'safe' in window &&
                             window.safe !== undefined;

        // Method 3: Check referrer for Safe domains
        const referrer = document.referrer.toLowerCase();
        const isSafeDomain = referrer.includes('safe.global') ||
                            referrer.includes('app.safe.global') ||
                            referrer.includes('gnosis-safe.io');

        // Method 4: Check for Safe Apps SDK initialization
        let hasSafeAppsSDK = false;
        try {
          // Check if Safe Apps SDK is available
          hasSafeAppsSDK = typeof window !== 'undefined' &&
                          window.parent !== window &&
                          window.parent.postMessage !== undefined;

          // Try to detect Safe-specific postMessage API
          if (hasSafeAppsSDK && inIframe) {
            // Send a test message to check if we get a Safe-specific response
            const testMessage = { method: 'getSafeInfo' };
            window.parent.postMessage(testMessage, '*');
          }
        } catch {
          // If we can't access parent, we're likely in a cross-origin iframe (which is expected for Safe Apps)
          hasSafeAppsSDK = inIframe;
        }

        // Determine if we're in a Safe App environment
        const isSafe = hasSafeGlobal || isSafeDomain || (inIframe && hasSafeAppsSDK);

        console.log('Safe App Detection:', {
          inIframe,
          hasSafeGlobal,
          isSafeDomain,
          hasSafeAppsSDK,
          referrer,
          isSafe
        });

        setIsSafeApp(isSafe);
      } catch (error) {
        console.warn('Safe App detection failed:', error);
        // If detection fails, assume not in Safe App for safety
        setIsSafeApp(false);
      } finally {
        setIsDetecting(false);
      }
    };

    detectSafeApp();
  }, []);

  return { isSafeApp, isDetecting };
}

// Smart wallet connect component - detects environment and connects on click
export function WalletOptions() {
  const mounted = useMounted();
  const { isSafeApp, isDetecting } = useSafeAppDetection();
  const { connectors, connect, isPending, error } = useConnect();

  // Find the appropriate connector based on environment
  const safeConnector = connectors.find(connector => connector.name === 'Safe');
  const walletConnectConnector = connectors.find(connector => connector.name === 'WalletConnect');

  // Handle connect button click
  const handleConnect = () => {
    try {
      if (isSafeApp && safeConnector) {
        console.log('Connecting to Safe App...');
        connect({ connector: safeConnector });
      } else if (!isSafeApp && walletConnectConnector) {
        console.log('Connecting to WalletConnect...');
        connect({ connector: walletConnectConnector });
      }
    } catch (error) {
      console.error('Connection failed:', error);
    }
  };

  // Don't render until mounted to prevent hydration mismatch
  if (!mounted) {
    return (
      <button className={styles.connectButton} disabled>
        <span>Connect Wallet</span>
      </button>
    );
  }

  // Show error state with retry button
  if (error) {
    return (
      <button
        className={styles.connectButton}
        onClick={handleConnect}
        disabled={!safeConnector && !walletConnectConnector}
      >
        <span>
          {error.message.includes('rejected') || error.message.includes('denied')
            ? 'Connection rejected - Click to retry'
            : 'Connection failed - Click to retry'
          }
        </span>
      </button>
    );
  }

  // Show loading state while detecting environment or no connector available
  if (isDetecting || (!safeConnector && !walletConnectConnector)) {
    return (
      <button className={styles.connectButton} disabled>
        <div className={styles.loading}>
          <div className={styles.spinner}></div>
          <span>
            {isDetecting ? 'Detecting wallet environment...' : 'Loading wallet connector...'}
          </span>
        </div>
      </button>
    );
  }

  // Show the main connect button
  return (
    <button
      className={styles.connectButton}
      onClick={handleConnect}
      disabled={isPending}
    >
      {isPending ? (
        <div className={styles.loading}>
          <div className={styles.spinner}></div>
          <span>
            {isSafeApp ? 'Connecting to Safe...' : 'Connecting to Safe Wallet...'}
          </span>
        </div>
      ) : (
        <span>
          {isSafeApp ? 'Connect Safe Wallet' : 'Connect Safe Wallet'}
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