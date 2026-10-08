"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, Bell, BellRing, RefreshCw } from "lucide-react";
import {
  ACTIVE_STATUSES,
  getResearchComparison,
  getResearchGaps,
  getResearchPapers,
  getResearchReport,
  getResearchStatus,
  retryResearch,
  type AgentEvent,
  type ComparisonDimension,
  type PaperWithAnalysis,
  type ResearchGap,
  type ResearchReport,
  type ResearchStatus,
} from "@/lib/api";
import { formatDuration, humanDuration } from "@/lib/format";
import { useToast } from "@/components/Toast";
import AgentTracker from "@/components/tracker/AgentTracker";
import DashboardContainer, { TABS } from "@/components/dashboard/DashboardContainer";
import ExportMenu from "@/components/dashboard/ExportMenu";
import { DashboardContext, type DashboardData, type DashboardTab } from "@/components/dashboard/DashboardContext";

const POLL_MS = 1500;

export default function ProjectPage() {
  return (
    <Suspense fallback={null}>
      <ProjectView />
    </Suspense>
  );
}

function ProjectView() {
  const params = useParams<{ id: string }>();
  const projectId = params?.id ?? "";
  const router = useRouter();
  const search = useSearchParams();
  const toast = useToast();

  const [status, setStatus] = useState<ResearchStatus | null>(null);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [retrying, setRetrying] = useState(false);
  const [confirmRerun, setConfirmRerun] = useState(false);
  const [notify, setNotify] = useState(() => typeof Notification !== "undefined" && Notification.permission === "granted");

  const initialTab = (TABS.find((t) => t.id === search.get("tab"))?.id ?? "gaps") as DashboardTab;
  const [tab, setTabState] = useState<DashboardTab>(initialTab);
  const [view, setView] = useState<"run" | "results">(search.get("view") === "run" ? "run" : "results");
  const userPickedView = useRef(search.get("view") === "run");
  const [focusedPaperId, setFocusedPaperId] = useState<string | null>(null);

  const [papers, setPapers] = useState<PaperWithAnalysis[]>([]);
  const [gaps, setGaps] = useState<ResearchGap[]>([]);
  const [comparisons, setComparisons] = useState<ComparisonDimension[]>([]);
  const [report, setReport] = useState<ResearchReport | null>(null);
  const [dataLoaded, setDataLoaded] = useState(false);

  const lastEventId = useRef(0);
  const sawActive = useRef(false);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollRef = useRef<() => void>(() => {});

  const isDone = status?.status === "done";
  const isActive = status ? ACTIVE_STATUSES.has(status.status) : true;

  const updateUrl = useCallback(
    (next: { tab?: DashboardTab; view?: "run" | "results" }) => {
      const sp = new URLSearchParams(window.location.search);
      if (next.tab) sp.set("tab", next.tab);
      if (next.view) {
        if (next.view === "run") sp.set("view", "run");
        else sp.delete("view");
      }
      window.history.replaceState(null, "", `${window.location.pathname}?${sp.toString()}`);
    },
    []
  );

  const setTab = useCallback(
    (t: DashboardTab) => {
      setTabState(t);
      setView("results");
      updateUrl({ tab: t, view: "results" });
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [updateUrl]
  );

  const goToPaper = useCallback(
    (paperId: string) => {
      setFocusedPaperId(null);
      setTabState("papers");
      setView("results");
      updateUrl({ tab: "papers", view: "results" });
      requestAnimationFrame(() => setFocusedPaperId(paperId));
    },
    [updateUrl]
  );

  const loadData = useCallback(async () => {
    const [p, g, c, r] = await Promise.all([
      getResearchPapers(projectId).catch(() => []),
      getResearchGaps(projectId).catch(() => []),
      getResearchComparison(projectId).catch(() => []),
      getResearchReport(projectId).catch(() => null),
    ]);
    setPapers(p);
    setGaps(g);
    setComparisons(c);
    setReport(r);
    setDataLoaded(true);
  }, [projectId]);

  const poll = useCallback(async () => {
    if (!projectId) return;
    try {
      const s = await getResearchStatus(projectId, lastEventId.current);
      setLoadError(null);
      if (s.events.length) {
        lastEventId.current = s.events[s.events.length - 1].id;
        setEvents((prev) => [...prev, ...s.events.filter((e) => !prev.some((p) => p.id === e.id))]);
      }
      setStatus(s);

      if (ACTIVE_STATUSES.has(s.status)) {
        sawActive.current = true;
        pollTimer.current = setTimeout(() => pollRef.current(), POLL_MS);
      } else if (s.status === "done") {
        await loadData();
        if (sawActive.current) {
          // finished while we were watching
          toast.show("Your review is ready", { tone: "success" });
          if (typeof Notification !== "undefined" && Notification.permission === "granted" && document.hidden) {
            new Notification("ResearchMate: review ready", { body: s.topic ?? "", icon: "/icon.svg" });
          }
          if (!userPickedView.current) setTimeout(() => setView("results"), 1800);
        }
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Couldn't load this review.");
      pollTimer.current = setTimeout(() => pollRef.current(), POLL_MS * 3);
    }
  }, [projectId, loadData, toast]);

  useEffect(() => {
    pollRef.current = poll;
  }, [poll]);

  // Start polling once on mount; each poll schedules the next while the run is active.
  useEffect(() => {
    pollTimer.current = setTimeout(() => pollRef.current(), 0);
    return () => {
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, [projectId]);

  useEffect(() => {
    if (!isActive) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [isActive]);

  useEffect(() => {
    if (status?.topic) document.title = `${status.topic} — ResearchMate`;
  }, [status?.topic]);

  const elapsed = useMemo(() => {
    if (!status?.created_at) return 0;
    const start = new Date(status.created_at).getTime();
    if (status.completed_at) return (new Date(status.completed_at).getTime() - start) / 1000;
    if (status.status === "error") {
      const last = events[events.length - 1]?.at;
      return last ? (new Date(last).getTime() - start) / 1000 : 0;
    }
    return (now - start) / 1000;
  }, [status, events, now]);

  const rerun = async () => {
    setConfirmRerun(false);
    setRetrying(true);
    try {
      await retryResearch(projectId);
      lastEventId.current = 0;
      sawActive.current = true;
      setEvents([]);
      setDataLoaded(false);
      setPapers([]);
      setGaps([]);
      setComparisons([]);
      setReport(null);
      userPickedView.current = false;
      setView("run");
      if (pollTimer.current) clearTimeout(pollTimer.current);
      await poll();
    } catch (err) {
      toast.show(err instanceof Error ? err.message : "Couldn't restart the review.", { tone: "error" });
    } finally {
      setRetrying(false);
    }
  };

  const askNotify = async () => {
    if (typeof Notification === "undefined") return toast.show("This browser doesn't support notifications.", { tone: "error" });
    const perm = await Notification.requestPermission();
    setNotify(perm === "granted");
    toast.show(perm === "granted" ? "You'll get a notification when the review is ready." : "Notifications are blocked for this site.", {
      tone: perm === "granted" ? "success" : "error",
    });
  };

  const ctx: DashboardData = {
    projectId,
    topic: status?.topic ?? "",
    papers,
    gaps,
    comparisons,
    report,
    goToPaper,
    setTab,
    focusedPaperId,
  };

  if (loadError && !status) {
    return (
      <div className="mx-auto max-w-xl px-4 py-24 text-center">
        <h1 className="font-display text-3xl">This review couldn’t be loaded</h1>
        <p className="mt-3 text-muted-foreground">{loadError}</p>
        <div className="mt-6 flex justify-center gap-3">
          <button type="button" onClick={() => poll()} className="btn-quiet h-10 px-4 text-sm">
            Try again
          </button>
          <button type="button" onClick={() => router.push("/")} className="btn-flare h-10 px-4 text-sm">
            Back to reviews
          </button>
        </div>
      </div>
    );
  }

  const statusChip = isDone ? (
    <span className="flex items-center gap-2 text-aurora">
      <span className="h-2 w-2 rounded-full bg-aurora" /> Complete
    </span>
  ) : status?.status === "error" ? (
    <span className="flex items-center gap-2 text-ember">
      <span className="h-2 w-2 rounded-full bg-ember" /> Stopped
    </span>
  ) : (
    <span className="flex items-center gap-2 text-foreground">
      <span className="live-dot" /> Running
    </span>
  );

  return (
    <DashboardContext.Provider value={ctx}>
      <div className="mx-auto w-full max-w-7xl px-4 pb-24 pt-8 sm:px-6 lg:px-8">
        {/* ── Header ── */}
        <div className="no-print">
          <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> All reviews
          </Link>

          <div className="mt-4 flex flex-wrap items-end justify-between gap-6">
            <div className="min-w-0 max-w-3xl">
              {status?.topic ? (
                <motion.h1
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="font-display text-[clamp(2rem,4.2vw,3.2rem)] leading-[1.05] tracking-[-0.025em] text-foreground"
                >
                  {status.topic}
                </motion.h1>
              ) : (
                <div className="h-12 w-96 max-w-full animate-pulse rounded-lg bg-muted/60" />
              )}
              <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
                {statusChip}
                <span className="tabular-nums">
                  {isActive ? formatDuration(elapsed) : status?.created_at ? `Took ${humanDuration(elapsed)}` : ""}
                </span>
                {(status?.papers_found ?? 0) > 0 && <span>{status?.papers_found} papers</span>}
                {isDone && gaps.length > 0 && <span>{gaps.length} gaps</span>}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {isDone && (
                <div className="flex rounded-lg border border-border p-0.5 text-sm" role="tablist" aria-label="View">
                  {(["results", "run"] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      role="tab"
                      aria-selected={view === v}
                      onClick={() => {
                        userPickedView.current = true;
                        setView(v);
                        updateUrl({ view: v });
                      }}
                      className={`relative rounded-md px-3 py-1.5 ${view === v ? "text-foreground" : "text-muted-foreground"}`}
                    >
                      {view === v && <motion.span layoutId="view-toggle" className="absolute inset-0 rounded-md bg-muted" />}
                      <span className="relative">{v === "results" ? "Results" : "Agent run"}</span>
                    </button>
                  ))}
                </div>
              )}

              {isActive && status && (
                <button type="button" onClick={askNotify} className="btn-quiet flex h-10 items-center gap-2 px-3.5 text-sm" disabled={notify}>
                  {notify ? <BellRing className="h-4 w-4 text-aurora" /> : <Bell className="h-4 w-4" />}
                  {notify ? "Will notify" : "Notify me"}
                </button>
              )}

              {isDone && <ExportMenu />}

              {status && (
                <AnimatePresence mode="wait" initial={false}>
                  {confirmRerun ? (
                    <motion.div
                      key="confirm"
                      initial={{ opacity: 0, scale: 0.96 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.96 }}
                      className="flex items-center gap-2 rounded-lg border border-border-strong bg-card py-1 pl-3 pr-1 text-sm"
                    >
                      <span className="text-muted-foreground">Replace these results?</span>
                      <button type="button" onClick={rerun} className="btn-flare h-8 px-3 text-sm">
                        Run again
                      </button>
                      <button type="button" onClick={() => setConfirmRerun(false)} className="h-8 rounded-md px-2 text-muted-foreground hover:text-foreground">
                        Cancel
                      </button>
                    </motion.div>
                  ) : (
                    <motion.button
                      key="rerun"
                      type="button"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      onClick={() => (isDone ? setConfirmRerun(true) : rerun())}
                      disabled={retrying}
                      className="btn-quiet flex h-10 items-center gap-2 px-3.5 text-sm"
                      title={isActive ? "Restart a run that seems stuck" : "Run the review again"}
                    >
                      <RefreshCw className={`h-4 w-4 ${retrying ? "animate-spin" : ""}`} />
                      {isActive ? "Restart" : "Run again"}
                    </motion.button>
                  )}
                </AnimatePresence>
              )}
            </div>
          </div>

          {loadError && status && (
            <p className="mt-4 text-sm text-ember" role="alert">
              Lost contact with the server; still retrying. {loadError}
            </p>
          )}
        </div>

        {/* ── Body ── */}
        <div className="mt-8">
          <AnimatePresence mode="wait">
            {view === "run" || !isDone ? (
              <motion.div key="run" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 0.99 }} transition={{ duration: 0.3 }}>
                <AgentTracker
                  status={status}
                  events={events}
                  onRetry={rerun}
                  retrying={retrying}
                  onOpenResults={() => {
                    userPickedView.current = true;
                    setView("results");
                    updateUrl({ view: "results" });
                  }}
                />
              </motion.div>
            ) : dataLoaded ? (
              <motion.div key="results" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
                <DashboardContainer tab={tab} />
              </motion.div>
            ) : (
              <motion.div key="loading" className="space-y-3" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-28 animate-pulse rounded-2xl bg-muted/50" />
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </DashboardContext.Provider>
  );
}
