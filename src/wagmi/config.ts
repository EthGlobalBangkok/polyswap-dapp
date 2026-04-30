"use client";

import { createConfig, http } from "wagmi";
import { polygon } from "wagmi/chains";
import { safe, walletConnect } from "wagmi/connectors";

const projectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID;
if (!projectId) {
  throw new Error("NEXT_PUBLIC_WC_PROJECT_ID is not defined");
}

export const config = createConfig({
  chains: [polygon],
  transports: {
    [polygon.id]: http(process.env.NEXT_PUBLIC_RPC_URL),
  },
  ssr: true,
  connectors: [
    safe({
      // Override wagmi's 10ms upstream default — too short for a typical iframe boot.
      // See https://github.com/wevm/wagmi/blob/main/packages/connectors/src/safe.ts
      unstable_getInfoTimeout: 1000,
      // Anchored regexes — old config had `/app\.safe\.global$/` which matches
      // "evil-app.safe.global". Keep it tight.
      allowedDomains: [/^app\.safe\.global$/, /^safe\.global$/],
      debug: process.env.NODE_ENV !== "production",
    }),
    walletConnect({
      projectId,
      metadata: {
        name: "Polyswap",
        description: "Conditional orders with Polymarket predictions",
        url: typeof window !== "undefined" ? window.location.origin : "",
        icons: [typeof window !== "undefined" ? `${window.location.origin}/favicon.ico` : ""],
      },
      showQrModal: true,
    }),
  ],
});
