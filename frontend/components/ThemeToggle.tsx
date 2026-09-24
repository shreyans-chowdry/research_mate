"use client";

import { useEffect, useState } from "react";

export function ThemeToggle() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const saved = localStorage.getItem("researchmate_theme") as
        | "dark"
        | "light"
        | null;
      if (saved === "light") {
        setTheme("light");
        document.documentElement.classList.remove("dark");
      } else {
        setTheme("dark");
        document.documentElement.classList.add("dark");
      }
    } catch {
      // Default to dark mode
      document.documentElement.classList.add("dark");
    }
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    try {
      localStorage.setItem("researchmate_theme", nextTheme);
    } catch {}

    if (nextTheme === "light") {
      document.documentElement.classList.remove("dark");
    } else {
      document.documentElement.classList.add("dark");
    }
  };

  if (!mounted) {
    return (
      <div
        className="w-9 h-9 rounded-xl border border-border/40 bg-secondary/40 flex items-center justify-center opacity-60"
        aria-hidden="true"
      />
    );
  }

  const isLight = theme === "light";

  return (
    <button
      onClick={toggleTheme}
      id="theme-toggle-bulb"
      type="button"
      aria-label={isLight ? "Switch to Dark Mode" : "Switch to Light Mode"}
      title={isLight ? "Switch to Dark Mode (turn off bulb)" : "Switch to Light Mode (turn on bulb)"}
      className={`relative group flex items-center justify-center w-9 h-9 rounded-xl border transition-all duration-300 active:scale-95 ${
        isLight
          ? "bg-amber-500/10 border-amber-500/30 text-amber-500 shadow-sm shadow-amber-500/20 hover:bg-amber-500/20"
          : "bg-secondary/60 border-border/60 text-muted-foreground hover:text-amber-400 hover:border-amber-400/40 hover:bg-secondary"
      }`}
    >
      {/* Lightbulb Icon */}
      <svg
        width="19"
        height="19"
        viewBox="0 0 24 24"
        fill={isLight ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`transition-all duration-300 ${
          isLight
            ? "scale-110 drop-shadow-[0_0_8px_rgba(245,158,11,0.7)] text-amber-500"
            : "group-hover:scale-105 group-hover:text-amber-400"
        }`}
      >
        <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
        <path d="M9 18h6" />
        <path d="M10 22h4" />
      </svg>

      {/* Lit Glow Ping in Light Mode */}
      {isLight && (
        <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
        </span>
      )}
    </button>
  );
}
