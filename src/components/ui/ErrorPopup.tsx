'use client';

import React, { useEffect, useState } from 'react';
import styles from './ErrorPopup.module.css';

interface ErrorPopupProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  message: string;
}

export default function ErrorPopup({ 
  isOpen, 
  onClose, 
  title = 'Something went wrong', 
  message 
}: ErrorPopupProps) {
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      // Prevent scrolling when popup is open
      document.body.style.overflow = 'hidden';
    } else {
      const timer = setTimeout(() => setShouldRender(false), 300);
      document.body.style.overflow = 'unset';
      return () => clearTimeout(timer);
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!shouldRender) return null;

  return (
    <div className={styles.overlay} onClick={onClose} style={{ opacity: isOpen ? 1 : 0, transition: 'opacity 0.2s' }}>
      <div 
        className={styles.popup} 
        onClick={e => e.stopPropagation()}
        style={{ 
          transform: isOpen ? 'translateY(0)' : 'translateY(20px)',
          opacity: isOpen ? 1 : 0, 
          transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)' 
        }}
      >
        <div className={styles.header}>
          <div className={styles.icon}>⚠️</div>
          <h3 className={styles.title}>{title}</h3>
        </div>
        
        <p className={styles.message}>{message}</p>
        
        <button className={styles.button} onClick={onClose}>
          Dismiss
        </button>
      </div>
    </div>
  );
}
