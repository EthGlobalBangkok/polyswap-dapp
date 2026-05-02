"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Icon } from "@/components/icons";
import { cn } from "@/lib/cn";

interface QA {
  q: string;
  a: string;
}

const FAQS: QA[] = [
  {
    q: 'What is a "trigger"?',
    a: 'A condition you define — for example, "Trump endorsement YES reaches 55%". Polyswap watches the Polymarket order book and fires your swap the first time it crosses your line.',
  },
  {
    q: "What if the market never crosses my line?",
    a: "Nothing happens. No funds move. The swap expires when the underlying market resolves, and your tokens stay where they were.",
  },
  {
    q: "How does it actually execute?",
    a: "A signed off-chain order with on-chain pre-conditions. When the condition holds, a keeper submits your order. The swap clears at market rate at that moment.",
  },
  {
    q: "Where does the price come from?",
    a: "Polyswap reads Polymarket's on-chain CLOB. The triggering price is the same probability anyone else sees on Polymarket.",
  },
  {
    q: "What does it cost?",
    a: "Their is NO fee at the moment ! Subject to change with a small fee on the executed swap only.",
  },
];

const EASE = [0.16, 1, 0.3, 1] as const;

export function FAQ() {
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  return (
    <section id="faq" className="border-b border-ink" style={{ scrollMarginTop: "5rem" }}>
      <div className="mx-auto grid max-w-[1280px] gap-6 px-6 py-12 sm:px-8 lg:grid-cols-12 lg:gap-10 lg:px-12 lg:py-20">
        <div className="lg:col-span-3">
          <p className="eyebrow mb-3">Reasonable questions</p>
          <h2 className="display text-3xl sm:text-4xl lg:text-[40px]">FAQ.</h2>
        </div>
        <div className="border-t border-ink lg:col-span-9">
          {FAQS.map((it, i) => {
            const open = openIdx === i;
            const contentId = `faq-content-${i}`;
            return (
              <div
                key={it.q}
                className={cn(
                  "border-b border-ink transition-colors duration-200",
                  open && "bg-paper-2"
                )}
              >
                <button
                  type="button"
                  aria-expanded={open}
                  aria-controls={contentId}
                  onClick={() => setOpenIdx(open ? null : i)}
                  className="flex w-full cursor-pointer items-center justify-between gap-4 px-5 py-4 text-left lg:px-6 lg:py-5"
                >
                  <span className="font-serif text-lg sm:text-xl lg:text-[22px]">{it.q}</span>
                  <motion.span
                    aria-hidden
                    className="text-ink-3"
                    animate={{ rotate: open ? 45 : 0 }}
                    transition={{ duration: 0.24, ease: EASE }}
                  >
                    <Icon.plus size={18} />
                  </motion.span>
                </button>
                <AnimatePresence initial={false}>
                  {open && (
                    <motion.div
                      id={contentId}
                      key="content"
                      initial="collapsed"
                      animate="open"
                      exit="collapsed"
                      variants={{
                        open: { height: "auto", opacity: 1 },
                        collapsed: { height: 0, opacity: 0 },
                      }}
                      transition={{
                        height: { duration: 0.32, ease: EASE },
                        opacity: { duration: 0.22, ease: EASE },
                      }}
                      style={{ overflow: "hidden" }}
                    >
                      <motion.p
                        variants={{
                          open: { y: 0 },
                          collapsed: { y: -4 },
                        }}
                        transition={{ duration: 0.32, ease: EASE }}
                        className="max-w-[720px] px-5 pb-5 text-sm leading-relaxed text-ink-2 lg:px-6 lg:text-[15px]"
                      >
                        {it.a}
                      </motion.p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
