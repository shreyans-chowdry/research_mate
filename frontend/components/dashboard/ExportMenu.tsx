"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, Download } from "lucide-react";
import { downloadText, slugify, toBibTeX } from "@/lib/format";
import { useToast } from "@/components/Toast";
import { useDashboard } from "./DashboardContext";

export default function ExportMenu() {
  const { topic, papers, gaps, comparisons, report, setTab } = useDashboard();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const base = slugify(topic);
  const items = [
    {
      label: "Report as Markdown",
      hint: ".md",
      disabled: !report,
      run: () => downloadText(`${base}-literature-review.md`, report?.content_markdown ?? "", "text/markdown;charset=utf-8"),
    },
    {
      label: "Report as PDF",
      hint: "print",
      disabled: !report,
      run: () => {
        setTab("report");
        setTimeout(() => window.print(), 450);
      },
    },
    {
      label: "References for LaTeX",
      hint: ".bib",
      disabled: !papers.length,
      run: () => downloadText(`${base}.bib`, toBibTeX(papers), "application/x-bibtex;charset=utf-8"),
    },
    {
      label: "Everything as JSON",
      hint: ".json",
      disabled: false,
      run: () =>
        downloadText(
          `${base}-researchmate.json`,
          JSON.stringify({ topic, papers, gaps, comparisons, report }, null, 2),
          "application/json;charset=utf-8"
        ),
    },
  ];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="btn-quiet flex h-10 items-center gap-2 px-3.5 text-sm"
      >
        <Download className="h-4 w-4" /> Export
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 z-50 mt-2 w-60 origin-top-right overflow-hidden rounded-xl border border-border-strong bg-card p-1 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.7)]"
          >
            {items.map((it) => (
              <button
                key={it.label}
                type="button"
                role="menuitem"
                disabled={it.disabled}
                onClick={() => {
                  it.run();
                  setOpen(false);
                  if (it.hint !== "print") toast.show(`Downloaded ${it.label.toLowerCase()}`, { tone: "success" });
                }}
                className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm text-foreground transition-colors hover:bg-muted disabled:opacity-40"
              >
                {it.label}
                <span className="text-xs text-muted-foreground">{it.hint}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
