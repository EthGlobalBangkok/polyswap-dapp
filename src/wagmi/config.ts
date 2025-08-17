import { createConfig, http } from 'wagmi'
import { polygon, polygonAmoy } from 'wagmi/chains'
import { safe, walletConnect } from 'wagmi/connectors'

const projectId = 'c0030b76ad13b6c833cb8925480f09f3'

export const config = createConfig({
  chains: [polygon, polygonAmoy],
  transports: {
    [polygon.id]: http(),
    [polygonAmoy.id]: http(),
  },
  connectors: [
    walletConnect({ projectId })
  ],
})