"use client";

import { useEffect } from "react";
import { animate, motion, useMotionValue, useTransform } from "motion/react";

interface Props {
  to: number;
  /** Duration in ms. Default 360 — Bloomberg ticker, not slot machine. */
  duration?: number;
  /** Decimal places to render. Default 0. */
  digits?: number;
  /** Optional formatter — overrides `digits` if supplied. */
  format?: (n: number) => string;
  className?: string;
}

/**
 * Animates a number from 0 to `to` exactly once on mount, with a damped ease.
 * No bounce, no overshoot — meant to read like a data feed loading.
 *
 * Uses `useMotionValue` + `useTransform` so the count happens outside React's
 * render cycle. The output is a readonly motion span.
 */
export function CountUp({ to, duration = 360, digits = 0, format, className }: Props) {
  const mv = useMotionValue(0);
  const display = useTransform(mv, (v) => (format ? format(v) : v.toFixed(digits)));

  useEffect(() => {
    const controls = animate(mv, to, {
      duration: duration / 1000,
      ease: [0.16, 1, 0.3, 1],
    });
    return () => controls.stop();
  }, [mv, to, duration]);

  return <motion.span className={className}>{display}</motion.span>;
}
