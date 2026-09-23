"use client";

import React, { useState } from "react";
import {
  Sparkles,
  Compass,
  FileText,
  ArrowRight,
  ShieldAlert,
  Flame,
  Lightbulb,
  ExternalLink,
  Tag,
  CheckCircle2,
  BookmarkCheck,
} from "lucide-react";
import { ResearchGap } from "@/lib/api";

interface GapsTabProps {
  gaps: ResearchGap[];
  onNavigateToPaper: (paperId: string) => void;
}

export default function GapsTab({ gaps, onNavigateToPaper }: GapsTabProps) {
  const [filterQuery, setFilterQuery] = useState("");

  const getSeverityBadge = (idx: number) => {
    if (idx === 0) {
      return {
        label: "Critical Architecture Gap",
        class: "bg-red-500/15 text-red-400 border-red-500/30",
        icon: Flame,
      };
    } else if (idx === 1) {
      return {
        label: "Standardization Frontier",
        class: "bg-amber-500/15 text-amber-400 border-amber-500/30",
        icon: ShieldAlert,
      };
    }
    return {
      label: "High Novelty Opportunity",
      class: "bg-primary/15 text-primary border-primary/30",
      icon: Sparkles,
    };
  };

  const filteredGaps = gaps.filter((gap) => {
    const q = filterQuery.toLowerCase();
    if (!q) return true;
    return (
      gap.title.toLowerCase().includes(q) ||
      gap.description.toLowerCase().includes(q) ||
      gap.suggested_direction.toLowerCase().includes(q)
    );
  });

  if (!gaps || gaps.length === 0) {
    return (
      <div className="p-12 text-center rounded-2xl border border-border/50 bg-card/40 space-y-3">
        <Sparkles className="w-10 h-10 text-muted-foreground/50 mx-auto" />
        <h3 className="text-base font-semibold text-foreground">Deriving Literature Gaps</h3>
        <p className="text-xs text-muted-foreground max-w-sm mx-auto">
          The Gap Finding agent is clustering recurring limitations across analyzed papers into actionable frontiers.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      {/* ── Flagship Callout Banner ── */}
      <div className="relative overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-r from-card via-card/90 to-primary/5 p-6 sm:p-8 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1.5 max-w-2xl">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-primary/15 text-primary border border-primary/30 mb-1">
              <Sparkles className="w-3.5 h-3.5" />
              Flagship Differentiation
            </div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              Synthesized Literature Research Gaps
            </h2>
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
              Unlike traditional search engines that simply summarize existing papers, ResearchMate clusters recurring omissions and derives unaddressed frontiers backed by verifiable citation evidence trails.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="px-4 py-3 rounded-xl bg-secondary/80 border border-border/60 text-center">
              <span className="block text-2xl font-bold font-mono text-primary">
                {gaps.length}
              </span>
              <span className="text-[11px] text-muted-foreground uppercase tracking-wider">
                Gaps Derived
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Gaps List ── */}
      <div className="space-y-6">
        {filteredGaps.map((gap, index) => {
          const badge = getSeverityBadge(index);
          const BadgeIcon = badge.icon;

          return (
            <div
              key={gap.id || index}
              className="relative rounded-2xl border border-border/70 bg-card/80 p-6 sm:p-8 space-y-6 shadow-md transition-all hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5"
            >
              {/* Header: Badge & Title */}
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${badge.class}`}
                  >
                    <BadgeIcon className="w-3.5 h-3.5" />
                    {badge.label}
                  </span>

                  <span className="text-xs font-mono text-muted-foreground">
                    GAP #{index + 1}
                  </span>
                </div>

                <h3 className="text-lg sm:text-xl font-bold text-foreground leading-snug">
                  {gap.title}
                </h3>
              </div>

              {/* Problem Description & Context */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Problem Context & Literature Omission
                </h4>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {gap.description}
                </p>
              </div>

              {/* ── Suggested Future Research Direction (Callout Card) ── */}
              <div className="relative overflow-hidden rounded-xl border border-primary/30 bg-gradient-to-br from-primary/10 via-secondary/40 to-card p-5 space-y-2.5">
                <div className="flex items-center gap-2 text-xs font-semibold text-primary">
                  <Compass className="w-4 h-4 shrink-0 text-primary" />
                  <span>Suggested Future Research Direction</span>
                </div>
                <p className="text-xs sm:text-sm text-foreground/90 leading-relaxed font-medium">
                  {gap.suggested_direction}
                </p>
              </div>

              {/* ── Evidence Trail Section ── */}
              <div className="pt-4 border-t border-border/50 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <BookmarkCheck className="w-3.5 h-3.5 text-primary" />
                    Evidence Trail: Supporting Literature ({gap.supporting_papers?.length || 0})
                  </h4>
                  <span className="text-[11px] text-muted-foreground/60">
                    Click to inspect in Papers tab
                  </span>
                </div>

                <div className="flex flex-wrap gap-2.5">
                  {gap.supporting_papers?.map((paper) => (
                    <button
                      key={paper.id}
                      onClick={() => onNavigateToPaper(paper.id)}
                      className="group flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium border border-border/60 bg-secondary/40 text-foreground/80 hover:text-primary hover:border-primary/50 hover:bg-secondary transition-all text-left max-w-md"
                      title={`Inspect paper: ${paper.title}`}
                    >
                      <FileText className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary shrink-0 transition-colors" />
                      <span className="line-clamp-1 flex-1">{paper.title}</span>
                      <ArrowRight className="w-3 h-3 text-muted-foreground/40 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
