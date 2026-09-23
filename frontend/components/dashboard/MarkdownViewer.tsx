"use client";

import React, { useMemo } from "react";

interface MarkdownViewerProps {
  content: string;
}

export default function MarkdownViewer({ content }: MarkdownViewerProps) {
  // Parse markdown lines into structured elements
  const elements = useMemo(() => {
    if (!content) return null;

    const lines = content.split("\n");
    const parsed: React.ReactNode[] = [];
    let inTable = false;
    let tableHeaders: string[] = [];
    let tableRows: string[][] = [];
    let inCodeBlock = false;
    let codeBlockContent: string[] = [];

    const flushTable = (key: string) => {
      if (tableHeaders.length > 0 || tableRows.length > 0) {
        parsed.push(
          <div key={`table-${key}`} className="my-6 overflow-x-auto rounded-xl border border-border/60 bg-card/60">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-border/80 bg-secondary/60">
                  {tableHeaders.map((th, i) => (
                    <th key={i} className="px-4 py-3 font-semibold text-foreground">
                      {th.trim()}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {tableRows.map((row, rIdx) => (
                  <tr key={rIdx} className="hover:bg-secondary/30 transition-colors">
                    {row.map((cell, cIdx) => (
                      <td key={cIdx} className="px-4 py-2.5 text-muted-foreground">
                        {renderInlineFormatting(cell.trim())}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      inTable = false;
      tableHeaders = [];
      tableRows = [];
    };

    const flushCodeBlock = (key: string) => {
      if (codeBlockContent.length > 0) {
        parsed.push(
          <pre
            key={`code-${key}`}
            className="my-4 p-4 rounded-xl bg-[#080b11] border border-border/60 font-mono text-xs text-foreground/90 overflow-x-auto"
          >
            <code>{codeBlockContent.join("\n")}</code>
          </pre>
        );
      }
      inCodeBlock = false;
      codeBlockContent = [];
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Code blocks
      if (line.startsWith("```")) {
        if (inCodeBlock) {
          flushCodeBlock(`code-end-${i}`);
        } else {
          if (inTable) flushTable(`table-${i}`);
          inCodeBlock = true;
          codeBlockContent = [];
        }
        continue;
      }

      if (inCodeBlock) {
        codeBlockContent.push(line);
        continue;
      }

      // Tables
      if (line.trim().startsWith("|") && line.trim().endsWith("|")) {
        const cells = line
          .split("|")
          .slice(1, -1)
          .map((c) => c.trim());

        // Check if separator line e.g. |---|---|
        if (cells.every((c) => /^[-:]+$/.test(c))) {
          continue;
        }

        if (!inTable) {
          inTable = true;
          tableHeaders = cells;
        } else {
          tableRows.push(cells);
        }
        continue;
      } else if (inTable) {
        flushTable(`table-${i}`);
      }

      // Headings
      if (line.startsWith("# ")) {
        parsed.push(
          <h1 key={i} className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground mt-8 mb-4 border-b border-border/50 pb-2">
            {renderInlineFormatting(line.slice(2))}
          </h1>
        );
        continue;
      }
      if (line.startsWith("## ")) {
        parsed.push(
          <h2 key={i} className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground mt-6 mb-3">
            {renderInlineFormatting(line.slice(3))}
          </h2>
        );
        continue;
      }
      if (line.startsWith("### ")) {
        parsed.push(
          <h3 key={i} className="text-base sm:text-lg font-semibold text-foreground/90 mt-4 mb-2">
            {renderInlineFormatting(line.slice(4))}
          </h3>
        );
        continue;
      }

      // Blockquotes
      if (line.startsWith("> ")) {
        parsed.push(
          <blockquote key={i} className="my-3 pl-4 border-l-2 border-primary text-muted-foreground italic text-sm">
            {renderInlineFormatting(line.slice(2))}
          </blockquote>
        );
        continue;
      }

      // Unordered lists
      if (line.startsWith("- ") || line.startsWith("* ")) {
        parsed.push(
          <li key={i} className="ml-5 list-disc text-sm text-muted-foreground my-1 leading-relaxed">
            {renderInlineFormatting(line.slice(2))}
          </li>
        );
        continue;
      }

      // Horizontal rule
      if (line.trim() === "---" || line.trim() === "***") {
        parsed.push(<hr key={i} className="my-6 border-border/50" />);
        continue;
      }

      // Empty line
      if (!line.trim()) {
        continue;
      }

      // Standard paragraph
      parsed.push(
        <p key={i} className="text-sm text-muted-foreground leading-relaxed my-2">
          {renderInlineFormatting(line)}
        </p>
      );
    }

    if (inTable) flushTable("end");
    if (inCodeBlock) flushCodeBlock("end");

    return parsed;
  }, [content]);

  return <div className="space-y-1">{elements}</div>;
}

function renderInlineFormatting(text: string): React.ReactNode {
  // Support bold: **bold**, code: `code`, and plain text
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith("**") && token.endsWith("**")) {
      parts.push(
        <strong key={match.index} className="font-semibold text-foreground">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith("`") && token.endsWith("`")) {
      parts.push(
        <code
          key={match.index}
          className="px-1.5 py-0.5 rounded bg-secondary/80 text-primary font-mono text-xs border border-border/50"
        >
          {token.slice(1, -1)}
        </code>
      );
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts.length > 0 ? parts : text;
}
