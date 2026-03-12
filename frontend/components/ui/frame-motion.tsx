"use client";

import { AnimatePresence, motion } from "framer-motion";

type DefaultFramerProps = {
  children: React.ReactNode;
  className?: string;
};

export function DefaultFramer({ children, className }: DefaultFramerProps) {
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        exit={{ opacity: 0, y: 15 }}
        className={className} //"w-[95%] sm:w-[70%] xl:w-[40%] max-w-xl"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
