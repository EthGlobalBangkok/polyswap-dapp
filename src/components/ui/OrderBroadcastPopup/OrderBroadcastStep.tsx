"use client";

import React from "react";
import styles from "./OrderBroadcastPopup.module.css";

interface OrderBroadcastStepProps {
  currentStep: "polymarket" | "transaction" | "signed" | "success" | "error";
  polymarketOrderHash?: string;
  transactionHash?: string;
}

export const OrderBroadcastStep: React.FC<OrderBroadcastStepProps> = ({
  currentStep,
  polymarketOrderHash,
  transactionHash,
}) => {
  const steps = [
    { id: "polymarket", label: "Create Polymarket Order", number: 1 },
    { id: "transaction", label: "Sign Transaction", number: 2 },
    { id: "signed", label: "Confirm On-Chain", number: 3 },
    { id: "success", label: "Complete", number: 4 },
  ];

  const getStepStatus = (stepId: string) => {
    if (stepId === currentStep) return "active";

    // Define step order
    const stepOrder = ["polymarket", "transaction", "signed", "success"];
    const currentIndex = stepOrder.indexOf(currentStep);
    const stepIndex = stepOrder.indexOf(stepId);

    if (stepIndex < currentIndex) return "completed";
    return "pending";
  };

  return (
    <div className={styles.stepIndicator}>
      <div className={styles.stepLine}></div>

      {steps.map((step) => {
        const status = getStepStatus(step.id);
        const isCompleted = status === "completed";
        const isActive = status === "active";

        return (
          <div key={step.id} className={styles.stepItem}>
            <div
              className={`${styles.stepNumber} ${isCompleted ? styles.completed : ""} ${isActive ? styles.active : ""}`}
            >
              {isCompleted ? "✓" : step.number}
            </div>
            <div className={`${styles.stepLabel} ${isActive ? styles.active : ""}`}>
              {step.label}
            </div>
          </div>
        );
      })}
    </div>
  );
};
