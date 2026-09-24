"use client";

import React, { useState, useMemo } from "react";
import {
  FileText,
  ChevronDown,
  ChevronUp,
  Search,
  BookOpen,
  Calendar,
  Users,
  ExternalLink,
  Lock,
  Unlock,
  AlertTriangle,
  Cpu,
  Database,
  Award,
  Sparkles,
  Maximize2,
  Minimize2,
  Download,
} from "lucide-react";
import { PaperWithAnalysis, getPaperDownloadUrl } from "@/lib/api";

interface PapersTabProps {
  papers: PaperWithAnalysis[];
  projectId?: string;
  selectedPaperId?: string | null;
  onPaperSelect?: (paperId: string) => void;
}

export default function PapersTab({
  papers,
  projectId,
  selectedPaperId,
  onPaperSelect,
}: PapersTabProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    // If a paper is selected initially, expand it
    return selectedPaperId ? new Set([selectedPaperId]) : new Set(papers.slice(0, 1).map((p) => p.id));
  });

  // When selectedPaperId changes externally (e.g. from Gaps tab), expand and scroll to it
  React.useEffect(() => {
    if (selectedPaperId) {
      setExpandedIds((prev) => new Set([...prev, selectedPaperId]));
      const el = document.getElementById(`paper-card-${selectedPaperId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, [selectedPaperId]);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    if (onPaperSelect) onPaperSelect(id);
  };

  const handleExpandAll = () => {
    setExpandedIds(new Set(papers.map((p) => p.id)));
  };

  const handleCollapseAll = () => {
    setExpandedIds(new Set());
  };

  // Filter papers
  const filteredPapers = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return papers;
    return papers.filter((p) => {
      const inTitle = p.title.toLowerCase().includes(q);
      const inAuthors = p.authors.some((a) => a.toLowerCase().includes(q));
      const inMethod = p.analysis?.methodology?.toLowerCase().includes(q);
      const inProblem = p.analysis?.problem?.toLowerCase().includes(q);
      return inTitle || inAuthors || inMethod || inProblem;
    });
  }, [papers, searchQuery]);

  if (!papers || papers.length === 0) {
    return (
      <div className="p-12 text-center rounded-2xl border border-border/50 bg-card/40 space-y-3">
        <BookOpen className="w-10 h-10 text-muted-foreground/50 mx-auto" />
        <h3 className="text-base font-semibold text-foreground">No Papers Analyzed Yet</h3>
        <p className="text-xs text-muted-foreground max-w-sm mx-auto">
          The candidate extraction agent is currently retrieving and processing papers for this research topic.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Toolbar: Search & Expand Controls ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl border border-border/60 bg-card/60">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-muted-foreground absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search papers by title, author, or methodology..."
            className="w-full bg-secondary/50 border border-border/50 rounded-xl pl-9 pr-4 py-2 text-xs sm:text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-primary/60 transition-colors"
          />
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground mr-2 font-mono">
            {filteredPapers.length} of {papers.length} papers
          </span>
          <button
            onClick={handleExpandAll}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border/50 bg-secondary/40 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <Maximize2 className="w-3 h-3" />
            Expand All
          </button>
          <button
            onClick={handleCollapseAll}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border/50 bg-secondary/40 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <Minimize2 className="w-3 h-3" />
            Collapse
          </button>
        </div>
      </div>

      {/* ── Paper Cards List ── */}
      <div className="space-y-4">
        {filteredPapers.map((paper) => {
          const isExpanded = expandedIds.has(paper.id);
          const isSelected = selectedPaperId === paper.id;

          return (
            <div
              key={paper.id}
              id={`paper-card-${paper.id}`}
              className={`rounded-2xl border transition-all duration-300 overflow-hidden ${
                isSelected
                  ? "border-primary ring-2 ring-primary/40 bg-card shadow-lg shadow-primary/10"
                  : "border-border/60 bg-card/70 hover:border-border"
              }`}
            >
              {/* Card Header (clickable) */}
              <div
                onClick={() => toggleExpand(paper.id)}
                className="p-5 sm:p-6 cursor-pointer flex flex-col gap-3 select-none transition-colors hover:bg-secondary/20"
              >
                <div className="flex items-start justify-between gap-4">
                  {/* Title & Metadata */}
                  <div className="space-y-2 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Source Badge */}
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-primary/15 text-primary border border-primary/30">
                        {paper.source || "Academic"}
                      </span>

                      {/* Year */}
                      <span className="inline-flex items-center gap-1 text-[11px] font-mono text-muted-foreground">
                        <Calendar className="w-3 h-3" />
                        {paper.year}
                      </span>

                      {/* Open Access Indicator */}
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${
                          paper.oa_status
                            ? "bg-success/10 text-success border-success/30"
                            : "bg-secondary text-muted-foreground border-border/60"
                        }`}
                      >
                        {paper.oa_status ? (
                          <>
                            <Unlock className="w-2.5 h-2.5" />
                            Open Access
                          </>
                        ) : (
                          <>
                            <Lock className="w-2.5 h-2.5" />
                            Restricted
                          </>
                        )}
                      </span>
                    </div>

                    <h3 className="text-base sm:text-lg font-bold text-foreground leading-snug group-hover:text-primary transition-colors">
                      {paper.title}
                    </h3>

                    {/* Authors */}
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Users className="w-3.5 h-3.5 shrink-0 text-muted-foreground/70" />
                      <span>{paper.authors.join(", ")}</span>
                    </div>

                    {/* Paper Download & Reference Actions */}
                    <div
                      className="flex flex-wrap items-center gap-2 pt-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {paper.pdf_url && (
                        <a
                          href={paper.pdf_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 transition-colors shadow-2xs"
                          title="Open or Download original Open-Access PDF"
                        >
                          <Download className="w-3 h-3" />
                          <span>Download PDF</span>
                        </a>
                      )}

                      {projectId && (
                        <a
                          href={getPaperDownloadUrl(projectId, paper.id, "text")}
                          download
                          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold bg-secondary/80 hover:bg-secondary text-slate-700 dark:text-slate-300 border border-border/60 transition-colors shadow-2xs"
                          title="Download extracted paper analysis and text (.txt)"
                        >
                          <FileText className="w-3 h-3" />
                          <span>Extracted Content</span>
                        </a>
                      )}

                      {paper.doi && (
                        <a
                          href={`https://doi.org/${paper.doi}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/60 border border-border/40 transition-colors shadow-2xs"
                          title="View Paper Record via DOI"
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span>DOI</span>
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Toggle Arrow */}
                  <button
                    type="button"
                    aria-label="Toggle paper analysis"
                    className="p-2 rounded-xl bg-secondary/50 text-muted-foreground hover:text-foreground border border-border/40 transition-colors shrink-0"
                  >
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* ── Expandable Drawer (Structured Analysis) ── */}
              {isExpanded && paper.analysis && (
                <div className="px-5 pb-6 pt-2 border-t border-border/50 bg-secondary/15 space-y-4 animate-fade-in">
                  <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 pt-1">
                    <Sparkles className="w-3.5 h-3.5 text-primary" />
                    Autonomous Multi-Agent Extraction
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Problem Statement */}
                    <div className="p-4 rounded-xl border border-destructive/20 bg-destructive/5 space-y-1.5">
                      <div className="flex items-center gap-2 text-xs font-semibold text-destructive">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        <span>Problem Statement</span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {paper.analysis.problem || "No problem statement extracted."}
                      </p>
                    </div>

                    {/* Methodology */}
                    <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 space-y-1.5">
                      <div className="flex items-center gap-2 text-xs font-semibold text-primary">
                        <Cpu className="w-3.5 h-3.5 shrink-0" />
                        <span>Methodology Paradigm</span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {paper.analysis.methodology || "No methodology extracted."}
                      </p>
                    </div>

                    {/* Dataset & Benchmarks */}
                    <div className="p-4 rounded-xl border border-blue-500/20 bg-blue-500/5 space-y-1.5">
                      <div className="flex items-center gap-2 text-xs font-semibold text-blue-400">
                        <Database className="w-3.5 h-3.5 shrink-0" />
                        <span>Dataset & Benchmarks</span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {paper.analysis.dataset || "No dataset specifications extracted."}
                      </p>
                    </div>

                    {/* Key Results */}
                    <div className="p-4 rounded-xl border border-success/20 bg-success/5 space-y-1.5">
                      <div className="flex items-center gap-2 text-xs font-semibold text-success">
                        <Award className="w-3.5 h-3.5 shrink-0" />
                        <span>Key Results & Performance</span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {paper.analysis.results || "No results metrics recorded."}
                      </p>
                    </div>
                  </div>

                  {/* Known Limitations & Future Work (Full Width) */}
                  <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/5 space-y-2">
                    <div className="flex items-center gap-2 text-xs font-semibold text-amber-400">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      <span>Known Limitations & Unaddressed Boundaries</span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {paper.analysis.limitations || "No limitations recorded."}
                    </p>

                    {paper.analysis.future_work && (
                      <div className="pt-2 border-t border-amber-500/20 mt-2">
                        <span className="text-[11px] font-semibold text-amber-300">
                          Proposed Future Work:
                        </span>{" "}
                        <span className="text-xs text-muted-foreground">
                          {paper.analysis.future_work}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
