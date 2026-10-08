"use client";

import { createContext, useContext } from "react";
import type { PaperWithAnalysis, ResearchGap, ComparisonDimension, ResearchReport } from "@/lib/api";

export type DashboardTab = "gaps" | "papers" | "matrix" | "synthesis" | "report" | "ask" | "critic";

export interface DashboardData {
  projectId: string;
  topic: string;
  papers: PaperWithAnalysis[];
  gaps: ResearchGap[];
  comparisons: ComparisonDimension[];
  report: ResearchReport | null;
  /** Switch to the Papers tab and open one paper. */
  goToPaper: (paperId: string) => void;
  setTab: (tab: DashboardTab) => void;
  focusedPaperId: string | null;
}

export const DashboardContext = createContext<DashboardData | null>(null);

export function useDashboard(): DashboardData {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error("useDashboard must be used inside the dashboard");
  return ctx;
}
