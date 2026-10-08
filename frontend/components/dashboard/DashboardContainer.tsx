"use client";

import { useEffect, useMemo } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useCommands, type Command } from "@/components/CommandPalette";
import { useDashboard, type DashboardTab } from "./DashboardContext";
import GapsTab from "./GapsTab";
import PapersTab from "./PapersTab";
import MatrixTab from "./MatrixTab";
import SynthesisTab from "./SynthesisTab";
import ReportTab from "./ReportTab";
import AskTab from "./AskTab";
import CriticTab from "./CriticTab";

export const TABS: Array<{ id: DashboardTab; label: string }> = [
  { id: "gaps", label: "Gaps" },
  { id: "papers", label: "Papers" },
  { id: "matrix", label: "Matrix" },
  { id: "synthesis", label: "Comparison" },
  { id: "report", label: "Report" },
  { id: "ask", label: "Ask" },
  { id: "critic", label: "Review my draft" },
];

const PANES: Record<DashboardTab, () => React.ReactElement> = {
  gaps: GapsTab,
  papers: PapersTab,
  matrix: MatrixTab,
  synthesis: SynthesisTab,
  report: ReportTab,
  ask: AskTab,
  critic: CriticTab,
};

export default function DashboardContainer({ tab }: { tab: DashboardTab }) {
  const { setTab, papers, gaps } = useDashboard();

  const counts: Partial<Record<DashboardTab, number>> = { gaps: gaps.length, papers: papers.length };

  // 1–7 switch tabs when focus isn't in a text field
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || el.closest("input, textarea, [contenteditable]")) return;
      const n = Number(e.key);
      if (n >= 1 && n <= TABS.length) setTab(TABS[n - 1].id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setTab]);

  const commands = useMemo<Command[]>(
    () =>
      TABS.map((t, i) => ({
        id: `tab-${t.id}`,
        label: `Go to ${t.label}`,
        group: "This review",
        hint: String(i + 1),
        keywords: t.id,
        run: () => setTab(t.id),
      })),
    [setTab]
  );
  useCommands("dashboard-tabs", commands);

  const Pane = PANES[tab];

  return (
    <div>
      <div className="no-print sticky top-16 z-40 -mx-4 mb-8 border-b border-border bg-background/85 px-4 backdrop-blur-md sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <nav className="flex gap-1 overflow-x-auto [scrollbar-width:none]" role="tablist" aria-label="Review sections">
          {TABS.map((t, i) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.id)}
                title={`${t.label} (${i + 1})`}
                className={`relative flex h-12 flex-none items-center gap-2 px-3 text-[15px] transition-colors ${
                  active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
                {counts[t.id] !== undefined && (
                  <span className={`text-sm ${active ? "text-flare" : "text-muted-foreground"}`}>{counts[t.id]}</span>
                )}
                {active && (
                  <motion.span
                    layoutId="tab-underline"
                    className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-flare-fill"
                    transition={{ type: "spring", stiffness: 480, damping: 36 }}
                  />
                )}
              </button>
            );
          })}
        </nav>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          role="tabpanel"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
        >
          <Pane />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
