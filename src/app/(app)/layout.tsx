import { PageShell } from "@/components/layout";
import { PolymarketDataGate } from "@/components/modals/GeoblockGate";
import { WalletModalProvider } from "@/components/modals/WalletModalProvider";
import ClientWeb3Provider from "@/components/providers/ClientWeb3Provider";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <PolymarketDataGate>
      <ClientWeb3Provider>
        <WalletModalProvider>
          <PageShell>{children}</PageShell>
        </WalletModalProvider>
      </ClientWeb3Provider>
    </PolymarketDataGate>
  );
}
