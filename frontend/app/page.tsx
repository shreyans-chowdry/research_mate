"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowUp, Loader2, Search, Trash2, X, Check, AlertTriangle } from "lucide-react";
import Constellation from "@/components/brand/Constellation";
import { useToast } from "@/components/Toast";
import { createResearch, deleteResearchProject, listResearchProjects, ProjectSummary, ACTIVE_STATUSES } from "@/lib/api";
import { relativeTime } from "@/lib/format";

const EXAMPLES = [
  "LLM hallucination mitigation",
  "Federated learning in hospital imaging",
  "Ransomware detection in SCADA networks",
  "Quantum key distribution over fibre",
  "Transformer model compression for edge devices",
  "Microplastics in freshwater food webs",
];

const HEADLINE = "Find what the literature hasn’t answered yet.";

const STAGES = [
  { name: "Plan", text: "Turns your topic into focused search queries." },
  { name: "Retrieve", text: "Searches OpenAlex, Semantic Scholar, Europe PMC and arXiv, then ranks by relevance." },
  { name: "Read", text: "Pulls open-access full text and extracts problem, method, data, results and limits." },
  { name: "Compare", text: "Contrasts the papers on methods, datasets and results." },
  { name: "Find gaps", text: "Clusters shared limitations into open problems, each tied to its evidence." },
  { name: "Report", text: "Writes a cited literature review you can export, question and critique against." },
];

function useTypedPlaceholder(active: boolean) {
  const [text, setText] = useState("");
  const reduce = useReducedMotion();
  useEffect(() => {
    if (!active || reduce) return;
    let i = 0;
    let pos = 0;
    let deleting = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const word = EXAMPLES[i];
      if (!deleting) {
        pos++;
        setText(word.slice(0, pos));
        if (pos === word.length) {
          deleting = true;
          timer = setTimeout(tick, 2200);
          return;
        }
        timer = setTimeout(tick, 38 + Math.random() * 40);
      } else {
        pos -= 2;
        setText(word.slice(0, Math.max(0, pos)));
        if (pos <= 0) {
          deleting = false;
          pos = 0;
          i = (i + 1) % EXAMPLES.length;
          timer = setTimeout(tick, 350);
          return;
        }
        timer = setTimeout(tick, 18);
      }
    };
    timer = setTimeout(tick, 1400);
    return () => clearTimeout(timer);
  }, [active, reduce]);
  return reduce ? EXAMPLES[0] : text;
}

export default function HomePage() {
  const router = useRouter();
  const toast = useToast();
  const reduce = useReducedMotion();
  const [topic, setTopic] = useState("");
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pulse, setPulse] = useState(0);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const placeholder = useTypedPlaceholder(!topic && !focused);

  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [filter, setFilter] = useState("");
  const pendingDeletes = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    listResearchProjects()
      .then(setProjects)
      .catch(() => setProjects([]));
    const deletes = pendingDeletes.current;
    return () => deletes.forEach((t) => clearTimeout(t));
  }, []);

  const energy = launching ? 1 : Math.min(1, topic.length / 40) * (focused ? 1 : 0.4);

  const start = useCallback(
    async (value?: string) => {
      const trimmed = (value ?? topic).trim();
      if (trimmed.length < 2 || launching) return;
      setLaunching(true);
      setError(null);
      try {
        const [{ project_id }] = await Promise.all([
          createResearch(trimmed),
          new Promise((r) => setTimeout(r, reduce ? 0 : 900)),
        ]);
        router.push(`/project/${project_id}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't start the review.");
        setLaunching(false);
      }
    },
    [topic, launching, router, reduce]
  );

  const removeProject = (p: ProjectSummary) => {
    setProjects((all) => all?.filter((x) => x.id !== p.id) ?? null);
    const timer = setTimeout(async () => {
      pendingDeletes.current.delete(p.id);
      try {
        await deleteResearchProject(p.id);
      } catch {
        toast.show("Couldn't delete that review. It's back in your list.", { tone: "error" });
        listResearchProjects().then(setProjects).catch(() => {});
      }
    }, 5000);
    pendingDeletes.current.set(p.id, timer);
    toast.show(`Deleted “${p.topic.slice(0, 40)}${p.topic.length > 40 ? "…" : ""}”`, {
      duration: 5000,
      action: {
        label: "Undo",
        onClick: () => {
          clearTimeout(timer);
          pendingDeletes.current.delete(p.id);
          setProjects((all) =>
            [...(all ?? []), p].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))
          );
        },
      },
    });
  };

  const visibleProjects = useMemo(() => {
    const q = filter.toLowerCase().trim();
    return (projects ?? []).filter((p) => !q || p.topic.toLowerCase().includes(q));
  }, [projects, filter]);

  const words = HEADLINE.split(" ");

  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative -mt-16 flex min-h-[94vh] items-center overflow-hidden">
        <div aria-hidden="true" className="absolute inset-0 overflow-hidden">
          <div className="nebula right-[-8%] top-[8%] h-[46vw] w-[46vw] opacity-[0.16] dark:opacity-[0.22]" style={{ background: "radial-gradient(circle, var(--aurora), transparent 65%)" }} />
          <div className="nebula bottom-[-14%] right-[22%] h-[34vw] w-[34vw] opacity-[0.10] dark:opacity-[0.14]" style={{ background: "radial-gradient(circle, var(--flare-fill), transparent 65%)", animationDelay: "-9s", animationDuration: "31s" }} />
          <div className="nebula right-[30%] top-[-12%] h-[28vw] w-[28vw] opacity-[0.10] dark:opacity-[0.16]" style={{ background: "radial-gradient(circle, #7d8cff, transparent 65%)", animationDelay: "-4s", animationDuration: "28s" }} />
        </div>
        <Constellation
          className="absolute inset-0 h-full w-full"
          energy={energy}
          pulse={pulse}
          warp={launching}
          focus={{ x: 0.32, y: 0.58 }}
        />
        {/* soft horizon so the copy always reads */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 60% 70% at 18% 55%, var(--background) 30%, transparent 75%), linear-gradient(to top, var(--background), transparent 22%)",
          }}
        />

        <motion.div
          className="relative z-10 mx-auto w-full max-w-7xl px-4 pb-20 pt-32 sm:px-6 lg:px-8"
          animate={launching && !reduce ? { opacity: 0, y: -24, filter: "blur(6px)" } : { opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1], delay: launching ? 0.25 : 0 }}
        >
          <div className="max-w-2xl">
            <h1 className="font-display text-[clamp(2.7rem,6.4vw,5rem)] font-normal leading-[1.02] tracking-[-0.03em] text-foreground">
              {words.map((w, i) => (
                <motion.span
                  key={i}
                  className="inline-block whitespace-pre"
                  initial={reduce ? false : { opacity: 0, y: "0.35em", filter: "blur(10px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  transition={{ duration: 0.8, delay: 0.15 + i * 0.07, ease: [0.2, 0.7, 0.2, 1] }}
                >
                  {w}
                  {i < words.length - 1 ? " " : ""}
                </motion.span>
              ))}
            </h1>

            <motion.p
              className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground"
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.9, duration: 0.8 }}
            >
              Give ResearchMate a topic. Its agents search four academic indexes, read the strongest papers, compare
              them, and map the open problems, with every claim linked back to the paper it came from.
            </motion.p>

            <motion.form
              className="mt-10"
              initial={reduce ? false : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.05, duration: 0.7, ease: [0.2, 0.7, 0.2, 1] }}
              onSubmit={(e) => {
                e.preventDefault();
                start();
              }}
            >
              <label htmlFor="topic-input" className="sr-only">
                Research topic
              </label>
              <div
                className={`relative flex items-center gap-2 rounded-2xl border bg-card/85 p-2 pl-5 backdrop-blur-md transition-[border-color,box-shadow] duration-300 ${
                  focused
                    ? "border-[color-mix(in_oklab,var(--aurora)_55%,transparent)] shadow-[0_0_0_6px_var(--aurora-soft),0_30px_80px_-40px_var(--aurora)]"
                    : "border-border-strong shadow-[0_30px_80px_-50px_rgba(0,0,0,0.8)]"
                }`}
              >
                <Search className="h-5 w-5 flex-none text-muted-foreground" />
                <input
                  id="topic-input"
                  ref={inputRef}
                  value={topic}
                  onChange={(e) => {
                    setTopic(e.target.value);
                    if (e.target.value.length % 4 === 1) setPulse((p) => p + 1);
                    if (error) setError(null);
                  }}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                  placeholder={placeholder || "Describe a research topic"}
                  maxLength={300}
                  autoComplete="off"
                  disabled={launching}
                  className="h-12 min-w-0 flex-1 bg-transparent text-lg focus-visible:outline-none text-foreground outline-none placeholder:text-muted-foreground/70"
                />
                <button
                  type="submit"
                  disabled={topic.trim().length < 2 || launching}
                  className="btn-flare flex h-12 flex-none items-center gap-2 px-5 text-[15px]"
                >
                  {launching ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="hidden sm:inline">Launching</span>
                    </>
                  ) : (
                    <>
                      <span className="hidden sm:inline">Start review</span>
                      <ArrowUp className="h-4 w-4 sm:hidden" />
                    </>
                  )}
                </button>
              </div>

              <AnimatePresence>
                {error && (
                  <motion.p
                    role="alert"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-3 flex items-start gap-2 text-sm text-ember"
                  >
                    <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />
                    {error}
                  </motion.p>
                )}
              </AnimatePresence>

              <div className="mt-5 flex flex-wrap items-center gap-x-1 gap-y-2 text-sm">
                <span className="mr-2 text-muted-foreground">Try</span>
                {EXAMPLES.slice(0, 4).map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    disabled={launching}
                    onClick={() => {
                      setTopic(ex);
                      setPulse((p) => p + 1);
                      inputRef.current?.focus();
                    }}
                    className="rounded-full border border-border px-3 py-1 text-foreground/80 transition-colors hover:border-border-strong hover:bg-muted hover:text-foreground"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </motion.form>
          </div>
        </motion.div>
      </section>

      {/* ── How a review runs ───────────────────────────────────────────── */}
      <section className="mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,320px)_1fr]">
          <div>
            <h2 className="font-display text-3xl leading-tight tracking-[-0.015em]">How a review runs</h2>
            <p className="mt-3 text-muted-foreground">
              Six agents hand work to each other. You can watch every step live, and nothing in the final report is
              written without a paper behind it.
            </p>
          </div>
          <ol className="relative grid grid-cols-1 gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
            {STAGES.map((s, i) => (
              <motion.li
                key={s.name}
                className="relative pl-12"
                initial={reduce ? false : { opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ delay: i * 0.06, duration: 0.5 }}
              >
                <span className="absolute left-0 top-0 grid h-8 w-8 place-items-center rounded-full border border-border-strong font-display text-sm text-muted-foreground">
                  {i + 1}
                </span>
                <h3 className="font-semibold text-foreground">{s.name}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{s.text}</p>
              </motion.li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── Your reviews ────────────────────────────────────────────────── */}
      <section className="mx-auto w-full max-w-7xl px-4 pb-24 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-4">
          <div>
            <h2 className="font-display text-3xl leading-tight tracking-[-0.015em]">Your reviews</h2>
            {projects && projects.length > 0 && (
              <p className="mt-1 text-sm text-muted-foreground">
                {projects.length} {projects.length === 1 ? "review" : "reviews"}
              </p>
            )}
          </div>
          {projects && projects.length > 4 && (
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter reviews"
                aria-label="Filter reviews"
                className="h-9 w-56 rounded-lg border border-border bg-card pl-9 pr-3 text-sm outline-none focus:border-border-strong"
              />
            </div>
          )}
        </div>

        {projects === null ? (
          <div className="space-y-px pt-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-[68px] animate-pulse rounded-lg bg-muted/40" style={{ animationDelay: `${i * 120}ms` }} />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div className="py-14 text-center">
            <p className="text-foreground">No reviews yet.</p>
            <button
              type="button"
              onClick={() => {
                window.scrollTo({ top: 0, behavior: "smooth" });
                setTimeout(() => inputRef.current?.focus(), 400);
              }}
              className="mt-2 text-sm font-semibold text-flare hover:underline"
            >
              Start your first one
            </button>
          </div>
        ) : (
          <ul>
            <AnimatePresence initial={false}>
              {visibleProjects.map((p) => (
                <motion.li
                  key={p.id}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, x: -24, transition: { duration: 0.2 } }}
                  className="group relative border-b border-border"
                >
                  <Link
                    href={`/project/${p.id}`}
                    className="flex items-center gap-4 rounded-lg px-2 py-4 transition-colors hover:bg-muted/50 sm:px-3"
                  >
                    <StatusGlyph status={p.status} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-display text-lg text-foreground">{p.topic}</span>
                      <span className="block text-sm text-muted-foreground">
                        {p.status === "done"
                          ? `${p.papers_count} papers, ${p.gaps_count} gaps`
                          : p.status === "error"
                            ? "Stopped before finishing"
                            : p.current_step || "Running"}
                      </span>
                    </span>
                    <span className="hidden flex-none text-sm text-muted-foreground sm:block">{relativeTime(p.created_at)}</span>
                    <span className="w-9 flex-none" />
                  </Link>
                  <button
                    type="button"
                    onClick={() => removeProject(p)}
                    className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground opacity-100 transition hover:bg-[var(--ember-soft)] hover:text-ember focus:opacity-100 sm:right-3 sm:opacity-0 sm:group-hover:opacity-100"
                    aria-label={`Delete review: ${p.topic}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </motion.li>
              ))}
            </AnimatePresence>
            {visibleProjects.length === 0 && (
              <li className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
                No reviews match “{filter}”.
                <button type="button" onClick={() => setFilter("")} className="inline-flex items-center gap-1 text-flare hover:underline">
                  <X className="h-3.5 w-3.5" /> Clear filter
                </button>
              </li>
            )}
          </ul>
        )}
      </section>
    </>
  );
}

function StatusGlyph({ status }: { status: string }) {
  if (ACTIVE_STATUSES.has(status)) {
    return (
      <span className="grid h-8 w-8 flex-none place-items-center" title="Running">
        <span className="live-dot" />
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-[var(--ember-soft)] text-ember" title="Stopped">
        <AlertTriangle className="h-4 w-4" />
      </span>
    );
  }
  return (
    <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-[var(--aurora-soft)] text-aurora" title="Complete">
      <Check className="h-4 w-4" />
    </span>
  );
}
