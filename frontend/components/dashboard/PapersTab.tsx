"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, ExternalLink, FileDown, FileText, Search } from "lucide-react";
import { getPaperDownloadUrl, type PaperWithAnalysis } from "@/lib/api";
import { useDashboard } from "./DashboardContext";

const FIELDS: Array<{ key: keyof NonNullable<PaperWithAnalysis["analysis"]>; label: string }> = [
  { key: "problem", label: "Problem" },
  { key: "methodology", label: "Method" },
  { key: "dataset", label: "Data and benchmarks" },
  { key: "results", label: "Results" },
  { key: "limitations", label: "Limitations" },
  { key: "future_work", label: "Future work" },
];

const SOURCE_NAMES: Record<string, string> = {
  openalex: "OpenAlex",
  semanticscholar: "Semantic Scholar",
  europe_pmc: "Europe PMC",
  arxiv: "arXiv",
};

function shortAuthors(a: string[]) {
  if (!a.length) return "Unknown authors";
  if (a.length <= 2) return a.join(" and ");
  return `${a[0]} et al.`;
}

function isMissing(text?: string | null) {
  return !text || text.startsWith("Not reported");
}

export default function PapersTab() {
  const { papers, projectId, focusedPaperId } = useDashboard();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"relevance" | "year">("relevance");
  const [open, setOpen] = useState<Set<string>>(() => new Set(focusedPaperId ? [focusedPaperId] : papers.slice(0, 1).map((p) => p.id)));
  const [flash, setFlash] = useState<string | null>(null);
  const [lastFocus, setLastFocus] = useState<string | null>(null);

  // Opening a paper from elsewhere (a gap, a citation chip) expands and highlights it.
  if (focusedPaperId !== lastFocus) {
    setLastFocus(focusedPaperId);
    if (focusedPaperId) {
      setOpen((s) => new Set(s).add(focusedPaperId));
      setFlash(focusedPaperId);
    }
  }

  useEffect(() => {
    if (!focusedPaperId) return;
    const t1 = setTimeout(
      () => document.getElementById(`paper-${focusedPaperId}`)?.scrollIntoView({ behavior: "smooth", block: "start" }),
      80
    );
    const t2 = setTimeout(() => setFlash(null), 1800);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [focusedPaperId]);

  const list = useMemo(() => {
    const q = query.toLowerCase().trim();
    const filtered = papers.filter(
      (p) =>
        !q ||
        p.title.toLowerCase().includes(q) ||
        p.authors.some((a) => a.toLowerCase().includes(q)) ||
        Object.values(p.analysis ?? {}).some((v) => typeof v === "string" && v.toLowerCase().includes(q))
    );
    return sort === "year" ? [...filtered].sort((a, b) => (b.year ?? 0) - (a.year ?? 0)) : filtered;
  }, [papers, query, sort]);

  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const fullText = papers.filter((p) => p.text_source === "pdf").length;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search titles, authors, methods, datasets"
            aria-label="Search papers"
            className="h-10 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-sm outline-none focus:border-border-strong"
          />
        </div>
        <div className="flex rounded-lg border border-border p-0.5 text-sm" role="group" aria-label="Sort papers">
          {(["relevance", "year"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setSort(k)}
              aria-pressed={sort === k}
              className={`relative rounded-md px-3 py-1.5 capitalize ${sort === k ? "text-foreground" : "text-muted-foreground"}`}
            >
              {sort === k && <motion.span layoutId="paper-sort" className="absolute inset-0 rounded-md bg-muted" />}
              <span className="relative">{k === "year" ? "Newest" : "Relevance"}</span>
            </button>
          ))}
        </div>
        <p className="w-full text-sm text-muted-foreground sm:w-auto">
          {fullText} of {papers.length} read in full; the rest from abstracts.
        </p>
      </div>

      {list.length === 0 && <p className="py-12 text-center text-muted-foreground">No papers match “{query}”.</p>}

      <ul className="space-y-3">
        {list.map((p) => {
          const isOpen = open.has(p.id);
          return (
            <li
              key={p.id}
              id={`paper-${p.id}`}
              className={`panel scroll-mt-36 overflow-hidden transition-[box-shadow,border-color] duration-500 ${
                flash === p.id ? "border-[color-mix(in_oklab,var(--flare)_60%,transparent)] shadow-[0_0_0_5px_var(--flare-soft)]" : ""
              }`}
            >
              <button
                type="button"
                onClick={() => toggle(p.id)}
                aria-expanded={isOpen}
                className="flex w-full items-start gap-4 p-5 text-left transition-colors hover:bg-muted/40"
              >
                <span className="mt-0.5 w-9 flex-none text-sm font-bold text-flare">{p.label}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-[1.2rem] leading-snug text-foreground">{p.title}</span>
                  <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                    <span>{shortAuthors(p.authors)}</span>
                    {p.year && <span>{p.year}</span>}
                    {p.source && <span>{SOURCE_NAMES[p.source] ?? p.source}</span>}
                    <span className={p.text_source === "pdf" ? "text-aurora" : ""}>
                      {p.text_source === "pdf" ? "Full text read" : "Abstract only"}
                    </span>
                  </span>
                </span>
                {typeof p.relevance === "number" && (
                  <span className="hidden w-28 flex-none sm:block" title={`Topic relevance ${Math.round(p.relevance * 100)}%`}>
                    <span className="mb-1 block text-right text-xs text-muted-foreground">{Math.round(p.relevance * 100)}% match</span>
                    <span className="block h-1 overflow-hidden rounded-full bg-muted">
                      <motion.span
                        className="block h-full rounded-full bg-aurora"
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.max(4, p.relevance * 100)}%` }}
                        transition={{ duration: 0.8, ease: "easeOut" }}
                      />
                    </span>
                  </span>
                )}
                <motion.span animate={{ rotate: isOpen ? 180 : 0 }} className="mt-1 flex-none text-muted-foreground">
                  <ChevronDown className="h-5 w-5" />
                </motion.span>
              </button>

              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
                    className="overflow-hidden"
                  >
                    <div className="border-t border-border px-5 pb-5 pt-4 sm:pl-[4.25rem]">
                      {p.analysis ? (
                        <dl className="grid grid-cols-1 gap-x-8 gap-y-5 md:grid-cols-2">
                          {FIELDS.map((f) => {
                            const v = p.analysis?.[f.key] as string | undefined;
                            return (
                              <div key={f.key}>
                                <dt className="text-sm font-semibold text-foreground">{f.label}</dt>
                                <dd className={`mt-1 text-[15px] leading-relaxed ${isMissing(v) ? "italic text-muted-foreground" : "text-foreground/85"}`}>
                                  {isMissing(v) ? "Not stated in the text the agent could read." : v}
                                </dd>
                              </div>
                            );
                          })}
                        </dl>
                      ) : (
                        <p className="text-muted-foreground">This paper wasn’t analysed.</p>
                      )}

                      <div className="mt-5 flex flex-wrap gap-2">
                        {p.pdf_url && (
                          <a href={p.pdf_url} target="_blank" rel="noopener noreferrer" className="btn-quiet flex h-9 items-center gap-2 px-3 text-sm">
                            <FileDown className="h-4 w-4" /> Open PDF
                          </a>
                        )}
                        {p.doi && (
                          <a href={`https://doi.org/${p.doi}`} target="_blank" rel="noopener noreferrer" className="btn-quiet flex h-9 items-center gap-2 px-3 text-sm">
                            <ExternalLink className="h-4 w-4" /> DOI
                          </a>
                        )}
                        <a href={getPaperDownloadUrl(projectId, p.id, "text")} className="btn-quiet flex h-9 items-center gap-2 px-3 text-sm">
                          <FileText className="h-4 w-4" /> Text the agent read
                        </a>
                        {p.authors.length > 2 && <span className="self-center text-sm text-muted-foreground">{p.authors.join(", ")}</span>}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
