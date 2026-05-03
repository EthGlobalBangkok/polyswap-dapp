import { PageShell } from "@/components/layout";
import { WalletModalProvider } from "@/components/modals/WalletModalProvider";
import ClientWeb3Provider from "@/components/providers/ClientWeb3Provider";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClientWeb3Provider>
      <WalletModalProvider>
        <PageShell>{children}</PageShell>
      </WalletModalProvider>
    </ClientWeb3Provider>
  );
}
