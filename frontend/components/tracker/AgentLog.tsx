"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Check, Copy } from "lucide-react";
import type { AgentEvent } from "@/lib/api";
import { formatDuration } from "@/lib/format";

const AGENT_COLOR: Record<string, string> = {
  Query: "#8fb3ff",
  Retrieval: "#7fd4ff",
  Extraction: "#c7a6ff",
  Comparison: "#ffcf87",
  Gaps: "#ffb547",
  Report: "#6ee7c2",
  System: "#8b93aa",
};

interface Props {
  events: AgentEvent[];
  startedAt?: string;
  live: boolean;
}

export default function AgentLog({ events, startedAt, live }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const [copied, setCopied] = useState(false);
  const t0 = startedAt ? new Date(startedAt).getTime() : 0;

  const stamp = (e: AgentEvent) => (e.at && t0 ? formatDuration((new Date(e.at).getTime() - t0) / 1000) : "--:--");

  useEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [events.length]);

  const copy = async () => {
    const text = events.map((e) => `[${stamp(e)}] ${e.agent.padEnd(10)} ${e.message}`).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // clipboard blocked; nothing else to do
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-[#1e2b4a] bg-[#070d1d] text-[#d6d2c6] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
      <div className="flex items-center justify-between border-b border-[#1e2b4a] px-4 py-3">
        <div className="flex items-center gap-2.5 text-sm">
          {live ? <span className="live-dot" /> : <span className="h-2 w-2 rounded-full bg-[#2c3c62]" />}
          <span className="font-medium text-[#ece7da]">Agent activity</span>
          <span className="text-[#8b93aa]">{events.length} events</span>
        </div>
        <button
          type="button"
          onClick={copy}
          disabled={!events.length}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-[#8b93aa] transition-colors hover:bg-[#13203d] hover:text-[#ece7da] disabled:opacity-40"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-[#6ee7c2]" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy log"}
        </button>
      </div>
      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
        className="flex-1 overflow-y-auto px-4 py-3 font-mono text-[12.5px] leading-[1.7]"
        aria-live="polite"
      >
        {events.length === 0 && <p className="text-[#8b93aa] caret">Waiting for the first agent</p>}
        {events.map((e, i) => (
          <motion.div
            key={e.id}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.25 }}
            className="grid grid-cols-[3rem_1fr] gap-2 sm:grid-cols-[3.4rem_5.6rem_1fr]"
          >
            <span className="text-[#56607a]">{stamp(e)}</span>
            {/* On phones the agent name sits above its message; from sm up they're separate columns */}
            <div className="min-w-0 sm:contents">
            <span className="block sm:inline" style={{ color: AGENT_COLOR[e.agent] ?? "#8b93aa" }}>{e.agent}</span>
            <span
              className={`break-words ${
                e.level === "error"
                  ? "text-[#ff7a7a]"
                  : e.level === "warn"
                    ? "text-[#ffcf87]"
                    : e.level === "success"
                      ? "text-[#a9f0d9]"
                      : "text-[#d6d2c6]"
              } ${live && i === events.length - 1 ? "caret" : ""}`}
            >
              {e.message}
            </span>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
