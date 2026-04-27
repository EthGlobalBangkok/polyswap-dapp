"use client";

import { useState } from "react";
import styles from "./Hero.module.css";

interface HeroProps {
  onExploreClick?: () => void;
}

const Hero = ({ onExploreClick }: HeroProps) => {
  const [isHowItWorksOpen, setIsHowItWorksOpen] = useState(false);

  const steps = [
    {
      number: "01",
      title: "Choose a Market",
      description: "Browse prediction markets that could impact crypto prices—elections, regulations, geopolitical events.",
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M21 21L15 15M17 10C17 13.866 13.866 17 10 17C6.13401 17 3 13.866 3 10C3 6.13401 6.13401 3 10 3C13.866 3 17 6.13401 17 10Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )
    },
    {
      number: "02",
      title: "Set Your Condition",
      description: "Define when your swap triggers—e.g., when \"Trump wins\" reaches 70% probability.",
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 6V12L16 14M22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )
    },
    {
      number: "03",
      title: "Configure Your Swap",
      description: "Select tokens and amounts. Your swap waits in your Safe wallet until conditions are met.",
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M7.5 21L3 16.5M3 16.5L7.5 12M3 16.5H16.5C18.1569 16.5 19.5 15.1569 19.5 13.5V12M16.5 3L21 7.5M21 7.5L16.5 12M21 7.5H7.5C5.84315 7.5 4.5 8.84315 4.5 10.5V12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )
    },
    {
      number: "04",
      title: "Automatic Execution",
      description: "When your condition is met, your swap executes automatically. No action needed.",
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M9 12L11 14L15 10M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )
    }
  ];

  return (
    <section className={styles.hero}>
      <div className={styles.content}>
        <div className={styles.badge}>
          <span className={styles.badgeDot}></span>
          Powered by Polymarket
        </div>
        
        <h1 className={styles.title}>
          Automate swaps based on<br />
          <span className={styles.highlight}>real-world events</span>
        </h1>
        
        <p className={styles.subtitle}>
          Create conditional swaps that execute automatically when prediction market 
          outcomes reach your target probability. Perfect for hedging crypto positions 
          against political events, regulations, and market-moving news.
        </p>
        
        <div className={styles.actions}>
          <button className={styles.primaryButton} onClick={onExploreClick}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M21 21L15 15M17 10C17 13.866 13.866 17 10 17C6.13401 17 3 13.866 3 10C3 6.13401 6.13401 3 10 3C13.866 3 17 6.13401 17 10Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Explore Markets
          </button>
          <button 
            className={styles.secondaryButton} 
            onClick={() => setIsHowItWorksOpen(!isHowItWorksOpen)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 16V12M12 8H12.01M22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            How It Works
          </button>
        </div>

        <div className={styles.stats}>
          <div className={styles.stat}>
            <span className={styles.statValue}>Non-custodial</span>
            <span className={styles.statLabel}>Via Safe Wallet</span>
          </div>
          <div className={styles.statDivider}></div>
          <div className={styles.stat}>
            <span className={styles.statValue}>Polygon</span>
            <span className={styles.statLabel}>Low gas fees</span>
          </div>
          <div className={styles.statDivider}></div>
          <div className={styles.stat}>
            <span className={styles.statValue}>CoW Protocol</span>
            <span className={styles.statLabel}>MEV protection</span>
          </div>
        </div>
      </div>

      {/* How It Works Expandable Section */}
      {isHowItWorksOpen && (
        <div className={styles.howItWorks}>
          <div className={styles.stepsGrid}>
            {steps.map((step) => (
              <div key={step.number} className={styles.step}>
                <div className={styles.stepIcon}>{step.icon}</div>
                <div className={styles.stepNumber}>{step.number}</div>
                <h3 className={styles.stepTitle}>{step.title}</h3>
                <p className={styles.stepDescription}>{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};

export default Hero;
