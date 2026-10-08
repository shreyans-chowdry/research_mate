"use client";

import { useSyncExternalStore } from "react";
import { motion } from "motion/react";

export function useTheme() {
  const theme = useSyncExternalStore(
    (onChange) => {
      const obs = new MutationObserver(onChange);
      obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
      return () => obs.disconnect();
    },
    () => (document.documentElement.classList.contains("dark") ? "dark" : "light"),
    () => "dark" as const
  );

  const setTheme = (next: "dark" | "light") => {
    document.documentElement.classList.toggle("dark", next === "dark");
    try {
      localStorage.setItem("researchmate_theme", next);
    } catch {
      // storage unavailable — theme still applies for this visit
    }
  };

  return { theme, setTheme, toggle: () => setTheme(theme === "dark" ? "light" : "dark") };
}

/** An eclipse: the shadow slides off the disc to turn the lights on. */
export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const dark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggle}
      className="btn-quiet grid h-9 w-9 place-items-center"
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      title={dark ? "Light theme" : "Dark theme"}
    >
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <defs>
          <mask id="eclipse-mask">
            <rect width="24" height="24" fill="white" />
            <motion.circle
              r="7"
              fill="black"
              initial={false}
              animate={{ cx: dark ? 16 : 30, cy: dark ? 8 : -6 }}
              transition={{ type: "spring", stiffness: 200, damping: 22 }}
            />
          </mask>
        </defs>
        <motion.circle
          cx="12"
          cy="12"
          fill="currentColor"
          mask="url(#eclipse-mask)"
          initial={false}
          animate={{ r: dark ? 7.5 : 5 }}
          transition={{ type: "spring", stiffness: 200, damping: 20 }}
        />
        <motion.g
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          initial={false}
          animate={{ opacity: dark ? 0 : 1, rotate: dark ? -45 : 0, scale: dark ? 0.6 : 1 }}
          style={{ originX: "12px", originY: "12px" }}
          transition={{ duration: 0.35 }}
        >
          {Array.from({ length: 8 }).map((_, i) => {
            const a = (i * Math.PI) / 4;
            return (
              <line
                key={i}
                x1={(12 + Math.cos(a) * 8).toFixed(2)}
                y1={(12 + Math.sin(a) * 8).toFixed(2)}
                x2={(12 + Math.cos(a) * 10).toFixed(2)}
                y2={(12 + Math.sin(a) * 10).toFixed(2)}
              />
            );
          })}
        </motion.g>
      </svg>
    </button>
  );
}
