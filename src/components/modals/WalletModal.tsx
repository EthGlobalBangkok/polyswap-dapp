"use client";

import { useEffect, useMemo } from "react";
import { useConnect } from "wagmi";
import type { Connector } from "wagmi";
import { Modal, Button } from "@/components/primitives";
import { Icon } from "@/components/icons";
import { cn } from "@/lib/cn";
import { useWalletConnection } from "@/hooks/useWalletConnection";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Called once a wallet is connected. */
  onConnected?: () => void;
}

interface ConnectorView {
  connector: Connector;
  label: string;
  blurb: string;
}

const META: Record<string, { label: string; blurb: string }> = {
  walletConnect: {
    label: "WalletConnect",
    blurb: "Scan a QR or open in your wallet of choice.",
  },
  safe: {
    label: "Safe wallet",
    blurb: "Auto-detected when this site is loaded inside Safe.",
  },
};

function describe(c: Connector): { label: string; blurb: string } {
  const meta = META[c.id] ?? META[c.type];
  return meta ?? { label: c.name, blurb: "Connect with this wallet." };
}

export function WalletModal({ open, onClose, onConnected }: Props) {
  const { connect, connectors, isPending, error, variables } = useConnect();
  const { isConnected } = useWalletConnection();

  const list = useMemo<ConnectorView[]>(
    () =>
      connectors.map((c) => ({
        connector: c,
        ...describe(c),
      })),
    [connectors]
  );

  useEffect(() => {
    if (open && isConnected) {
      onConnected?.();
      onClose();
    }
  }, [open, isConnected, onConnected, onClose]);

  return (
    <Modal open={open} onClose={onClose} title="Connect a wallet" size="sm">
      <div className="flex flex-col gap-3 p-5">
        <p className="text-sm text-ink-2">
          Polyswap is non-custodial. Your tokens stay in your wallet — we never take custody, and we
          can&apos;t move funds without your approval.
        </p>

        <ul className="mt-2 flex flex-col gap-2">
          {list.map(({ connector, label, blurb }) => {
            const pending = isPending && variables?.connector === connector;
            return (
              <li key={connector.uid}>
                <button
                  type="button"
                  onClick={() => connect({ connector })}
                  disabled={isPending}
                  className={cn(
                    "flex w-full items-start justify-between gap-4 border border-ink bg-paper-2 px-4 py-3 text-left",
                    "hover:bg-paper-3 disabled:cursor-not-allowed disabled:opacity-60"
                  )}
                >
                  <div>
                    <p className="font-serif text-lg">{label}</p>
                    <p className="text-xs text-ink-3">{blurb}</p>
                  </div>
                  <span className="mt-1 text-ink-3" aria-hidden>
                    {pending ? (
                      <span className="num text-xs">…</span>
                    ) : (
                      <Icon.arrowRight size={16} />
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        {error && (
          <p className="border border-no bg-no/10 px-3 py-2 text-xs text-no">{error.message}</p>
        )}

        <div className="mt-2 border-t border-rule-soft pt-3 text-xs text-ink-3">
          <p className="flex items-start gap-2">
            <Icon.lock size={12} className="mt-0.5 text-accent" aria-hidden />
            We never see your private keys.
          </p>
          <p className="mt-1 flex items-start gap-2">
            <Icon.shield size={12} className="mt-0.5 text-accent" aria-hidden />
            Disconnect any time.
          </p>
        </div>

        <Button variant="ghost" size="sm" onClick={onClose} className="mt-2 self-end">
          Cancel
        </Button>
      </div>
    </Modal>
  );
}
