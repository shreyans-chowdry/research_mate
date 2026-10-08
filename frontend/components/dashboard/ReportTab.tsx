"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, useScroll, useSpring } from "motion/react";
import { Check, Copy, Download, Printer } from "lucide-react";
import { downloadText, slugify } from "@/lib/format";
import { useDashboard } from "./DashboardContext";
import Markdown from "./Markdown";

export default function ReportTab() {
  const { report, topic, papers } = useDashboard();
  const [copied, setCopied] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 200, damping: 30 });

  const md = report?.content_markdown ?? "";
  const toc = useMemo(
    () =>
      md
        .split("\n")
        .filter((l) => /^##\s/.test(l))
        .map((l) => {
          const text = l.replace(/^##\s+/, "").replace(/[*_`]/g, "").trim();
          return { text, id: slugify(text) };
        }),
    [md]
  );

  useEffect(() => {
    if (!toc.length) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (vis[0]) setActiveId(vis[0].target.id);
      },
      { rootMargin: "-20% 0px -70% 0px" }
    );
    const t = setTimeout(() => toc.forEach((h) => {
      const el = document.getElementById(h.id);
      if (el) obs.observe(el);
    }), 100);
    return () => {
      clearTimeout(t);
      obs.disconnect();
    };
  }, [toc]);

  if (!md) {
    return <p className="py-20 text-center text-muted-foreground">The report hasn’t been written yet.</p>;
  }

  const words = md.split(/\s+/).filter(Boolean).length;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(md);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  };

  // Append a references key so the exported Markdown makes sense outside the app.
  const exportMd = () => {
    const refs = papers
      .map((p) => `- [${p.label}] ${p.authors.slice(0, 3).join(", ")}${p.authors.length > 3 ? " et al." : ""} (${p.year ?? "n.d."}). ${p.title}.${p.doi ? ` https://doi.org/${p.doi}` : ""}`)
      .join("\n");
    downloadText(`${slugify(topic)}-literature-review.md`, `${md}\n\n---\n\n### Citation key\n\n${refs}\n`, "text/markdown;charset=utf-8");
  };

  return (
    <div>
      <motion.div className="no-print fixed left-0 right-0 top-0 z-[60] h-[2px] origin-left bg-flare-fill" style={{ scaleX: progress }} />

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="no-print lg:sticky lg:top-36 lg:self-start">
          <div className="flex flex-wrap gap-2 lg:flex-col">
            <button type="button" onClick={copy} className="btn-quiet flex h-9 items-center gap-2 px-3 text-sm">
              {copied ? <Check className="h-4 w-4 text-aurora" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied" : "Copy Markdown"}
            </button>
            <button type="button" onClick={exportMd} className="btn-quiet flex h-9 items-center gap-2 px-3 text-sm">
              <Download className="h-4 w-4" /> Download .md
            </button>
            <button type="button" onClick={() => window.print()} className="btn-quiet flex h-9 items-center gap-2 px-3 text-sm">
              <Printer className="h-4 w-4" /> Print or save PDF
            </button>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            {words.toLocaleString()} words, about {Math.max(1, Math.round(words / 230))} min read
          </p>
          {toc.length > 1 && (
            <nav className="mt-6 hidden lg:block" aria-label="Report sections">
              <ul className="space-y-0.5 border-l border-border">
                {toc.map((h) => (
                  <li key={h.id}>
                    <a
                      href={`#${h.id}`}
                      className={`-ml-px block border-l py-1.5 pl-4 text-sm leading-snug transition-colors ${
                        activeId === h.id ? "border-flare text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {h.text}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          )}
        </aside>

        <article className="max-w-[44rem]">
          <p className="print-only mb-6 text-sm">ResearchMate literature review: {topic}</p>
          <Markdown content={md} />
        </article>
      </div>
    </div>
  );
}
