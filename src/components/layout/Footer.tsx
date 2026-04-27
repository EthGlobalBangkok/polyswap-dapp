"use client";

import styles from "./Footer.module.css";

const Footer = () => {
  return (
    <footer className={styles.footer}>
      <div className={`container ${styles.footerContent}`}>
        <div className={styles.left}>
          <div className={styles.logo}>
            <span className={styles.logoIcon}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M7.5 21L3 16.5M3 16.5L7.5 12M3 16.5H16.5C18.1569 16.5 19.5 15.1569 19.5 13.5V12M16.5 3L21 7.5M21 7.5L16.5 12M21 7.5H7.5C5.84315 7.5 4.5 8.84315 4.5 10.5V12" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </span>
            <span className={styles.logoText}>
              Poly<span className="text-gradient">Swap</span>
            </span>
          </div>
          <p className={styles.description}>
            Automated DeFi swaps triggered by prediction market outcomes. 
            Built on Polygon with CoW Protocol for MEV protection.
          </p>
        </div>

        <div className={styles.right}>
          <div className={styles.links}>
            <a href="/about" className={styles.link}>
              About
            </a>
            <a href="/api-docs" className={styles.link}>
              API
            </a>
            <a href="https://github.com/EthGlobalBangkok" className={styles.link} target="_blank" rel="noopener noreferrer">
              GitHub
            </a>
          </div>
          <div className={styles.copyright}>
            <span>© 2026 PolySwap</span>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
