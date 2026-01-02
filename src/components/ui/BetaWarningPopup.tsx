"use client";

import { useState, useEffect } from "react";
import styles from "./BetaWarningPopup.module.css";

const BetaWarningPopup = () => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem("betaWarningDismissed");
    if (!dismissed) {
      setIsVisible(true);
    }
  }, []);

  const handleDismiss = () => {
    localStorage.setItem("betaWarningDismissed", "true");
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div className={styles.overlay}>
      <div className={styles.popup}>
        <h2 className={styles.title}>Beta Warning</h2>
        <p className={styles.message}>
          This project is currently in Beta. Use at your own risk. It is recommended to not use
          large amounts of funds.
        </p>
        <button className={styles.button} onClick={handleDismiss}>
          I understand
        </button>
      </div>
    </div>
  );
};

export default BetaWarningPopup;
