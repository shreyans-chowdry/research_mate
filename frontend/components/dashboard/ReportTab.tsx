"use client";

import React, { useState } from "react";
import {
  FileText,
  Copy,
  Check,
  Download,
  Printer,
  Calendar,
  Sparkles,
  BookOpen,
} from "lucide-react";
import { ResearchReport } from "@/lib/api";
import MarkdownViewer from "./MarkdownViewer";

interface ReportTabProps {
  report: ResearchReport | null;
  topic?: string;
  projectId: string;
}

export default function ReportTab({ report, topic, projectId }: ReportTabProps) {
  const [copied, setCopied] = useState(false);

  const markdownContent = report?.content_markdown || "";

  const handleCopy = () => {
    if (!markdownContent) return;
    navigator.clipboard.writeText(markdownContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!markdownContent) return;
    const blob = new Blob([markdownContent], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const safeTopic = (topic || "research-report").toLowerCase().replace(/[^a-z0-9]+/g, "-");
    link.download = `ResearchMate-${safeTopic}-${projectId.slice(0, 8)}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    window.print();
  };

  if (!report || !markdownContent) {
    return (
      <div className="p-12 text-center rounded-2xl border border-border/50 bg-card/40 space-y-3">
        <FileText className="w-10 h-10 text-muted-foreground/50 mx-auto" />
        <h3 className="text-base font-semibold text-foreground">Report Under Compilation</h3>
        <p className="text-xs text-muted-foreground max-w-sm mx-auto">
          The Reporting Agent is compiling the executive academic synthesis. It will appear here once ready.
        </p>
      </div>
    );
  }

  // Word count estimate
  const wordCount = markdownContent.split(/\s+/).filter(Boolean).length;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Action Bar ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl border border-border/60 bg-card/60">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
            <BookOpen className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground">Executive Synthesis Report</h3>
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground font-mono">
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {report.created_at ? new Date(report.created_at).toLocaleDateString() : "Synthesized live"}
              </span>
              <span>•</span>
              <span>{wordCount.toLocaleString()} words</span>
            </div>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-2">
          {/* Copy Button */}
          <button
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border border-border/60 bg-secondary/50 text-foreground hover:bg-secondary hover:border-border transition-all"
            id="copy-report-button"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-success" />
                <span className="text-success">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy Markdown</span>
              </>
            )}
          </button>

          {/* Download Button */}
          <button
            onClick={handleDownload}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-primary text-white hover:bg-primary/90 transition-all shadow-sm"
            id="download-report-button"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download .MD</span>
          </button>

          {/* Print Button */}
          <button
            onClick={handlePrint}
            className="p-2 rounded-xl border border-border/60 bg-secondary/50 text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
            title="Print or Save as PDF"
            aria-label="Print report"
          >
            <Printer className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Document Container ── */}
      <div className="rounded-2xl border border-border/70 bg-card p-6 sm:p-10 shadow-lg dark:shadow-none">
        <article className="dark:prose-invert max-w-none">
          <MarkdownViewer content={markdownContent} />
        </article>
      </div>
    </div>
  );
}
