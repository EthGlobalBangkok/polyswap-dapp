"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { WalletModal } from "./WalletModal";

interface WalletModalCtx {
  open: () => void;
  close: () => void;
  isOpen: boolean;
}

const Ctx = createContext<WalletModalCtx | null>(null);

export function WalletModalProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  const open = useCallback(() => setOpen(true), []);
  const close = useCallback(() => setOpen(false), []);
  const value = useMemo(() => ({ open, close, isOpen }), [open, close, isOpen]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <WalletModal open={isOpen} onClose={close} />
    </Ctx.Provider>
  );
}

export function useWalletModal(): WalletModalCtx {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error(
      "useWalletModal must be used inside a WalletModalProvider (mounted by the (app) layout)."
    );
  }
  return ctx;
}
