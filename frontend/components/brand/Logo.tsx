"use client";

import { motion, useReducedMotion } from "motion/react";

const RING = "M52.67 24.48 A22 22 0 1 1 39.52 11.33";
const STAR =
  "M47.56 6.9 C48.2 13.2 50.8 15.8 57.1 16.44 C50.8 17.1 48.2 19.7 47.56 26 C46.9 19.7 44.3 17.1 38 16.44 C44.3 15.8 46.9 13.2 47.56 6.9 Z";

/**
 * The ResearchMate mark: an orbit with a break in it, and a star sitting in the break.
 * Agents orbit the literature; the star is the gap they find.
 */
export function LogoMark({ size = 32, busy = false, className = "" }: { size?: number; busy?: boolean; className?: string }) {
  const reduce = useReducedMotion();

  return (
    <motion.svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
      initial="hidden"
      animate="shown"
      whileHover="hover"
    >
      <circle cx="32" cy="32" r="22" fill="none" stroke="var(--border-strong)" strokeWidth="1" />
      <motion.path
        d={RING}
        fill="none"
        stroke="currentColor"
        strokeWidth="4.5"
        strokeLinecap="round"
        variants={{ hidden: { pathLength: reduce ? 1 : 0 }, shown: { pathLength: 1 } }}
        transition={{ duration: 1.1, ease: [0.65, 0, 0.35, 1] }}
      />
      <motion.circle cx="32" cy="32" r="3" fill="currentColor" opacity={0.5} />

      {/* satellite: the agent */}
      <g className="orbit-spin" style={{ animationDuration: busy ? "3.2s" : "26s" }}>
        <circle cx="16.44" cy="47.56" r="4.2" fill="var(--aurora)" />
      </g>

      {/* star in the gap */}
      <motion.path
        d={STAR}
        fill="var(--flare-fill)"
        variants={{
          hidden: { scale: reduce ? 1 : 0, rotate: reduce ? 0 : -90 },
          shown: { scale: 1, rotate: 0, transition: { delay: 0.75, type: "spring", stiffness: 260, damping: 14 } },
          hover: { rotate: 90, scale: 1.12, transition: { type: "spring", stiffness: 300, damping: 12 } },
        }}
      />
    </motion.svg>
  );
}

export function Wordmark({ busy = false }: { busy?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark size={30} busy={busy} className="text-foreground" />
      <span className="font-display text-[1.35rem] leading-none tracking-[-0.01em] text-foreground">ResearchMate</span>
    </span>
  );
}
