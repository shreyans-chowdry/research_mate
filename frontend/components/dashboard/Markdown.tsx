"use client";

import { Children, isValidElement, useMemo, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { slugify } from "@/lib/format";
import { useDashboard } from "./DashboardContext";

/** Turn "[P2]" and "[P1, P3]" into markdown links the renderer turns into citation chips. */
export function linkCitations(md: string): string {
  return md.replace(/\[((?:P\d+)(?:\s*[,;]\s*P\d+)*)\](?!\()/g, (_m, inner: string) =>
    inner
      .split(/\s*[,;]\s*/)
      .map((label) => `[${label}](#cite-${label})`)
      .join("")
  );
}

function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return "";
}

export function CitationChip({ label }: { label: string }) {
  const { papers, goToPaper } = useDashboard();
  const paper = papers.find((p) => p.label === label);
  if (!paper) return <span className="text-muted-foreground">[{label}]</span>;
  return (
    <button
      type="button"
      className="cite"
      title={`${paper.title}${paper.year ? ` (${paper.year})` : ""}`}
      onClick={() => goToPaper(paper.id)}
      aria-label={`Open cited paper ${label}: ${paper.title}`}
    >
      {label}
    </button>
  );
}

export default function Markdown({ content, compact = false }: { content: string; compact?: boolean }) {
  const prepared = useMemo(() => linkCitations(content), [content]);

  const components = useMemo<Components>(
    () => ({
      a({ href, children }) {
        if (href?.startsWith("#cite-")) return <CitationChip label={href.slice(6)} />;
        return (
          <a href={href} target="_blank" rel="noopener noreferrer">
            {children}
          </a>
        );
      },
      h2({ children }) {
        return <h2 id={slugify(textOf(children))}>{children}</h2>;
      },
      h3({ children }) {
        return <h3 id={slugify(textOf(children))}>{children}</h3>;
      },
      table({ children }) {
        return (
          <div className="overflow-x-auto">
            <table>{Children.toArray(children)}</table>
          </div>
        );
      },
    }),
    []
  );

  return (
    <div className={`prose-sky ${compact ? "prose-compact" : ""}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {prepared}
      </ReactMarkdown>
    </div>
  );
}
