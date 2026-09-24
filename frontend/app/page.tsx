"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  createResearch,
  listResearchProjects,
  deleteResearchProject,
  ProjectSummary,
} from "@/lib/api";
import {
  Clock,
  BookOpen,
  CheckCircle2,
  Loader2,
  ArrowRight,
  History,
  Trash2,
} from "lucide-react";

const SUGGESTED_TOPICS = [
  "Transformer model compression",
  "Zero-day vulnerability prediction",
  "Quantum key distribution",
  "Federated learning in healthcare",
  "LLM hallucination mitigation",
  "Adversarial robustness in autonomous vehicles",
];

const PIPELINE_STEPS = [
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.3-4.3" />
      </svg>
    ),
    title: "Search & Retrieve",
    desc: "Queries OpenAlex & Semantic Scholar",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
        <path d="M14 2v6h6" />
        <path d="M16 13H8" />
        <path d="M16 17H8" />
        <path d="M10 9H8" />
      </svg>
    ),
    title: "Extract & Analyze",
    desc: "Deep PDF parsing via multi-agent AI",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 3h5v5" />
        <path d="M8 3H3v5" />
        <path d="M12 22v-8.3a4 4 0 0 0-1.172-2.872L3 3" />
        <path d="m15 9 6-6" />
      </svg>
    ),
    title: "Compare & Synthesize",
    desc: "Cross-paper methodology analysis",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7" />
        <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
        <path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4" />
        <path d="M2 7h20" />
        <path d="M22 7v3a2 2 0 0 1-2 2a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 16 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 12 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 8 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 4 12a2 2 0 0 1-2-2V7" />
      </svg>
    ),
    title: "Identify Gaps",
    desc: "Evidence-backed research gap synthesis",
  },
];

export default function HomePage() {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Past research state
  const [pastProjects, setPastProjects] = useState<ProjectSummary[]>([]);
  const [isPastLoading, setIsPastLoading] = useState(true);

  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    listResearchProjects()
      .then((data) => setPastProjects(data))
      .catch((err) => console.error("Failed to load past research:", err))
      .finally(() => setIsPastLoading(false));
  }, []);

  const handleDeleteProject = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();

    if (deletingId === id) return;
    setDeletingId(id);

    // Optimistically remove from UI
    setPastProjects((prev) => prev.filter((p) => p.id !== id));

    try {
      await deleteResearchProject(id);
    } catch (err) {
      console.error("Failed to delete project:", err);
      // Re-fetch to restore state if deletion failed
      const data = await listResearchProjects().catch(() => []);
      setPastProjects(data);
    } finally {
      setDeletingId(null);
    }
  };


  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = topic.trim();
      if (!trimmed || isLoading) return;

      setIsLoading(true);
      setError(null);

      try {
        const { project_id } = await createResearch(trimmed);
        router.push(`/project/${project_id}`);
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Failed to connect to the backend. Please ensure the server is running.";
        setError(message);
        setIsLoading(false);
      }
    },
    [topic, isLoading, router]
  );

  const handleChipClick = (chipTopic: string) => {
    setTopic(chipTopic);
    setError(null);
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 lg:px-8 py-12 sm:py-20">
      {/* ── Hero Section ── */}
      <div className="text-center max-w-4xl mx-auto space-y-6 animate-fade-in">
        {/* Headline */}
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.1]">
          <span className="gradient-text">Autonomous Literature</span>
          <br />
          <span className="text-foreground">Gap Synthesis</span>
        </h1>

        {/* Subhead */}
        <p className="text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
          Submit a research topic and let our autonomous multi-agent pipeline
          retrieve, parse, and analyze academic papers — then synthesize
          cross-paper research gaps backed by explicit citation evidence trails.
        </p>
      </div>

      {/* ── Search Section ── */}
      <div
        className="w-full max-w-2xl mx-auto mt-10 space-y-5 animate-fade-in"
        style={{ animationDelay: "0.15s" }}
      >
        {/* Error Banner */}
        {error && (
          <div
            className="flex items-start gap-3 px-4 py-3 rounded-xl border border-destructive/30 bg-destructive/10 text-sm text-destructive animate-fade-in"
            role="alert"
            id="error-banner"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="mt-0.5 shrink-0"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <div>
              <p className="font-medium">Connection Error</p>
              <p className="text-destructive/80 mt-0.5">{error}</p>
            </div>
            <button
              onClick={() => setError(null)}
              className="ml-auto text-destructive/60 hover:text-destructive transition-colors"
              aria-label="Dismiss error"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        )}

        {/* Search Form */}
        <form onSubmit={handleSubmit} className="relative group" id="search-form">
          <div className="relative gradient-border rounded-2xl">
            <div className="flex items-center bg-card rounded-2xl overflow-hidden shadow-sm dark:shadow-none border border-border/40">
              {/* Search Icon */}
              <div className="pl-5 text-muted-foreground">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
              </div>

              {/* Input */}
              <input
                type="text"
                value={topic}
                onChange={(e) => {
                  setTopic(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="AI-based ransomware detection in SCADA systems"
                className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground/50 px-4 py-4.5 text-base sm:text-lg outline-none"
                disabled={isLoading}
                id="topic-input"
                autoComplete="off"
                autoFocus
              />

              {/* Submit Button */}
              <button
                type="submit"
                disabled={!topic.trim() || isLoading}
                className="mr-2.5 px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed bg-gradient-to-r from-[var(--gradient-start)] to-[var(--gradient-mid)] text-white hover:shadow-lg hover:shadow-primary/25 active:scale-[0.97]"
                id="submit-button"
              >
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <svg
                      className="animate-spin h-4 w-4"
                      viewBox="0 0 24 24"
                      fill="none"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                    Launching…
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    Analyze
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M5 12h14" />
                      <path d="m12 5 7 7-7 7" />
                    </svg>
                  </span>
                )}
              </button>
            </div>
          </div>
        </form>

        {/* Suggested Topics */}
        <div className="space-y-2.5">
          <p className="text-xs text-muted-foreground/60 text-center">
            Try a suggested topic
          </p>
          <div className="flex flex-wrap justify-center gap-2" id="topic-chips">
            {SUGGESTED_TOPICS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => handleChipClick(t)}
                disabled={isLoading}
                className="px-3.5 py-1.5 rounded-full text-xs font-medium border border-border/50 bg-secondary/40 text-muted-foreground hover:text-foreground hover:bg-secondary hover:border-border transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Pipeline Steps ── */}
      <div
        className="w-full max-w-3xl mx-auto mt-16 sm:mt-20 animate-fade-in"
        style={{ animationDelay: "0.3s" }}
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {PIPELINE_STEPS.map((step, i) => (
            <div
              key={step.title}
              className="group relative flex flex-col items-center text-center p-5 rounded-2xl border border-border/40 bg-card/70 hover:bg-card hover:border-border/70 shadow-sm dark:shadow-none transition-all duration-300"
            >
              {/* Step Number */}
              <div className="absolute top-3 right-3 text-[10px] font-mono text-muted-foreground/30">
                0{i + 1}
              </div>

              {/* Icon */}
              <div className="w-10 h-10 flex items-center justify-center rounded-xl bg-gradient-to-br from-[var(--gradient-start)]/10 to-[var(--gradient-mid)]/10 text-primary group-hover:from-[var(--gradient-start)]/20 group-hover:to-[var(--gradient-mid)]/20 transition-all duration-300 mb-3">
                {step.icon}
              </div>

              <h3 className="text-sm font-semibold text-foreground/90 mb-1">
                {step.title}
              </h3>
              <p className="text-[11px] text-muted-foreground leading-snug">
                {step.desc}
              </p>
            </div>
          ))}
        </div>

        {/* Connecting line */}
        <div className="hidden sm:flex items-center justify-center mt-4 gap-1">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center">
              <div className="w-16 h-px bg-gradient-to-r from-border/60 to-border/20" />
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="text-muted-foreground/30"
              >
                <path d="m9 18 6-6-6-6" />
              </svg>
            </div>
          ))}
        </div>
      </div>

      {/* ── Past Research Investigations ── */}
      {pastProjects.length > 0 && (
        <div
          className="w-full max-w-3xl mx-auto mt-16 sm:mt-24 space-y-6 animate-fade-in"
          style={{ animationDelay: "0.35s" }}
        >
          <div className="flex items-center justify-between border-b border-border/40 pb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                <History className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-base font-bold text-foreground tracking-tight">
                  Past Research Investigations
                </h2>
                <p className="text-xs text-muted-foreground">
                  Access your previously synthesized literature reviews and research gaps
                </p>
              </div>
            </div>
            <span className="text-xs font-mono text-muted-foreground px-2.5 py-1 rounded-full bg-secondary border border-border/50">
              {pastProjects.length} {pastProjects.length === 1 ? "session" : "sessions"}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {pastProjects.map((p) => {
              const isProjectDone = p.status === "done";
              const isProjectError = p.status === "error";

              return (
                <Link
                  key={p.id}
                  href={`/project/${p.id}`}
                  className="group relative flex flex-col justify-between p-5 rounded-2xl border border-border/50 bg-card hover:bg-card/95 hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300"
                >
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide uppercase ${
                          isProjectDone
                            ? "bg-success/15 text-success border border-success/30"
                            : isProjectError
                            ? "bg-destructive/15 text-destructive border border-destructive/30"
                            : "bg-primary/15 text-primary border border-primary/30"
                        }`}
                      >
                        {isProjectDone ? (
                          <>
                            <CheckCircle2 className="w-3 h-3" />
                            Completed
                          </>
                        ) : isProjectError ? (
                          "Interrupted"
                        ) : (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin" />
                            In Progress
                          </>
                        )}
                      </span>

                      <div className="flex items-center gap-2">
                        {p.created_at && (
                          <span className="flex items-center gap-1 text-[11px] text-muted-foreground/70">
                            <Clock className="w-3 h-3" />
                            {new Date(p.created_at).toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                            })}
                          </span>
                        )}

                        {/* Delete Button */}
                        <button
                          type="button"
                          onClick={(e) => handleDeleteProject(e, p.id)}
                          title="Delete research session"
                          aria-label="Delete research session"
                          className="opacity-70 sm:opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all duration-200 z-10"
                        >
                          {deletingId === p.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-destructive" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>

                    <h3 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-2 leading-snug">
                      {p.topic}
                    </h3>
                  </div>

                  <div className="mt-4 pt-3 border-t border-border/40 flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5 font-mono text-[11px]">
                      <BookOpen className="w-3.5 h-3.5 text-muted-foreground/60" />
                      {p.papers_count} {p.papers_count === 1 ? "paper" : "papers"}
                    </span>

                    <span className="inline-flex items-center gap-1 text-xs font-medium text-primary group-hover:translate-x-0.5 transition-transform">
                      View Synthesis
                      <ArrowRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
