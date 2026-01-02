"use client";

import Navbar from "../../components/layout/Navbar";
import Footer from "../../components/layout/Footer";
import styles from "./page.module.css";
import { WagmiProvider } from "wagmi";
import { config } from "../../wagmi/config";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

export default function About() {
  const queryClient = new QueryClient();

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
          <Navbar />

          <main style={{ flex: 1 }}>
            <div className={styles.container}>
              <h1 className={styles.title}>How to use PolySwap</h1>

              <div className={styles.steps}>
                <div className={styles.stepCard}>
                  <div className={styles.stepNumber}>1</div>
                  <div className={styles.stepContent}>
                    <h3 className={styles.stepTitle}>Connect Wallet</h3>
                    <p className={styles.stepDescription}>
                      Connect your Safe wallet via wallet connect to get started. Ensure you are
                      connected to the Polygon network.
                    </p>
                  </div>
                </div>

                <div className={styles.stepCard}>
                  <div className={styles.stepNumber}>2</div>
                  <div className={styles.stepContent}>
                    <h3 className={styles.stepTitle}>Select Market</h3>
                    <p className={styles.stepDescription}>
                      Browse available prediction markets from Polymarket in the grid. Choose a
                      market you want to base your swap strategy on.
                    </p>
                  </div>
                </div>

                <div className={styles.stepCard}>
                  <div className={styles.stepNumber}>3</div>
                  <div className={styles.stepContent}>
                    <h3 className={styles.stepTitle}>Define Strategy</h3>
                    <p className={styles.stepDescription}>
                      Set your trigger conditions. For example, "If the probability of Outcome YES
                      is attaining 75%".
                    </p>
                  </div>
                </div>

                <div className={styles.stepCard}>
                  <div className={styles.stepNumber}>4</div>
                  <div className={styles.stepContent}>
                    <h3 className={styles.stepTitle}>Automate Swap</h3>
                    <p className={styles.stepDescription}>
                      Configure the token swap you want to execute when your condition is met.
                      Select input/output tokens and the amount.
                    </p>
                  </div>
                </div>
              </div>

              <div className={styles.note}>
                <h3 className={styles.noteTitle}>⚠️ Security Note</h3>
                <p className={styles.noteText}>
                  PolySwap uses a decentralized architecture where your funds remain in your custody
                  until the swap conditions are met. However, as this project is in Beta, please use
                  it responsibly and do not deposit funds you cannot afford to lose.
                </p>
              </div>

              <div className={styles.info}>
                <h3 className={styles.infoTitle}>Behind the scenes</h3>
                <p className={styles.infoText}>
                  When you choose a market and a condition, we create a limit order on Polymarket at
                  the price of the condition and you sign a conditional order with the Polymaket
                  limit order to be filled as condition. So when the Polymarket order is executed
                  onchain, the condition of the conditional order from CoW Protocol is accepted and
                  the swap is executed automaticaly at the best price thanks to CoW Swap.
                </p>
              </div>

              <div className={styles.history}>
                <h2 className={styles.historyTitle}>Our Story</h2>
                <p className={styles.historyText}>
                  This project was born during the <strong>ETHGlobal Bangkok</strong> hackathon. The
                  team has continued its development, supported by a grant from{" "}
                  <strong>CoW Protocol</strong> to leverage their conditional orders technology.
                </p>
              </div>

              <div className={styles.team}>
                <h2 className={styles.teamTitle}>The Team</h2>
                <div className={styles.teamGrid}>
                  <div className={styles.memberCard}>
                    <h3 className={styles.memberName}>Lucas Leclerc</h3>
                    <span className={styles.memberRole}>Co-Founder & Dev</span>
                    <div className={styles.socialLinks}>
                      <a
                        href="https://github.com/Intermarch3"
                        className={styles.socialLink}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        GitHub
                      </a>
                      <a
                        href="https://www.linkedin.com/in/leclerclucas"
                        className={styles.socialLink}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        LinkedIn
                      </a>
                      <a
                        href="https://x.com/intermarch3"
                        className={styles.socialLink}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Twitter
                      </a>
                    </div>
                  </div>

                  <div className={styles.memberCard}>
                    <h3 className={styles.memberName}>Baptiste Florentin</h3>
                    <span className={styles.memberRole}>Co-Founder & Dev</span>
                    <div className={styles.socialLinks}>
                      <a
                        href="https://github.com/Pybast"
                        className={styles.socialLink}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        GitHub
                      </a>
                      <a
                        href="https://www.linkedin.com/in/pybast"
                        className={styles.socialLink}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        LinkedIn
                      </a>
                      <a
                        href="https://x.com/Pybast"
                        className={styles.socialLink}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Twitter
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </main>

          <Footer />
        </div>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
