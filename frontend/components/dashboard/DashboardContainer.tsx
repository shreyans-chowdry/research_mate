"use client";

import React, { useState } from "react";
import {
  FileText,
  GitCompare,
  Sparkles,
  BookOpen,
  Layers,
} from "lucide-react";
import {
  PaperWithAnalysis,
  ComparisonDimension,
  ResearchGap,
  ResearchReport,
} from "@/lib/api";
import PapersTab from "./PapersTab";
import ComparisonTab from "./ComparisonTab";
import GapsTab from "./GapsTab";
import ReportTab from "./ReportTab";

export type DashboardTab = "gaps" | "papers" | "comparison" | "report";

interface DashboardContainerProps {
  papers: PaperWithAnalysis[];
  comparisons: ComparisonDimension[];
  gaps: ResearchGap[];
  report: ResearchReport | null;
  projectId: string;
  topic?: string;
  initialTab?: DashboardTab;
}

export default function DashboardContainer({
  papers,
  comparisons,
  gaps,
  report,
  projectId,
  topic,
  initialTab = "gaps", // Flagship view as recommended in prompt pack
}: DashboardContainerProps) {
  const [activeTab, setActiveTab] = useState<DashboardTab>(initialTab);
  const [selectedPaperId, setSelectedPaperId] = useState<string | null>(null);

  // Jump from Gaps tab evidence button to Papers tab
  const handleNavigateToPaper = (paperId: string) => {
    setSelectedPaperId(paperId);
    setActiveTab("papers");
  };

  const tabs: Array<{
    id: DashboardTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number | string;
    isFlagship?: boolean;
  }> = [
    {
      id: "gaps",
      label: "Identified Gaps",
      icon: Sparkles,
      badge: gaps.length > 0 ? gaps.length : undefined,
      isFlagship: true,
    },
    {
      id: "papers",
      label: "Papers",
      icon: FileText,
      badge: papers.length > 0 ? papers.length : undefined,
    },
    {
      id: "comparison",
      label: "Comparative Synthesis",
      icon: GitCompare,
      badge: comparisons.length > 0 ? `${comparisons.length} dims` : undefined,
    },
    {
      id: "report",
      label: "Full Report",
      icon: BookOpen,
    },
  ];

  return (
    <div className="space-y-6">
      {/* ── Tab Navigation Bar ── */}
      <div className="flex overflow-x-auto pb-1 border-b border-border/60 scrollbar-none gap-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex items-center gap-2.5 px-4 sm:px-5 py-3 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap transition-all duration-200 ${
                isActive
                  ? "bg-secondary text-foreground shadow-sm border border-border/80"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/40"
              }`}
              id={`tab-${tab.id}`}
            >
              <Icon
                className={`w-4 h-4 ${
                  isActive
                    ? tab.isFlagship
                      ? "text-primary"
                      : "text-foreground"
                    : "text-muted-foreground"
                }`}
              />
              <span>{tab.label}</span>

              {/* Badge */}
              {tab.badge !== undefined && (
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                    isActive
                      ? tab.isFlagship
                        ? "bg-primary/20 text-primary border border-primary/30"
                        : "bg-primary/10 text-primary border border-primary/20"
                      : "bg-secondary/80 text-muted-foreground border border-border/50"
                  }`}
                >
                  {tab.badge}
                </span>
              )}

              {/* Flagship Tag */}
              {tab.isFlagship && (
                <span className="hidden sm:inline-block text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.2 rounded bg-gradient-to-r from-primary to-accent-foreground text-white">
                  Star
                </span>
              )}

              {/* Active Tab Glow Indicator */}
              {isActive && (
                <div className="absolute -bottom-1 left-2 right-2 h-0.5 bg-gradient-to-r from-transparent via-primary to-transparent" />
              )}
            </button>
          );
        })}
      </div>

      {/* ── Active Tab Content ── */}
      <div className="pt-2">
        {activeTab === "gaps" && (
          <GapsTab gaps={gaps} onNavigateToPaper={handleNavigateToPaper} />
        )}
        {activeTab === "papers" && (
          <PapersTab
            papers={papers}
            selectedPaperId={selectedPaperId}
            onPaperSelect={(id) => setSelectedPaperId(id)}
          />
        )}
        {activeTab === "comparison" && (
          <ComparisonTab comparisons={comparisons} />
        )}
        {activeTab === "report" && (
          <ReportTab report={report} topic={topic} projectId={projectId} />
        )}
      </div>
    </div>
  );
}
