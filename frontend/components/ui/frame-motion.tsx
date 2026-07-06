"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

type DefaultFramerProps = {
  children: React.ReactNode;
  className?: string;
  /** Optional entrance delay in seconds. Defaults to 0. */
  delay?: number;
};

// ease-out-quint: confident deceleration, no bounce
const EASE_OUT_QUINT = [0.22, 1, 0.36, 1] as const;

export function DefaultFramer({ children, className, delay = 0 }: DefaultFramerProps) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <AnimatePresence>
      <motion.div
        initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 15 }}
        animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
        exit={
          prefersReducedMotion
            ? { opacity: 0, transition: { duration: 0.1, ease: "linear" } }
            : { opacity: 0, y: 8, transition: { duration: 0.2, ease: EASE_OUT_QUINT } }
        }
        transition={
          prefersReducedMotion
            ? { duration: 0.15, ease: "linear" }
            : { duration: 0.3, ease: EASE_OUT_QUINT, delay }
        }
        className={className}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
