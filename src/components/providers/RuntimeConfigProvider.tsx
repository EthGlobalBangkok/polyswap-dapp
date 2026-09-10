"use client";

import { createContext, useContext } from "react";

interface RuntimeConfig {
  orderCreationDisabled: boolean;
}

const RuntimeConfigContext = createContext<RuntimeConfig>({
  orderCreationDisabled: false,
});

export function RuntimeConfigProvider({
  orderCreationDisabled,
  children,
}: RuntimeConfig & { children: React.ReactNode }) {
  return (
    <RuntimeConfigContext.Provider value={{ orderCreationDisabled }}>
      {children}
    </RuntimeConfigContext.Provider>
  );
}

export function useRuntimeConfig(): RuntimeConfig {
  return useContext(RuntimeConfigContext);
}
