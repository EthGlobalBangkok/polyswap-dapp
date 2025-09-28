'use client';

import styles from './Footer.module.css';

const Footer = () => {
  return (
    <footer className={styles.footer}>
      <div className={`container ${styles.footerContent}`}>
        <div className={styles.left}>
          <div className={styles.logo}>
            <span className={styles.logoIcon}>🔄</span>
            <span className={styles.logoText}>
              Poly<span className="text-gradient">Swap</span>
            </span>
          </div>
          <p className={styles.description}>
            Automated DeFi swaps triggered by prediction market outcomes on Polygon
          </p>
        </div>
        
        <div className={styles.right}>
          <div className={styles.links}>
            <a href="#" className={styles.link}>About</a>
            <a href="#" className={styles.link}>Docs</a>
            <a href="#" className={styles.link}>GitHub</a>
            <a href="#" className={styles.link}>Support</a>
          </div>
          <div className={styles.copyright}>
            <span>© 2024 PolySwap. All rights reserved.</span>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer; 