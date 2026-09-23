"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import {
  getResearchStatus,
  getResearchPapers,
  getResearchComparison,
  getResearchGaps,
  getResearchReport,
  ResearchStatus,
  PaperWithAnalysis,
  ComparisonDimension,
  ResearchGap,
  ResearchReport,
} from "@/lib/api";
import AgentTracker from "@/components/tracker/AgentTracker";
import DashboardContainer from "@/components/dashboard/DashboardContainer";
import { Sparkles, Activity, CheckCircle2 } from "lucide-react";

const ACTIVE_STATUSES = new Set([
  "pending",
  "searching",
  "analyzing",
  "comparing",
  "gap_finding",
  "reporting",
]);

export default function ProjectPage() {
  const params = useParams();
  const rawId = params?.id;
  const projectId = typeof rawId === "string" ? rawId : Array.isArray(rawId) ? rawId[0] : "";

  // Status & Polling state
  const [status, setStatus] = useState<ResearchStatus | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);

  // View state: "tracker" | "dashboard"
  const [activeView, setActiveView] = useState<"tracker" | "dashboard">("tracker");

  // Synthesis data states (loaded when done)
  const [papers, setPapers] = useState<PaperWithAnalysis[]>([]);
  const [comparisons, setComparisons] = useState<ComparisonDimension[]>([]);
  const [gaps, setGaps] = useState<ResearchGap[]>([]);
  const [report, setReport] = useState<ResearchReport | null>(null);
  const [isDataLoading, setIsDataLoading] = useState<boolean>(false);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Load synthesis artifacts
  const loadSynthesisData = useCallback(async (id: string) => {
    setIsDataLoading(true);
    try {
      const [papersData, comparisonsData, gapsData, reportData] = await Promise.all([
        getResearchPapers(id).catch(() => []),
        getResearchComparison(id).catch(() => []),
        getResearchGaps(id).catch(() => []),
        getResearchReport(id).catch(() => null),
      ]);

      setPapers(papersData);
      setComparisons(comparisonsData);
      setGaps(gapsData);
      setReport(reportData);
    } catch (err) {
      console.error("Error loading synthesis data:", err);
    } finally {
      setIsDataLoading(false);
    }
  }, []);

  // Status fetcher
  const fetchStatus = useCallback(async () => {
    if (!projectId) return null;

    try {
      const data = await getResearchStatus(projectId);
      setStatus(data);
      setError(null);
      setIsLoading(false);

      if (data.status === "done") {
        setActiveView("dashboard");
        loadSynthesisData(projectId);
      }

      return data;
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to connect to the research pipeline backend.";
      setError(message);
      setIsLoading(false);
      return null;
    }
  }, [projectId, loadSynthesisData]);

  // Polling setup: 2.5 seconds (2500ms) while status is in active states
  useEffect(() => {
    if (!projectId) return;

    fetchStatus().then((initialData) => {
      if (initialData && !ACTIVE_STATUSES.has(initialData.status)) {
        return;
      }

      pollIntervalRef.current = setInterval(async () => {
        const latest = await fetchStatus();
        if (!latest) return;

        if (!ACTIVE_STATUSES.has(latest.status)) {
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
        }
      }, 2500);
    });

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [projectId, fetchStatus]);

  // Elapsed time tracker
  useEffect(() => {
    const isFinished = status?.status === "done" || status?.status === "error";

    if (!isFinished) {
      timerRef.current = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [status?.status]);

  // Manual retry action
  const handleRetry = useCallback(() => {
    setError(null);
    setIsLoading(true);
    fetchStatus().then((data) => {
      if (data && ACTIVE_STATUSES.has(data.status)) {
        if (!pollIntervalRef.current) {
          pollIntervalRef.current = setInterval(async () => {
            const latest = await fetchStatus();
            if (latest && !ACTIVE_STATUSES.has(latest.status)) {
              if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
                pollIntervalRef.current = null;
              }
            }
          }, 2500);
        }
      }
    });
  }, [fetchStatus]);

  const isDone = status?.status === "done";

  return (
    <div className="flex-1 w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* ── Mode Switcher (When Synthesis is Ready) ── */}
        {isDone && (
          <div className="flex items-center justify-between p-3 rounded-2xl border border-border/60 bg-card/60 backdrop-blur-sm">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveView("dashboard")}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                  activeView === "dashboard"
                    ? "bg-primary text-white shadow-md shadow-primary/20"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                }`}
                id="view-dashboard-btn"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Research Synthesis Dashboard</span>
              </button>

              <button
                onClick={() => setActiveView("tracker")}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                  activeView === "tracker"
                    ? "bg-primary text-white shadow-md shadow-primary/20"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                }`}
                id="view-tracker-btn"
              >
                <Activity className="w-3.5 h-3.5" />
                <span>Agent Execution Tracker</span>
              </button>
            </div>

            <div className="hidden sm:flex items-center gap-2 text-xs font-mono text-success">
              <CheckCircle2 className="w-4 h-4" />
              <span>Synthesis Complete</span>
            </div>
          </div>
        )}

        {/* ── View Rendering ── */}
        {activeView === "tracker" || !isDone ? (
          <AgentTracker
            projectId={projectId}
            status={status}
            isLoading={isLoading}
            error={error}
            elapsedSeconds={elapsedSeconds}
            onRetry={handleRetry}
          />
        ) : (
          <DashboardContainer
            papers={papers}
            comparisons={comparisons}
            gaps={gaps}
            report={report}
            projectId={projectId}
            initialTab="gaps"
          />
        )}
      </div>
    </div>
  );
}
