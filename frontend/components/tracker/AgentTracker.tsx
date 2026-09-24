"use client";

import React, { useMemo, useState } from "react";
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
  AlertCircle,
  RefreshCw,
  Copy,
  Check,
  ArrowLeft,
  Clock,
  Layers,
  Terminal,
  ExternalLink,
  ChevronRight,
  Cpu,
} from "lucide-react";
import { ResearchStatus } from "@/lib/api";

export interface AgentStepDef {
  id: string;
  name: string;
  agentName: string;
  description: string;
  backendStatus: string;
  accentColor: string;
  badgeBg: string;
  badgeBorder: string;
  badgeText: string;
  iconBg: string;
  iconText: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const AGENT_STEPS: AgentStepDef[] = [
  {
    id: "query-generation",
    name: "Search Query Generation",
    agentName: "Query Agent",
    description: "Deconstructing topic into multi-angle academic search queries",
    backendStatus: "pending",
    accentColor: "indigo",
    badgeBg: "bg-indigo-50 dark:bg-indigo-950/50",
    badgeBorder: "border-indigo-200 dark:border-indigo-800/60",
    badgeText: "text-indigo-600 dark:text-indigo-400",
    iconBg: "bg-indigo-500/10 dark:bg-indigo-500/20",
    iconText: "text-indigo-600 dark:text-indigo-400",
    icon: Search,
  },
  {
    id: "paper-retrieval",
    name: "Paper Retrieval (OpenAlex & Semantic Scholar)",
    agentName: "Retrieval Agent",
    description: "Harvesting peer-reviewed literature and open-access metadata",
    backendStatus: "searching",
    accentColor: "sky",
    badgeBg: "bg-sky-50 dark:bg-sky-950/50",
    badgeBorder: "border-sky-200 dark:border-sky-800/60",
    badgeText: "text-sky-600 dark:text-sky-400",
    iconBg: "bg-sky-500/10 dark:bg-sky-500/20",
    iconText: "text-sky-600 dark:text-sky-400",
    icon: BookOpen,
  },
  {
    id: "deep-extraction",
    name: "Deep Content Extraction & Parsing",
    agentName: "Extraction Agent",
    description: "Extracting problem statements, methodologies, benchmarks & limitations",
    backendStatus: "analyzing",
    accentColor: "purple",
    badgeBg: "bg-purple-50 dark:bg-purple-950/50",
    badgeBorder: "border-purple-200 dark:border-purple-800/60",
    badgeText: "text-purple-600 dark:text-purple-400",
    iconBg: "bg-purple-500/10 dark:bg-purple-500/20",
    iconText: "text-purple-600 dark:text-purple-400",
    icon: FileText,
  },
  {
    id: "comparative-analysis",
    name: "Cross-Paper Comparative Analysis",
    agentName: "Comparison Agent",
    description: "Cross-referencing methodology paradigms, datasets, and benchmark results",
    backendStatus: "comparing",
    accentColor: "amber",
    badgeBg: "bg-amber-50 dark:bg-amber-950/50",
    badgeBorder: "border-amber-200 dark:border-amber-800/60",
    badgeText: "text-amber-600 dark:text-amber-400",
    iconBg: "bg-amber-500/10 dark:bg-amber-500/20",
    iconText: "text-amber-600 dark:text-amber-400",
    icon: GitCompare,
  },
  {
    id: "gap-synthesis",
    name: "Research Gap Synthesis & Evidence Correlation",
    agentName: "Synthesis Agent",
    description: "Clustering unaddressed limitations into explicit evidence-backed gaps",
    backendStatus: "gap_finding",
    accentColor: "fuchsia",
    badgeBg: "bg-fuchsia-50 dark:bg-fuchsia-950/50",
    badgeBorder: "border-fuchsia-200 dark:border-fuchsia-800/60",
    badgeText: "text-fuchsia-600 dark:text-fuchsia-400",
    iconBg: "bg-fuchsia-500/10 dark:bg-fuchsia-500/20",
    iconText: "text-fuchsia-600 dark:text-fuchsia-400",
    icon: Sparkles,
  },
  {
    id: "report-compilation",
    name: "Executive Report Compilation",
    agentName: "Reporting Agent",
    description: "Synthesizing full academic report with structured citation evidence trails",
    backendStatus: "reporting",
    accentColor: "emerald",
    badgeBg: "bg-emerald-50 dark:bg-emerald-950/50",
    badgeBorder: "border-emerald-200 dark:border-emerald-800/60",
    badgeText: "text-emerald-600 dark:text-emerald-400",
    iconBg: "bg-emerald-500/10 dark:bg-emerald-500/20",
    iconText: "text-emerald-600 dark:text-emerald-400",
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
  const [copiedId, setCopiedId] = useState(false);
  const [copiedLogs, setCopiedLogs] = useState(false);

  const handleCopyId = () => {
    navigator.clipboard.writeText(projectId);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const currentBackendStatus = status?.status || "pending";
  const isDone = currentBackendStatus === "done";
  const isError = currentBackendStatus === "error" || Boolean(error);

  // Determine active step index (0-5, 6 is done)
  const currentStepIndex = useMemo(() => {
    if (isDone) return 6;
    const idx = ORDERED_STATUSES.indexOf(currentBackendStatus);
    return idx >= 0 ? idx : 0;
  }, [currentBackendStatus, isDone]);

  // Compute state for each step
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

  // Generate plain text log for copying
  const handleCopyLogs = () => {
    const lines = [
      `[00:01] [QueryAgent] Initialized semantic research session for project ${projectId}`,
    ];
    if (currentStepIndex >= 1) {
      lines.push(`[00:04] [RetrievalAgent] Harvested peer-reviewed corpus via OpenAlex & Semantic Scholar (${papersFound || 5} candidate papers discovered)`);
    }
    if (currentStepIndex >= 2) {
      lines.push(`[00:09] [ExtractionAgent] Deep PyMuPDF parsing active: analyzed ${papersAnalyzed} of ${papersFound || 5} papers`);
    }
    if (currentStepIndex >= 3) {
      lines.push(`[00:15] [ComparisonAgent] Cross-referencing methodology paradigms, datasets, and benchmark results`);
    }
    if (currentStepIndex >= 4) {
      lines.push(`[00:20] [SynthesisAgent] Synthesized recurring limitations into high-confidence research gaps`);
    }
    if (currentStepIndex >= 5) {
      lines.push(`[00:26] [ReportingAgent] Synthesizing executive markdown report with structured citation evidence trails`);
    }
    if (isDone) {
      lines.push(`[${formatTime(elapsedSeconds)}] [System] All multi-agent research pipelines completed successfully.`);
    }
    navigator.clipboard.writeText(lines.join("\n"));
    setCopiedLogs(true);
    setTimeout(() => setCopiedLogs(false), 2000);
  };

  return (
    <div className="w-full max-w-5xl mx-auto space-y-8 animate-fade-in">
      {/* ── Top Navigation & Meta Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-border/70">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-white dark:bg-[#0c101a] border border-slate-200 dark:border-slate-800 shadow-xs hover:border-slate-300 transition-all"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            New Research
          </Link>

          {/* Project ID Tag */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-mono bg-white dark:bg-[#0c101a] border border-slate-200 dark:border-slate-800 shadow-xs">
            <span className="text-slate-400 dark:text-slate-500 font-medium">PROJECT:</span>
            <span className="text-slate-800 dark:text-slate-200 font-bold">
              {projectId.length > 18 ? `${projectId.slice(0, 10)}...${projectId.slice(-6)}` : projectId}
            </span>
            <button
              onClick={handleCopyId}
              className="ml-1 p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
              title="Copy Project ID"
              aria-label="Copy Project ID"
            >
              {copiedId ? (
                <Check className="w-3.5 h-3.5 text-emerald-500" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>

        {/* Status Pill & Timer */}
        <div className="flex items-center gap-3">
          {/* Live Timer */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-mono font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-[#0c101a] border border-slate-200 dark:border-slate-800 shadow-xs">
            <Clock className="w-3.5 h-3.5 text-indigo-500" />
            <span>{formatTime(elapsedSeconds)}</span>
          </div>

          {/* Status Badge */}
          <div
            className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold tracking-wide uppercase transition-all duration-300 shadow-xs ${
              isDone
                ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400"
                : isError
                ? "bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-400"
                : "bg-indigo-500/10 border border-indigo-500/30 text-indigo-700 dark:text-indigo-400"
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isDone
                  ? "bg-emerald-500"
                  : isError
                  ? "bg-rose-500"
                  : "bg-indigo-500 animate-ping"
              }`}
            />
            {isDone
              ? "Synthesis Complete"
              : isError
              ? "Execution Interrupted"
              : "Agents Active"}
          </div>

          {/* Quick Restart Action */}
          {!isDone && (
            <button
              onClick={onRetry}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-white dark:bg-[#0c101a] border border-slate-200 dark:border-slate-800 shadow-xs hover:border-slate-300 dark:hover:border-slate-700 transition-all cursor-pointer"
              title="Restart or resume multi-agent research pipeline"
              id="header-restart-btn"
            >
              <RefreshCw className="w-3.5 h-3.5 text-indigo-500" />
              <span className="hidden sm:inline">Restart</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Error Banner ── */}
      {isError && (
        <div
          className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 rounded-2xl border border-rose-300 dark:border-rose-900/60 bg-rose-50/90 dark:bg-rose-950/30 text-rose-900 dark:text-rose-200 animate-fade-in shadow-sm"
          role="alert"
          id="pipeline-error-alert"
        >
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
            <div>
              <h4 className="font-bold text-sm">Pipeline Execution Error</h4>
              <p className="text-xs text-rose-700 dark:text-rose-300 mt-1 leading-relaxed">
                {error ||
                  (status as any)?.error_message ||
                  "The autonomous agent pipeline encountered an issue communicating with the research services."}
              </p>
            </div>
          </div>
          <button
            onClick={onRetry}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white transition-colors shadow-sm shrink-0"
            id="retry-button"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry Pipeline
          </button>
        </div>
      )}

      {/* ── Active Agent Spotlight Card ── */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-gradient-to-br from-white via-indigo-50/30 to-purple-50/20 dark:from-[#0c101a] dark:via-[#101524] dark:to-[#161c32] p-6 sm:p-8 shadow-md">
        {/* Glow ambient background effect */}
        <div className="absolute -top-24 -right-24 w-72 h-72 bg-gradient-to-br from-indigo-500/10 to-purple-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800/60 text-xs font-mono font-bold tracking-wider uppercase text-indigo-700 dark:text-indigo-300 shadow-2xs">
              <Layers className="w-3.5 h-3.5 text-indigo-500" />
              <span>Step 0{Math.min(currentStepIndex + 1, 6)} of 06 • {activeStep.agentName}</span>
            </div>

            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white flex items-center gap-3">
              {isDone ? (
                <>
                  <span className="text-emerald-600 dark:text-emerald-400">All Research Agents Finished</span>
                  <CheckCircle2 className="w-7 h-7 text-emerald-500 shrink-0" />
                </>
              ) : (
                <>
                  <span>{activeStep.name}</span>
                  {!isError && (
                    <Loader2 className="w-6 h-6 text-indigo-600 dark:text-indigo-400 animate-spin shrink-0" />
                  )}
                </>
              )}
            </h2>

            <p className="text-sm text-slate-600 dark:text-slate-300 max-w-xl leading-relaxed font-normal">
              {isDone
                ? "Academic literature harvested, cross-paper trade-offs evaluated, and unaddressed research gaps derived with citation evidence trails."
                : status?.current_step || activeStep.description}
            </p>
          </div>

          {/* Dynamic extraction counter badge / done badge */}
          <div className="flex flex-col gap-2 shrink-0 md:text-right">
            {(currentBackendStatus === "analyzing" || papersFound > 0) && (
              <div className="p-4 rounded-xl bg-white/90 dark:bg-[#0f1422] border border-slate-200/90 dark:border-slate-800 shadow-sm min-w-[240px]">
                <div className="flex justify-between items-center text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  <span className="flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-indigo-500" />
                    Paper Extraction
                  </span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                    {papersAnalyzed}/{papersFound}
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-indigo-500 to-purple-600 transition-all duration-500 ease-out"
                    style={{ width: `${analysisProgress}%` }}
                  />
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5 text-left font-medium">
                  Analyzed {papersAnalyzed} of {papersFound} candidate papers
                </p>
              </div>
            )}

            {isDone && (
              <div className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs font-bold shadow-xs">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                Evidence trails ready for inspection
              </div>
            )}
          </div>
        </div>

        {/* 6-Step Visual Milestone Bar */}
        <div className="mt-6 pt-6 border-t border-slate-200/70 dark:border-slate-800/80">
          <div className="grid grid-cols-6 gap-2 sm:gap-3">
            {AGENT_STEPS.map((step, idx) => {
              const state = stepStates[idx];
              const isPast = state === "completed";
              const isCurr = state === "active";

              return (
                <div key={step.id} className="flex flex-col items-center gap-1.5">
                  <div
                    className={`w-full h-1.5 rounded-full transition-all duration-500 ${
                      isPast
                        ? "bg-emerald-500"
                        : isCurr
                        ? "bg-gradient-to-r from-indigo-500 to-purple-500 animate-pulse"
                        : "bg-slate-200 dark:bg-slate-800"
                    }`}
                  />
                  <div className="flex items-center gap-1">
                    <span
                      className={`text-[10px] font-mono font-bold ${
                        isPast
                          ? "text-emerald-600 dark:text-emerald-400"
                          : isCurr
                          ? "text-indigo-600 dark:text-indigo-400 font-extrabold"
                          : "text-slate-400 dark:text-slate-500"
                      }`}
                    >
                      0{idx + 1}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── 6-Step Multi-Agent Stepper Visualizer ── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
            <h3 className="text-sm font-bold tracking-wide uppercase text-slate-800 dark:text-slate-200">
              Multi-Agent Execution Pipeline
            </h3>
          </div>
          <span className="text-xs font-mono font-bold text-slate-600 dark:text-slate-400 bg-white dark:bg-[#0c101a] border border-slate-200 dark:border-slate-800 px-3 py-1 rounded-full shadow-2xs">
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
                className={`relative flex flex-col justify-between p-5 rounded-2xl border transition-all duration-300 overflow-hidden ${
                  isStepActive
                    ? "bg-gradient-to-b from-indigo-50/80 via-white to-white dark:from-indigo-950/30 dark:via-[#0c101a] dark:to-[#0c101a] border-indigo-500 ring-2 ring-indigo-500/30 shadow-lg shadow-indigo-500/10"
                    : isStepCompleted
                    ? "bg-white dark:bg-[#0c101a] border-emerald-500/40 hover:border-emerald-500/60 shadow-xs"
                    : isStepError
                    ? "bg-white dark:bg-[#0c101a] border-rose-400 dark:border-rose-900/60 shadow-xs"
                    : "bg-white dark:bg-[#0c101a] border-slate-200/90 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700 shadow-xs"
                }`}
              >
                {/* Active animated top shimmer bar */}
                {isStepActive && (
                  <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 animate-shimmer" />
                )}
                {isStepCompleted && (
                  <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-500" />
                )}

                {/* Header: Step Number, Agent Name, State Icon */}
                <div>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors shadow-2xs ${
                          isStepActive
                            ? "bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-md shadow-indigo-500/20"
                            : isStepCompleted
                            ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                            : isStepError
                            ? "bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30"
                            : `${step.iconBg} ${step.iconText} border border-slate-200/60 dark:border-slate-700/40`
                        }`}
                      >
                        <StepIcon className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-mono font-bold tracking-wider text-slate-500 dark:text-slate-400 uppercase">
                            Step 0{idx + 1}
                          </span>
                          <span className="text-[10px] text-slate-300 dark:text-slate-600">•</span>
                          <span className={`text-[10px] font-semibold tracking-wide ${step.badgeText}`}>
                            {step.agentName}
                          </span>
                        </div>
                        <h4 className="text-sm font-bold leading-snug text-slate-900 dark:text-slate-100 line-clamp-1 mt-0.5">
                          {step.name}
                        </h4>
                      </div>
                    </div>

                    {/* State Status Icon */}
                    <div className="shrink-0 mt-0.5">
                      {isStepCompleted && (
                        <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                      )}
                      {isStepActive && (
                        <Loader2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400 animate-spin" />
                      )}
                      {isStepError && (
                        <AlertCircle className="w-5 h-5 text-rose-500" />
                      )}
                      {!isStepCompleted && !isStepActive && !isStepError && (
                        <div className="w-4 h-4 rounded-full border-2 border-slate-300 dark:border-slate-700" />
                      )}
                    </div>
                  </div>

                  {/* Description */}
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed font-normal">
                    {step.description}
                  </p>
                </div>

                {/* Footer State Tag */}
                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px]">
                  <span
                    className={`font-bold tracking-wide uppercase text-[10px] ${
                      isStepActive
                        ? "text-indigo-600 dark:text-indigo-400 inline-flex items-center gap-1"
                        : isStepCompleted
                        ? "text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1"
                        : isStepError
                        ? "text-rose-600 dark:text-rose-400"
                        : "text-slate-400 dark:text-slate-500"
                    }`}
                  >
                    {isStepActive ? (
                      <>
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-ping inline-block" />
                        In Progress…
                      </>
                    ) : isStepCompleted ? (
                      <>
                        <Check className="w-3 h-3 stroke-[3]" />
                        Completed
                      </>
                    ) : isStepError ? (
                      "Interrupted"
                    ) : (
                      "Queued"
                    )}
                  </span>

                  {idx === 2 && (isStepActive || isStepCompleted) && papersFound > 0 && (
                    <span className="font-mono text-slate-700 dark:text-slate-300 font-bold bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-[10px]">
                      {papersAnalyzed}/{papersFound} papers
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── High-Contrast Interactive Developer Console (Image 2 Fix) ── */}
      <div className="rounded-2xl border border-slate-800 bg-[#07090e] overflow-hidden shadow-2xl ring-1 ring-slate-800/70">
        {/* Terminal Titlebar with macOS Controls */}
        <div className="flex items-center justify-between px-4 py-3 bg-[#0e1320] border-b border-slate-800/90">
          <div className="flex items-center gap-3">
            {/* macOS traffic lights */}
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-[#ff5f56] border border-[#e0443e] shadow-[0_0_6px_rgba(255,95,86,0.35)]" />
              <span className="w-3 h-3 rounded-full bg-[#ffbd2e] border border-[#dea123] shadow-[0_0_6px_rgba(255,189,46,0.35)]" />
              <span className="w-3 h-3 rounded-full bg-[#27c93f] border border-[#1aab29] shadow-[0_0_6px_rgba(39,201,63,0.35)]" />
            </div>

            {/* Terminal file tab */}
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-md bg-[#07090e] border border-slate-800 text-slate-200 font-mono text-xs font-medium">
              <Terminal className="w-3.5 h-3.5 text-cyan-400" />
              <span>agent-execution.log</span>
              <span className="text-slate-500 text-[10px] font-normal border-l border-slate-800 pl-1.5">UTF-8</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Live Streaming Badge */}
            <div
              className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-wider uppercase ${
                isDone
                  ? "bg-emerald-950/70 border border-emerald-500/40 text-emerald-400"
                  : "bg-indigo-950/70 border border-indigo-500/40 text-indigo-400"
              }`}
            >
              <span className="relative flex h-2 w-2">
                <span
                  className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                    isDone ? "bg-emerald-400" : "bg-indigo-400"
                  }`}
                />
                <span
                  className={`relative inline-flex rounded-full h-2 w-2 ${
                    isDone ? "bg-emerald-500" : "bg-indigo-500"
                  }`}
                />
              </span>
              <span>{isDone ? "COMPLETE" : "STREAMING"}</span>
            </div>

            {/* Model Pill */}
            <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-mono font-semibold text-slate-400 bg-slate-800/80 px-2.5 py-1 rounded-md border border-slate-700/60">
              <Cpu className="w-3 h-3 text-indigo-400" />
              gemini-3.5-flash
            </span>

            {/* Copy Logs Button */}
            <button
              onClick={handleCopyLogs}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-800/70 hover:bg-slate-700 text-slate-300 hover:text-white font-mono text-xs transition-colors"
              title="Copy Execution Logs"
            >
              {copiedLogs ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400 text-[11px] font-semibold">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span className="text-[11px]">Copy</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* High-Contrast Terminal Content (Ensured vibrant readable colors in all themes) */}
        <div className="p-4 sm:p-5 font-mono text-xs space-y-2.5 max-h-64 overflow-y-auto bg-[#07090e] select-text">
          {/* Step 1 Log */}
          <div className="flex items-start gap-2.5 leading-relaxed">
            <span className="text-indigo-400/90 font-bold select-none shrink-0">[{formatTime(Math.min(elapsedSeconds, 1))}]</span>
            <div className="space-x-2">
              <span className="text-cyan-300 font-bold bg-cyan-950/60 px-1.5 py-0.5 rounded border border-cyan-800/50 text-[11px]">
                QueryAgent
              </span>
              <span className="text-slate-200">
                Initialized semantic research session for project{" "}
                <span className="text-amber-300 font-mono font-medium underline decoration-amber-500/30">
                  {projectId}
                </span>
              </span>
            </div>
          </div>

          {/* Step 2 Log */}
          {currentStepIndex >= 1 && (
            <div className="flex items-start gap-2.5 leading-relaxed">
              <span className="text-indigo-400/90 font-bold select-none shrink-0">[{formatTime(Math.min(elapsedSeconds, 4))}]</span>
              <div className="space-x-2">
                <span className="text-sky-300 font-bold bg-sky-950/60 px-1.5 py-0.5 rounded border border-sky-800/50 text-[11px]">
                  RetrievalAgent
                </span>
                <span className="text-slate-200">
                  Connected to <span className="text-sky-300 font-semibold">OpenAlex</span> & <span className="text-sky-300 font-semibold">Semantic Scholar</span> — indexed candidate corpus{" "}
                  {papersFound > 0 && (
                    <span className="text-emerald-400 font-bold">({papersFound} candidate papers)</span>
                  )}
                </span>
              </div>
            </div>
          )}

          {/* Step 3 Log */}
          {currentStepIndex >= 2 && (
            <div className="flex items-start gap-2.5 leading-relaxed">
              <span className="text-indigo-400/90 font-bold select-none shrink-0">[{formatTime(Math.min(elapsedSeconds, 9))}]</span>
              <div className="space-x-2">
                <span className="text-purple-300 font-bold bg-purple-950/60 px-1.5 py-0.5 rounded border border-purple-800/50 text-[11px]">
                  ExtractionAgent
                </span>
                <span className="text-slate-200">
                  Deep PyMuPDF parsing active —{" "}
                  <span className="text-emerald-400 font-bold">
                    {papersAnalyzed}/{papersFound || 5}
                  </span>{" "}
                  papers extracted and vectorized
                </span>
              </div>
            </div>
          )}

          {/* Step 4 Log */}
          {currentStepIndex >= 3 && (
            <div className="flex items-start gap-2.5 leading-relaxed">
              <span className="text-indigo-400/90 font-bold select-none shrink-0">[{formatTime(Math.min(elapsedSeconds, 15))}]</span>
              <div className="space-x-2">
                <span className="text-amber-300 font-bold bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-800/50 text-[11px]">
                  ComparisonAgent
                </span>
                <span className="text-slate-200">
                  Cross-referencing methodology paradigms, benchmark datasets, and architectural trade-offs
                </span>
              </div>
            </div>
          )}

          {/* Step 5 Log */}
          {currentStepIndex >= 4 && (
            <div className="flex items-start gap-2.5 leading-relaxed">
              <span className="text-indigo-400/90 font-bold select-none shrink-0">[{formatTime(Math.min(elapsedSeconds, 20))}]</span>
              <div className="space-x-2">
                <span className="text-fuchsia-300 font-bold bg-fuchsia-950/60 px-1.5 py-0.5 rounded border border-fuchsia-800/50 text-[11px]">
                  SynthesisAgent
                </span>
                <span className="text-slate-200">
                  Synthesizing recurring limitations into structured research gaps with citation evidence
                </span>
              </div>
            </div>
          )}

          {/* Step 6 Log */}
          {currentStepIndex >= 5 && (
            <div className="flex items-start gap-2.5 leading-relaxed">
              <span className="text-indigo-400/90 font-bold select-none shrink-0">[{formatTime(Math.min(elapsedSeconds, 26))}]</span>
              <div className="space-x-2">
                <span className="text-emerald-300 font-bold bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-800/50 text-[11px]">
                  ReportingAgent
                </span>
                <span className="text-slate-200">
                  Synthesizing full executive research report with evidence verification trail
                </span>
              </div>
            </div>
          )}

          {/* Dynamic Active Step Execution Cursor */}
          {!isDone && !isError && (
            <div className="flex items-start gap-2.5 leading-relaxed pt-1">
              <span className="text-indigo-400 font-bold select-none shrink-0">[{formatTime(elapsedSeconds)}]</span>
              <div className="space-x-2">
                <span className="text-indigo-300 font-bold bg-indigo-950/60 px-1.5 py-0.5 rounded border border-indigo-800/50 text-[11px]">
                  {activeStep.agentName.replace(" ", "")}
                </span>
                <span className="text-emerald-400 font-medium">
                  {status?.current_step || activeStep.description}
                  <span className="inline-block w-2 h-4 bg-emerald-400 ml-1.5 animate-pulse align-middle" />
                </span>
              </div>
            </div>
          )}

          {/* Completed Banner in Log */}
          {isDone && (
            <div className="flex items-start gap-2.5 leading-relaxed pt-1 border-t border-emerald-900/40">
              <span className="text-emerald-400 font-bold select-none shrink-0">[{formatTime(elapsedSeconds)}]</span>
              <div className="space-x-2">
                <span className="text-emerald-200 font-bold bg-emerald-950/80 px-1.5 py-0.5 rounded border border-emerald-600/50 text-[11px]">
                  System
                </span>
                <span className="text-emerald-300 font-bold">
                  All 6 multi-agent research stages finished successfully. Artifacts ready for analysis.
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
