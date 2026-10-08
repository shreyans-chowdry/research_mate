"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, animate, motion, useMotionValue, useTransform } from "motion/react";
import { Check, Copy, FileUp, Loader2, X } from "lucide-react";
import { critiqueUserPaper, type PaperCritique } from "@/lib/api";
import { useDashboard } from "./DashboardContext";
import Markdown from "./Markdown";

const FOCUS = [
  { value: "comprehensive", label: "Everything" },
  { value: "methodology and baselines", label: "Methods" },
  { value: "novelty and positioning against related work", label: "Novelty" },
  { value: "evaluation, datasets and statistical rigour", label: "Evaluation" },
];

function ScoreDial({ score }: { score: number }) {
  const value = useMotionValue(0);
  const rounded = useTransform(value, (v) => Math.round(v));
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const controls = animate(value, score, { duration: 1.4, ease: [0.2, 0.7, 0.2, 1] });
    const unsub = rounded.on("change", setDisplay);
    return () => {
      controls.stop();
      unsub();
    };
  }, [score, value, rounded]);

  const color = score >= 75 ? "var(--aurora)" : score >= 50 ? "var(--flare-fill)" : "var(--ember)";
  const R = 52;
  const circ = 2 * Math.PI * R;
  return (
    <div className="relative h-36 w-36 flex-none">
      <svg viewBox="0 0 128 128" className="h-full w-full -rotate-90">
        <circle cx="64" cy="64" r={R} fill="none" stroke="var(--muted)" strokeWidth="8" />
        <motion.circle
          cx="64"
          cy="64"
          r={R}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: circ * (1 - score / 100) }}
          transition={{ duration: 1.4, ease: [0.2, 0.7, 0.2, 1] }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <span className="font-display text-5xl leading-none text-foreground">{display}</span>
          <span className="block text-xs text-muted-foreground">out of 100</span>
        </div>
      </div>
    </div>
  );
}

export default function CriticTab() {
  const { projectId, papers, goToPaper } = useDashboard();
  const [title, setTitle] = useState("");
  const [mode, setMode] = useState<"text" | "pdf">("text");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [focus, setFocus] = useState(FOCUS[0].value);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState<PaperCritique | null>(null);
  const [done, setDone] = useState<Set<number>>(new Set());
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  const pickFile = (f?: File) => {
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(".pdf")) return setError("Choose a .pdf file.");
    if (f.size > 50 * 1024 * 1024) return setError("That PDF is over 50 MB.");
    setError(null);
    setFile(f);
    if (!title) setTitle(f.name.replace(/\.pdf$/i, "").replace(/[_-]+/g, " "));
  };

  const ready = title.trim().length > 1 && (mode === "text" ? text.trim().length >= 10 : !!file);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await critiqueUserPaper(projectId, {
        title: title.trim(),
        draft_text: text.trim(),
        focus_area: focus,
        pdf_file: mode === "pdf" ? (file ?? undefined) : undefined,
      });
      setReview(r);
      setDone(new Set());
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The review failed. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const copyReview = async () => {
    if (!review) return;
    const md = [
      `# Review: ${title}`,
      `Score ${review.overall_score}/100, ${review.readiness_level}`,
      `## Summary\n${review.executive_summary}`,
      `## Fit with the open gaps\n${review.gap_alignment}`,
      `## Methodology\n${review.methodology_critique}`,
      `## Revisions\n${review.actionable_recommendations.map((r) => `- [ ] ${r}`).join("\n")}`,
      `## Benchmarks to add\n${review.benchmark_suggestions.map((b) => `- ${b}`).join("\n")}`,
      `## Papers to cite\n${review.missing_citations.map((c) => `- ${c.title}: ${c.relevance_reason}`).join("\n")}`,
      `## Suggested changes\n${review.suggested_changes_markdown}`,
    ].join("\n\n");
    try {
      await navigator.clipboard.writeText(md);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  };

  return (
    <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      <form onSubmit={submit} className="lg:sticky lg:top-36 lg:self-start">
        <h2 className="font-display text-[2rem] leading-tight tracking-[-0.015em]">Review your draft</h2>
        <p className="mt-2 text-muted-foreground">
          Get a referee-style critique of your paper, judged against the {papers.length} papers and the gaps in this review.
        </p>

        <label className="mt-6 block text-sm font-semibold" htmlFor="draft-title">
          Title
        </label>
        <input
          id="draft-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Working title of your paper"
          className="mt-1.5 h-11 w-full rounded-lg border border-border bg-card px-3 outline-none focus:border-border-strong"
        />

        <div className="mt-5 flex rounded-lg border border-border p-0.5 text-sm" role="tablist" aria-label="Draft input">
          {(["text", "pdf"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={`relative flex-1 rounded-md py-1.5 ${mode === m ? "text-foreground" : "text-muted-foreground"}`}
            >
              {mode === m && <motion.span layoutId="critic-mode" className="absolute inset-0 rounded-md bg-muted" />}
              <span className="relative">{m === "text" ? "Paste text" : "Upload PDF"}</span>
            </button>
          ))}
        </div>

        {mode === "text" ? (
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={9}
            placeholder="Paste your abstract, method section, or the full draft"
            aria-label="Draft text"
            className="mt-3 w-full resize-y rounded-lg border border-border bg-card p-3 text-[15px] leading-relaxed outline-none focus:border-border-strong"
          />
        ) : (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              pickFile(e.dataTransfer.files[0]);
            }}
            onClick={() => fileRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && fileRef.current?.click()}
            className={`mt-3 grid h-44 cursor-pointer place-items-center rounded-lg border border-dashed text-center transition-colors ${
              dragOver ? "border-aurora bg-[var(--aurora-soft)]" : "border-border-strong hover:bg-muted/40"
            }`}
          >
            <input ref={fileRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => pickFile(e.target.files?.[0])} />
            {file ? (
              <div className="flex items-center gap-2 px-4 text-sm">
                <FileUp className="h-4 w-4 text-aurora" />
                <span className="max-w-[16rem] truncate">{file.name}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFile(null);
                  }}
                  className="rounded p-1 text-muted-foreground hover:text-foreground"
                  aria-label="Remove file"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                <FileUp className="mx-auto mb-2 h-6 w-6" />
                Drop a PDF here or click to choose one
                <span className="mt-1 block text-xs">Text-based PDFs up to 50 MB</span>
              </div>
            )}
          </div>
        )}

        <p className="mt-5 text-sm font-semibold">Focus</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {FOCUS.map((f) => (
            <button
              key={f.value}
              type="button"
              aria-pressed={focus === f.value}
              onClick={() => setFocus(f.value)}
              className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                focus === f.value ? "border-border-strong bg-muted text-foreground" : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {error && (
          <p role="alert" className="mt-4 text-sm text-ember">
            {error}
          </p>
        )}

        <button type="submit" disabled={!ready || busy} className="btn-flare mt-6 flex h-11 w-full items-center justify-center gap-2 text-[15px]">
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Reviewing
            </>
          ) : (
            "Review my draft"
          )}
        </button>
      </form>

      <div ref={resultRef} className="scroll-mt-36">
        <AnimatePresence mode="wait">
          {!review ? (
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grid h-full min-h-[300px] place-items-center rounded-2xl border border-dashed border-border p-10 text-center text-muted-foreground">
              {busy ? <span className="shimmer-text text-lg">Comparing your draft with the literature</span> : "Your review will appear here."}
            </motion.div>
          ) : (
            <motion.div key="review" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
              <div className="flex flex-wrap items-center gap-6">
                <ScoreDial score={review.overall_score} />
                <div className="min-w-0 flex-1">
                  <p className="font-display text-2xl leading-snug text-foreground">{review.readiness_level}</p>
                  <p className="mt-2 leading-relaxed text-foreground/85">{review.executive_summary}</p>
                  <button type="button" onClick={copyReview} className="btn-quiet mt-4 flex h-9 items-center gap-2 px-3 text-sm">
                    {copied ? <Check className="h-4 w-4 text-aurora" /> : <Copy className="h-4 w-4" />}
                    {copied ? "Copied" : "Copy review"}
                  </button>
                </div>
              </div>

              {review.actionable_recommendations.length > 0 && (
                <section>
                  <h3 className="text-lg font-semibold">Revisions to make</h3>
                  <p className="text-sm text-muted-foreground">
                    {done.size} of {review.actionable_recommendations.length} done
                  </p>
                  <ul className="mt-3 space-y-2">
                    {review.actionable_recommendations.map((r, i) => {
                      const checked = done.has(i);
                      return (
                        <li key={i}>
                          <button
                            type="button"
                            onClick={() =>
                              setDone((s) => {
                                const n = new Set(s);
                                if (n.has(i)) n.delete(i);
                                else n.add(i);
                                return n;
                              })
                            }
                            aria-pressed={checked}
                            className="flex w-full items-start gap-3 rounded-lg p-2 text-left transition-colors hover:bg-muted/50"
                          >
                            <span className={`mt-0.5 grid h-5 w-5 flex-none place-items-center rounded-md border ${checked ? "border-aurora bg-aurora text-background" : "border-border-strong"}`}>
                              {checked && <Check className="h-3.5 w-3.5" />}
                            </span>
                            <span className={`leading-relaxed ${checked ? "text-muted-foreground line-through" : "text-foreground/90"}`}>{r}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}

              <section className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div>
                  <h3 className="text-lg font-semibold">Fit with the open gaps</h3>
                  <p className="mt-2 leading-relaxed text-foreground/85">{review.gap_alignment}</p>
                </div>
                <div>
                  <h3 className="text-lg font-semibold">Methodology</h3>
                  <p className="mt-2 leading-relaxed text-foreground/85">{review.methodology_critique}</p>
                </div>
              </section>

              {review.missing_citations.length > 0 && (
                <section>
                  <h3 className="text-lg font-semibold">Papers you should cite</h3>
                  <ul className="mt-3 space-y-2">
                    {review.missing_citations.map((c) => {
                      const p = papers.find((x) => x.id === c.paper_id);
                      return (
                        <li key={c.paper_id}>
                          <button type="button" onClick={() => goToPaper(c.paper_id)} className="w-full rounded-lg border border-border p-3 text-left transition-colors hover:border-border-strong hover:bg-muted/40">
                            <span className="mr-2 text-sm font-bold text-flare">{p?.label}</span>
                            <span className="font-display text-foreground">{c.title}</span>
                            {c.relevance_reason && <span className="mt-1 block text-sm text-muted-foreground">{c.relevance_reason}</span>}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}

              {review.benchmark_suggestions.length > 0 && (
                <section>
                  <h3 className="text-lg font-semibold">Benchmarks to add</h3>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-foreground/85 marker:text-flare">
                    {review.benchmark_suggestions.map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>
                </section>
              )}

              {review.suggested_changes_markdown && (
                <section>
                  <h3 className="text-lg font-semibold">Suggested changes</h3>
                  <div className="mt-2">
                    <Markdown content={review.suggested_changes_markdown} compact />
                  </div>
                </section>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
