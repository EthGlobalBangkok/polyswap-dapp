"use client";

import { useState, useRef, useEffect } from "react";
import styles from "./TokenIcon.module.css";

interface TokenIconProps {
  logoURI?: string;
  symbol: string;
  size?: "small" | "medium" | "large";
  className?: string;
}

export default function TokenIcon({ logoURI, symbol, size = "medium", className }: TokenIconProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const imgRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );

    if (imgRef.current) {
      observer.observe(imgRef.current);
    }

    return () => observer.disconnect();
  }, []);

  const handleImageLoad = () => {
    setIsLoaded(true);
  };

  const handleImageError = () => {
    setHasError(true);
    setIsLoaded(true);
  };

  const sizeClass = {
    small: styles.small,
    medium: styles.medium,
    large: styles.large,
  }[size];

  return (
    <div ref={imgRef} className={`${styles.tokenIcon} ${sizeClass} ${className || ""}`}>
      {isVisible && logoURI && !hasError ? (
        <>
          <img
            src={logoURI}
            alt={symbol}
            onLoad={handleImageLoad}
            onError={handleImageError}
            className={`${styles.image} ${isLoaded ? styles.loaded : ""}`}
          />
          {!isLoaded && <div className={styles.placeholder}>{symbol.charAt(0)}</div>}
        </>
      ) : (
        <div className={styles.placeholder}>{symbol.charAt(0)}</div>
      )}
    </div>
  );
}
