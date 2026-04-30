"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Icon } from "@/components/icons";
import { cn } from "@/lib/cn";

interface Props {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  /** Defaults to `md`. */
  size?: "sm" | "md" | "lg";
  /** Hides the corner close affordance. */
  hideClose?: boolean;
  /** Disables overlay-click and Escape closing. */
  staticDismiss?: boolean;
  /** Optional className for the inner panel. */
  panelClassName?: string;
}

const SIZE: Record<NonNullable<Props["size"]>, string> = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-2xl",
};

const EASE = [0.16, 1, 0.3, 1] as const;

export function Modal({
  open,
  onClose,
  title,
  children,
  size = "md",
  hideClose = false,
  staticDismiss = false,
  panelClassName,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (!staticDismiss && e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose, staticDismiss]);

  return (
    <AnimatePresence>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className="fixed inset-0 z-50 flex items-end justify-center px-0 py-0 sm:items-center sm:px-4 sm:py-8"
        >
          <motion.button
            type="button"
            aria-label="Close dialog"
            onClick={() => !staticDismiss && onClose()}
            className="absolute inset-0 bg-ink/30"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: EASE }}
          />
          <motion.div
            className={cn(
              "relative flex w-full flex-col border border-ink bg-paper",
              "max-h-[92vh] overflow-hidden shadow-[6px_6px_0_0_var(--color-ink)]",
              SIZE[size],
              panelClassName
            )}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{
              duration: 0.32,
              ease: EASE,
            }}
          >
            {(title || !hideClose) && (
              <div className="flex items-center justify-between border-b border-ink px-5 py-4">
                <p className="font-serif text-xl">{title}</p>
                {!hideClose && (
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close"
                    className="-m-1 p-1 text-ink-3 hover:text-ink"
                  >
                    <Icon.x size={18} />
                  </button>
                )}
              </div>
            )}
            <div className="flex-1 overflow-y-auto">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
