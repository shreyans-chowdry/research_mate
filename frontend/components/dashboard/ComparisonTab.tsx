"use client";

import React, { useState } from "react";
import {
  GitCompare,
  Cpu,
  Database,
  BarChart3,
  CheckCircle2,
  AlertCircle,
  Lightbulb,
  ArrowRight,
  TrendingUp,
} from "lucide-react";
import { ComparisonDimension } from "@/lib/api";

interface ComparisonTabProps {
  comparisons: ComparisonDimension[];
}

export default function ComparisonTab({ comparisons }: ComparisonTabProps) {
  const [activeDimension, setActiveDimension] = useState<string>("all");

  const dimensionIcons: Record<string, React.ReactNode> = {
    methodology: <Cpu className="w-5 h-5 text-primary" />,
    dataset: <Database className="w-5 h-5 text-blue-400" />,
    results: <BarChart3 className="w-5 h-5 text-success" />,
  };

  const dimensionLabels: Record<string, string> = {
    methodology: "Methodology Paradigms",
    dataset: "Dataset & Benchmark Landscapes",
    results: "Empirical Results & Trade-Offs",
  };

  const dimensionBadges: Record<string, { label: string; class: string }> = {
    methodology: {
      label: "Architecture & Modeling",
      class: "bg-primary/15 text-primary border-primary/30",
    },
    dataset: {
      label: "Data Distribution & Scale",
      class: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    },
    results: {
      label: "Performance & Accuracy",
      class: "bg-success/15 text-success border-success/30",
    },
  };

  const filteredComparisons =
    activeDimension === "all"
      ? comparisons
      : comparisons.filter((c) => c.dimension.toLowerCase() === activeDimension.toLowerCase());

  if (!comparisons || comparisons.length === 0) {
    return (
      <div className="p-12 text-center rounded-2xl border border-border/50 bg-card/40 space-y-3">
        <GitCompare className="w-10 h-10 text-muted-foreground/50 mx-auto" />
        <h3 className="text-base font-semibold text-foreground">Synthesis in Progress</h3>
        <p className="text-xs text-muted-foreground max-w-sm mx-auto">
          The Comparison Agent is currently cross-analyzing methodologies and extracting benchmark comparisons.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Dimension Filter Tabs ── */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl border border-border/60 bg-card/60">
        <div className="flex items-center gap-2">
          <GitCompare className="w-4 h-4 text-primary" />
          <span className="text-xs font-semibold text-foreground">Cross-Paper Dimensions:</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setActiveDimension("all")}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
              activeDimension === "all"
                ? "bg-primary text-white shadow-sm"
                : "bg-secondary/40 text-muted-foreground hover:text-foreground hover:bg-secondary border border-border/50"
            }`}
          >
            All 3 Dimensions
          </button>
          {comparisons.map((c) => {
            const key = c.dimension.toLowerCase();
            const isActive = activeDimension === key;
            return (
              <button
                key={key}
                onClick={() => setActiveDimension(key)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium capitalize transition-all ${
                  isActive
                    ? "bg-primary text-white shadow-sm"
                    : "bg-secondary/40 text-muted-foreground hover:text-foreground hover:bg-secondary border border-border/50"
                }`}
              >
                {c.dimension}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Comparative Synthesis Cards ── */}
      <div className="space-y-6">
        {filteredComparisons.map((item, index) => {
          const key = item.dimension.toLowerCase();
          const title = dimensionLabels[key] || `${item.dimension} Synthesis`;
          const badge = dimensionBadges[key] || {
            label: "Comparative Dimension",
            class: "bg-secondary text-muted-foreground border-border",
          };

          // Split summary text into sentences or paragraphs for high-contrast presentation
          const paragraphs = item.summary.split("\n\n").filter(Boolean);

          return (
            <div
              key={item.dimension}
              className="relative overflow-hidden rounded-2xl border border-border/70 bg-card/70 p-6 sm:p-8 space-y-6 shadow-md transition-all hover:border-border"
            >
              {/* Card Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border/50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-secondary/80 border border-border/60 flex items-center justify-center">
                    {dimensionIcons[key] || <GitCompare className="w-5 h-5 text-primary" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono uppercase text-muted-foreground">
                        Dimension 0{index + 1}
                      </span>
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${badge.class}`}
                      >
                        {badge.label}
                      </span>
                    </div>
                    <h3 className="text-lg sm:text-xl font-bold text-foreground mt-0.5">
                      {title}
                    </h3>
                  </div>
                </div>
              </div>

              {/* Comparative Summary Text */}
              <div className="space-y-4">
                {paragraphs.map((p, pIdx) => (
                  <p
                    key={pIdx}
                    className="text-sm sm:text-base text-muted-foreground leading-relaxed font-normal"
                  >
                    {p}
                  </p>
                ))}
              </div>

              {/* High-Contrast Pull-Out Callouts */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                {/* Key Insight Box */}
                <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-primary">
                    <Lightbulb className="w-4 h-4 shrink-0" />
                    <span>Cross-Paper Synthesis Insight</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Evaluated across multiple peer-reviewed publications to reveal common assumptions, trade-offs, and critical gaps in current literature.
                  </p>
                </div>

                {/* Methodological Trade-off Box */}
                <div className="p-4 rounded-xl border border-border/60 bg-secondary/40 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                    <TrendingUp className="w-4 h-4 shrink-0 text-success" />
                    <span>Analytical Takeaway</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Directly substantiates research gap clustering and provides verifiable evidence links back to source papers.
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
