"use client";

import { useMemo } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, ArrowRight, RefreshCw } from "lucide-react";
import type { ResearchStatus, AgentEvent } from "@/lib/api";
import OrbitView, { STAGES } from "./OrbitView";
import AgentLog from "./AgentLog";

const ORDER = ["pending", "searching", "analyzing", "comparing", "gap_finding", "reporting", "done"];

/** Which stage failed: the last agent that logged an error, else the last agent that logged anything. */
function failedStageIndex(events: AgentEvent[]): number {
  const errorEvent = [...events].reverse().find((e) => e.level === "error") ?? events[events.length - 1];
  const idx = STAGES.findIndex((s) => s.agent === errorEvent?.agent);
  return idx >= 0 ? idx : 0;
}

interface Props {
  status: ResearchStatus | null;
  events: AgentEvent[];
  onRetry: () => void;
  retrying: boolean;
  onOpenResults: () => void;
}

export default function AgentTracker({ status, events, onRetry, retrying, onOpenResults }: Props) {
  const s = status?.status ?? "pending";
  const done = s === "done";
  const failed = s === "error";

  const stageIndex = useMemo(() => {
    if (failed) return failedStageIndex(events);
    const i = ORDER.indexOf(s);
    return i >= 0 ? i : 0;
  }, [s, failed, events]);

  const live = !done && !failed;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
      <div className="panel relative overflow-hidden p-4 sm:p-6">
        <OrbitView
          stageIndex={done ? STAGES.length : stageIndex}
          failed={failed}
          papersFound={status?.papers_found ?? 0}
          papersRead={status?.papers_analyzed ?? 0}
        />

        <div className="mt-2 flex min-h-[3.5rem] flex-wrap items-center justify-between gap-4 border-t border-border pt-4">
          <motion.div
              key={done ? "done" : failed ? "failed" : status?.current_step}
              initial={{ opacity: 0.2, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="min-w-0 flex-1"
            >
              {done ? (
                <p className="font-display text-xl text-foreground">The review is ready.</p>
              ) : failed ? (
                <p className="text-sm text-muted-foreground">Stopped at {STAGES[stageIndex].name.toLowerCase()}.</p>
              ) : (
                <p className="shimmer-text text-[15px] font-medium">{status?.current_step || "Starting the agents"}</p>
              )}
          </motion.div>

          {done && (
            <motion.button
              type="button"
              onClick={onOpenResults}
              className="btn-flare flex h-10 items-center gap-2 px-4 text-sm"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 18, delay: 0.3 }}
            >
              Open results <ArrowRight className="h-4 w-4" />
            </motion.button>
          )}
        </div>

        <AnimatePresence>
          {failed && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-4 flex flex-col gap-4 rounded-xl border border-[color-mix(in_oklab,var(--ember)_35%,transparent)] bg-[var(--ember-soft)] p-4 sm:flex-row sm:items-start">
                <AlertTriangle className="h-5 w-5 flex-none text-ember" />
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-semibold text-foreground">The review stopped before finishing</p>
                  <p className="mt-1 break-words text-muted-foreground">
                    {status?.error_message || "An agent reported an error. Check the activity log for details."}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onRetry}
                  disabled={retrying}
                  className="btn-flare flex h-9 flex-none items-center gap-2 px-4 text-sm"
                >
                  <RefreshCw className={`h-4 w-4 ${retrying ? "animate-spin" : ""}`} />
                  Run again
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* On wide screens the log fills the orbit panel's height and scrolls inside it */}
      <div className="relative h-[440px] lg:h-auto">
        <div className="absolute inset-0">
          <AgentLog events={events} startedAt={status?.created_at} live={live} />
        </div>
      </div>
    </div>
  );
}
