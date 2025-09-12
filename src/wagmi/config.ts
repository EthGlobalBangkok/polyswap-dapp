import { createConfig, http } from 'wagmi'
import { polygon } from 'wagmi/chains'
import { walletConnect, safe } from 'wagmi/connectors'

const projectId = '939b6191396abf894a6b94010d6c177b'

export const config = createConfig({
  chains: [polygon],
  transports: {
    [polygon.id]: http(),
  },
  ssr: true,
  connectors: [
    safe(),
    walletConnect({ projectId })
  ],
})