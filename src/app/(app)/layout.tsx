import dynamic from "next/dynamic";
import { PageShell } from "@/components/layout";
import { WalletModalProvider } from "@/components/modals/WalletModalProvider";

/**
 * `(app)` route group wraps every signed-in surface (markets, create, dashboard)
 * with the Web3Provider, the wallet-modal context, and the editorial shell.
 * The provider is loaded client-only because wagmi connectors touch `window`.
 */
const Web3Provider = dynamic(() => import("@/components/providers/Web3Provider"));

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Web3Provider>
      <WalletModalProvider>
        <PageShell>{children}</PageShell>
      </WalletModalProvider>
    </Web3Provider>
  );
}
