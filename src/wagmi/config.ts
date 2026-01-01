import { createConfig, http } from "wagmi";
import { polygon } from "wagmi/chains";
import { walletConnect, safe } from "wagmi/connectors";

const projectId = process.env.WC_PROJECT_ID;

export const config = createConfig({
  chains: [polygon],
  transports: {
    [polygon.id]: http(),
  },
  ssr: true,
  connectors: [
    safe({
      // Improved Safe connector configuration for better detection
      allowedDomains: [/app\.safe\.global$/, /gnosis-safe\.io$/],
      debug: process.env.NODE_ENV === "development",
    }),
    walletConnect({
      projectId,
      // Configuration for Safe Mobile connection
      metadata: {
        name: "Polyswap",
        description: "Conditional orders with Polymarket predictions",
        url: typeof window !== "undefined" ? window.location.origin : "",
        icons: [typeof window !== "undefined" ? `${window.location.origin}/favicon.ico` : ""],
      },
      qrModalOptions: {
        enableExplorer: false, // Disable other wallets in QR modal
        explorerRecommendedWalletIds: [], // Only show Safe mobile
        desktopWallets: [], // Remove desktop wallet options
        mobileWallets: [], // Let WalletConnect handle Safe mobile detection
      },
    }),
  ],
});
