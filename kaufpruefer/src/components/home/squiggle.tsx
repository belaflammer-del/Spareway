"use client";

import { motion } from "motion/react";

/** Handgezeichnet wirkender Wellen-Unterstrich. */
export function Squiggle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 220 24" className={className} aria-hidden>
      <motion.path
        d="M4 14 C 24 2, 40 2, 58 13 S 92 24, 112 13 S 148 2, 166 13 S 200 24, 216 11"
        fill="none"
        stroke="var(--accent)"
        strokeWidth="5"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.1, delay: 0.5, ease: "easeInOut" }}
      />
    </svg>
  );
}
