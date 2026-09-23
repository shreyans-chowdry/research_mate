"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import {
  Search,
  BookOpen,
  FileText,
  GitCompare,
  Sparkles,
  FileCheck2,
  CheckCircle2,
  Loader2,
  Circle,
  AlertCircle,
  RefreshCw,
  Copy,
  Check,
  ArrowLeft,
  Clock,
  Layers,
  Terminal,
} from "lucide-react";
import { ResearchStatus } from "@/lib/api";

export interface AgentStepDef {
  id: string;
  name: string;
  agentName: string;
  description: string;
  backendStatus: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const AGENT_STEPS: AgentStepDef[] = [
  {
    id: "query-generation",
    name: "Search Query Generation",
    agentName: "Query Agent",
    description: "Deconstructing topic into multi-angle academic search queries",
    backendStatus: "pending",
    icon: Search,
  },
  {
    id: "paper-retrieval",
    name: "Paper Retrieval (OpenAlex & Semantic Scholar)",
    agentName: "Retrieval Agent",
    description: "Harvesting peer-reviewed literature and open-access metadata",
    backendStatus: "searching",
    icon: BookOpen,
  },
  {
    id: "deep-extraction",
    name: "Deep Content Extraction & Parsing",
    agentName: "Extraction Agent",
    description: "Extracting problem statements, methodologies, benchmarks & limitations",
    backendStatus: "analyzing",
    icon: FileText,
  },
  {
    id: "comparative-analysis",
    name: "Cross-Paper Comparative Analysis",
    agentName: "Comparison Agent",
    description: "Cross-referencing methodology paradigms, datasets, and benchmark results",
    backendStatus: "comparing",
    icon: GitCompare,
  },
  {
    id: "gap-synthesis",
    name: "Research Gap Synthesis & Evidence Correlation",
    agentName: "Synthesis Agent",
    description: "Clustering unaddressed limitations into explicit evidence-backed gaps",
    backendStatus: "gap_finding",
    icon: Sparkles,
  },
  {
    id: "report-compilation",
    name: "Executive Report Compilation",
    agentName: "Reporting Agent",
    description: "Synthesizing full academic report with structured citation evidence trails",
    backendStatus: "reporting",
    icon: FileCheck2,
  },
];

const ORDERED_STATUSES = [
  "pending",
  "searching",
  "analyzing",
  "comparing",
  "gap_finding",
  "reporting",
  "done",
];

interface AgentTrackerProps {
  projectId: string;
  status: ResearchStatus | null;
  isLoading: boolean;
  error: string | null;
  elapsedSeconds: number;
  onRetry: () => void;
}

export default function AgentTracker({
  projectId,
  status,
  isLoading,
  error,
  elapsedSeconds,
  onRetry,
}: AgentTrackerProps) {
  const [copied, setCopied] = React.useState(false);

  const handleCopyId = () => {
    navigator.clipboard.writeText(projectId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const currentBackendStatus = status?.status || "pending";
  const isDone = currentBackendStatus === "done";
  const isError = currentBackendStatus === "error" || Boolean(error);

  // Determine active step index (0-5)
  const currentStepIndex = useMemo(() => {
    if (isDone) return 6; // all completed
    const idx = ORDERED_STATUSES.indexOf(currentBackendStatus);
    return idx >= 0 ? idx : 0;
  }, [currentBackendStatus, isDone]);

  // Compute status for each step
  const stepStates = useMemo(() => {
    return AGENT_STEPS.map((step, idx) => {
      if (isDone) return "completed";
      if (idx < currentStepIndex) return "completed";
      if (idx === currentStepIndex) return isError ? "error" : "active";
      return "pending";
    });
  }, [currentStepIndex, isDone, isError]);

  const activeStep = AGENT_STEPS[Math.min(currentStepIndex, AGENT_STEPS.length - 1)];

  // Formatted timer
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Dynamic paper counter during extraction
  const papersFound = status?.papers_found || 0;
  const papersAnalyzed = status?.papers_analyzed || 0;
  const analysisProgress =
    papersFound > 0 ? Math.min(100, Math.round((papersAnalyzed / papersFound) * 100)) : 0;

  return (
    <div className="w-full max-w-5xl mx-auto space-y-8 animate-fade-in">
      {/* ── Top Navigation & Meta Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-border/50">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/70 border border-border/40 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            New Research
          </Link>

          {/* Project ID Tag */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono bg-card border border-border/60 text-muted-foreground">
            <span className="text-muted-foreground/60">ID:</span>
            <span className="text-foreground font-semibold">
              {projectId.length > 18 ? `${projectId.slice(0, 10)}...${projectId.slice(-6)}` : projectId}
            </span>
            <button
              onClick={handleCopyId}
              className="ml-1 p-0.5 hover:text-foreground transition-colors"
              title="Copy Project ID"
              aria-label="Copy Project ID"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-success" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>

        {/* Status Pill & Timer */}
        <div className="flex items-center gap-3">
          {/* Live Timer */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono text-muted-foreground bg-secondary/30 border border-border/40">
            <Clock className="w-3.5 h-3.5 text-primary" />
            <span>{formatTime(elapsedSeconds)}</span>
          </div>

          {/* Status Badge */}
          <div
            className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all duration-300 ${
              isDone
                ? "bg-success/10 border-success/30 text-success"
                : isError
                ? "bg-destructive/10 border-destructive/30 text-destructive"
                : "bg-primary/10 border-primary/30 text-primary animate-pulse"
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isDone
                  ? "bg-success"
                  : isError
                  ? "bg-destructive"
                  : "bg-primary animate-ping"
              }`}
            />
            {isDone
              ? "Synthesis Complete"
              : isError
              ? "Execution Interrupted"
              : "Agents Active"}
          </div>
        </div>
      </div>

      {/* ── Error Banner ── */}
      {isError && (
        <div
          className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 rounded-2xl border border-destructive/40 bg-destructive/10 text-destructive animate-fade-in"
          role="alert"
          id="pipeline-error-alert"
        >
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-destructive" />
            <div>
              <h4 className="font-semibold text-sm">Pipeline Execution Error</h4>
              <p className="text-xs text-destructive/80 mt-1 leading-relaxed">
                {error ||
                  (status as any)?.error_message ||
                  "The autonomous agent pipeline encountered an issue communicating with the research services."}
              </p>
            </div>
          </div>
          <button
            onClick={onRetry}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-destructive text-white hover:bg-destructive/90 transition-colors shadow-sm shrink-0"
            id="retry-button"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry Pipeline
          </button>
        </div>
      )}

      {/* ── Active Agent Spotlight Card ── */}
      <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-gradient-to-br from-card via-card/90 to-secondary/30 p-6 sm:p-8 shadow-xl">
        {/* Glow ambient background effect */}
        <div className="absolute -top-24 -right-24 w-64 h-64 bg-primary/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold tracking-wider uppercase text-primary">
              <Layers className="w-4 h-4" />
              <span>Current Agent Step ({Math.min(currentStepIndex + 1, 6)} of 6)</span>
            </div>

            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
              {isDone ? (
                <>
                  <span className="text-success">All Research Agents Finished</span>
                  <CheckCircle2 className="w-7 h-7 text-success shrink-0" />
                </>
              ) : (
                <>
                  <span>{activeStep.name}</span>
                  {!isError && (
                    <Loader2 className="w-6 h-6 text-primary animate-spin shrink-0" />
                  )}
                </>
              )}
            </h2>

            <p className="text-sm text-muted-foreground max-w-xl leading-relaxed">
              {isDone
                ? "Academic literature parsed, cross-paper trade-offs evaluated, and unaddressed research gaps derived with citation evidence trails."
                : status?.current_step || activeStep.description}
            </p>
          </div>

          {/* Dynamic extraction counter badge / done badge */}
          <div className="flex flex-col gap-2 shrink-0 md:text-right">
            {(currentBackendStatus === "analyzing" || papersFound > 0) && (
              <div className="p-4 rounded-xl bg-secondary/60 border border-border/60 min-w-[220px]">
                <div className="flex justify-between items-center text-xs font-medium text-muted-foreground mb-1.5">
                  <span>Paper Extraction</span>
                  <span className="text-foreground font-mono font-bold">
                    {papersAnalyzed}/{papersFound}
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-border overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-primary to-accent-foreground transition-all duration-500 ease-out"
                    style={{ width: `${analysisProgress}%` }}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground/80 mt-1.5 text-left">
                  Analyzed {papersAnalyzed} of {papersFound} candidate papers
                </p>
              </div>
            )}

            {isDone && (
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-success/15 border border-success/30 text-success text-xs font-semibold">
                <CheckCircle2 className="w-4 h-4" />
                Evidence trails ready for inspection
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── 6-Step Multi-Agent Stepper Visualizer ── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">
            Multi-Agent Execution Pipeline
          </h3>
          <span className="text-xs text-muted-foreground/70 font-mono">
            {isDone ? "6 / 6 Completed" : `${currentStepIndex} / 6 Completed`}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {AGENT_STEPS.map((step, idx) => {
            const state = stepStates[idx];
            const StepIcon = step.icon;

            const isStepActive = state === "active";
            const isStepCompleted = state === "completed";
            const isStepError = state === "error";

            return (
              <div
                key={step.id}
                className={`relative flex flex-col justify-between p-5 rounded-2xl border transition-all duration-300 ${
                  isStepActive
                    ? "bg-card border-primary/60 shadow-lg shadow-primary/10 ring-1 ring-primary/40"
                    : isStepCompleted
                    ? "bg-card/70 border-success/30 hover:border-success/50"
                    : isStepError
                    ? "bg-card/70 border-destructive/40"
                    : "bg-card/30 border-border/40 opacity-70"
                }`}
              >
                {/* Header: Step Number, Agent Name, State Icon */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${
                        isStepActive
                          ? "bg-primary/20 text-primary border border-primary/40"
                          : isStepCompleted
                          ? "bg-success/15 text-success border border-success/30"
                          : isStepError
                          ? "bg-destructive/15 text-destructive border border-destructive/30"
                          : "bg-secondary/60 text-muted-foreground/50 border border-border/40"
                      }`}
                    >
                      <StepIcon className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-[10px] font-mono tracking-wider text-muted-foreground uppercase">
                        Step 0{idx + 1} • {step.agentName}
                      </span>
                      <h4
                        className={`text-sm font-semibold leading-tight line-clamp-1 ${
                          isStepActive
                            ? "text-foreground"
                            : isStepCompleted
                            ? "text-foreground/90"
                            : "text-muted-foreground"
                        }`}
                      >
                        {step.name}
                      </h4>
                    </div>
                  </div>

                  {/* State Status Icon */}
                  <div className="shrink-0 mt-0.5">
                    {isStepCompleted && (
                      <CheckCircle2 className="w-5 h-5 text-success" />
                    )}
                    {isStepActive && (
                      <Loader2 className="w-5 h-5 text-primary animate-spin" />
                    )}
                    {isStepError && (
                      <AlertCircle className="w-5 h-5 text-destructive" />
                    )}
                    {!isStepCompleted && !isStepActive && !isStepError && (
                      <Circle className="w-4 h-4 text-border" />
                    )}
                  </div>
                </div>

                {/* Description */}
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {step.description}
                </p>

                {/* Footer State Tag */}
                <div className="mt-4 pt-3 border-t border-border/30 flex items-center justify-between text-[11px]">
                  <span
                    className={`font-medium ${
                      isStepActive
                        ? "text-primary"
                        : isStepCompleted
                        ? "text-success"
                        : isStepError
                        ? "text-destructive"
                        : "text-muted-foreground/60"
                    }`}
                  >
                    {isStepActive
                      ? "In Progress…"
                      : isStepCompleted
                      ? "Completed"
                      : isStepError
                      ? "Interrupted"
                      : "Pending"}
                  </span>

                  {idx === 2 && (isStepActive || isStepCompleted) && papersFound > 0 && (
                    <span className="font-mono text-muted-foreground">
                      {papersAnalyzed}/{papersFound} papers
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Live Agent Activity Terminal / Log ── */}
      <div className="rounded-2xl border border-border/60 bg-[#080b11] overflow-hidden shadow-md">
        <div className="flex items-center justify-between px-4 py-2.5 bg-secondary/50 border-b border-border/40">
          <div className="flex items-center gap-2">
            <Terminal className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-mono font-medium text-muted-foreground">
              agent-execution.log
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-border" />
            <div className="w-2.5 h-2.5 rounded-full bg-border" />
            <div className="w-2.5 h-2.5 rounded-full bg-border" />
          </div>
        </div>

        <div className="p-4 font-mono text-xs space-y-2 text-muted-foreground max-h-48 overflow-y-auto">
          <div className="flex items-start gap-2">
            <span className="text-primary/70">[{formatTime(Math.min(elapsedSeconds, 1))}]</span>
            <span className="text-foreground/80">QueryAgent: Initialized semantic research session for project {projectId}</span>
          </div>

          {currentStepIndex >= 1 && (
            <div className="flex items-start gap-2">
              <span className="text-primary/70">[{formatTime(Math.min(elapsedSeconds, 4))}]</span>
              <span className="text-foreground/80">
                RetrievalAgent: Connected to OpenAlex & Semantic Scholar — indexed candidate corpus
              </span>
            </div>
          )}

          {currentStepIndex >= 2 && (
            <div className="flex items-start gap-2">
              <span className="text-primary/70">[{formatTime(Math.min(elapsedSeconds, 8))}]</span>
              <span className="text-foreground/80">
                ExtractionAgent: PyMuPDF parsing active — {papersAnalyzed} papers extracted
              </span>
            </div>
          )}

          {currentStepIndex >= 3 && (
            <div className="flex items-start gap-2">
              <span className="text-primary/70">[{formatTime(Math.min(elapsedSeconds, 15))}]</span>
              <span className="text-foreground/80">
                ComparisonAgent: Evaluated cross-paper methodology & dataset trade-offs
              </span>
            </div>
          )}

          {currentStepIndex >= 4 && (
            <div className="flex items-start gap-2">
              <span className="text-primary/70">[{formatTime(Math.min(elapsedSeconds, 19))}]</span>
              <span className="text-foreground/80">
                SynthesisAgent: Synthesized recurring limitations into high-confidence research gaps
              </span>
            </div>
          )}

          {currentStepIndex >= 5 && (
            <div className="flex items-start gap-2">
              <span className="text-primary/70">[{formatTime(Math.min(elapsedSeconds, 23))}]</span>
              <span className="text-foreground/80">
                ReportingAgent: Markdown executive report compiled with evidence links
              </span>
            </div>
          )}

          {isDone && (
            <div className="flex items-start gap-2 text-success font-medium">
              <span>[{formatTime(elapsedSeconds)}]</span>
              <span>System: All multi-agent research pipelines completed successfully.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
