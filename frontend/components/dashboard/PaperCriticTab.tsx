"use client";

import React, { useState, useRef } from "react";
import {
  Sparkles,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Award,
  ArrowRight,
  BookOpen,
  Download,
  Copy,
  Check,
  Send,
  ListCheck,
  Cpu,
  Database,
  ExternalLink,
  Loader2,
  HelpCircle,
  Lightbulb,
  Upload,
  X,
} from "lucide-react";
import {
  critiqueUserPaper,
  PaperCritique,
  PaperWithAnalysis,
  ResearchGap,
} from "@/lib/api";

interface PaperCriticTabProps {
  projectId: string;
  topic?: string;
  papers: PaperWithAnalysis[];
  gaps: ResearchGap[];
  onNavigateToPaper?: (paperId: string) => void;
}

export default function PaperCriticTab({
  projectId,
  topic,
  papers,
  gaps,
  onNavigateToPaper,
}: PaperCriticTabProps) {
  const [title, setTitle] = useState("");
  const [draftText, setDraftText] = useState("");
  const [focusArea, setFocusArea] = useState("comprehensive");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [critique, setCritique] = useState<PaperCritique | null>(null);
  const [copiedReview, setCopiedReview] = useState(false);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [inputMode, setInputMode] = useState<"text" | "pdf">("text");
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Pre-fill sample draft tailored to this research topic
  const handleLoadSample = () => {
    const sampleTopic = topic || "Distributed Database Engines";
    setTitle(`Adaptive High-Throughput Formulations for ${sampleTopic}`);
    setDraftText(
      `Abstract:\nRecent advancements in ${sampleTopic} face critical trade-offs between execution throughput, verification latency, and operational scalability under non-stationary workloads. In this manuscript, we present an adaptive framework incorporating modular abstractions to minimize transaction abort cascades and eliminate state-synchronization bottlenecks.\n\n` +
      `Methodology Overview:\nWe formulate an empirical evaluation pipeline contrasting our model against standard baselines across synthetic trace workloads. We observe preliminary latency reductions of up to 24% under moderate concurrency regimes, though evaluation under adversarial distribution shifts remains ongoing.\n\n` +
      `Current Limitations:\nOur validation is currently restricted to simulated cluster nodes. We have not yet completed multi-node cross-datacenter stress testing, nor have we integrated certified formal verification proofs.`
    );
    setPdfFile(null);
    setInputMode("text");
    setError(null);
  };

  const handleFileSelect = (file: File) => {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setError("Only PDF files are accepted. Please upload a .pdf file.");
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setError("PDF file is too large. Maximum size is 50MB.");
      return;
    }
    setPdfFile(file);
    setError(null);
    setDraftText("");
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    if (inputMode === "text" && !draftText.trim()) return;
    if (inputMode === "pdf" && !pdfFile) return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await critiqueUserPaper(projectId, {
        title: title.trim(),
        draft_text: inputMode === "text" ? draftText.trim() : "PDF uploaded",
        focus_area: focusArea,
        pdf_file: inputMode === "pdf" ? (pdfFile ?? undefined) : undefined,
      });
      setCritique(result);
    } catch (err: any) {
      console.error("Critique error:", err);
      setError(
        err?.message ||
          "Failed to generate manuscript critique. Please try again."
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyReview = () => {
    if (!critique) return;
    const text = [
      `# Peer Review & Improvement Suggestions: ${title}`,
      `Score: ${critique.overall_score}/100 (${critique.readiness_level})`,
      `\n## Executive Summary\n${critique.executive_summary}`,
      `\n## Literature Gap Alignment\n${critique.gap_alignment}`,
      `\n## Methodology & Baselines Critique\n${critique.methodology_critique}`,
      `\n## Recommended Benchmark Datasets\n${critique.benchmark_suggestions.map((b) => `- ${b}`).join("\n")}`,
      `\n## Priority Actionable Revisions\n${critique.actionable_recommendations.map((r) => `- ${r}`).join("\n")}`,
      `\n## Suggested Changes\n${critique.suggested_changes_markdown}`,
    ].join("\n");

    navigator.clipboard.writeText(text);
    setCopiedReview(true);
    setTimeout(() => setCopiedReview(false), 2000);
  };

  const handleDownloadMarkdown = () => {
    if (!critique) return;
    const markdownContent = [
      `# Peer Review & Manuscript Recommendations`,
      `**Evaluated Paper:** ${title}`,
      `**Target Topic Domain:** ${topic || "Academic Research"}`,
      `**Overall Readiness Score:** ${critique.overall_score} / 100 — *${critique.readiness_level}*`,
      `\n---\n`,
      `## 1. Executive Viability Summary\n${critique.executive_summary}`,
      `\n## 2. Positioning Against Synthesized Literature Gaps\n${critique.gap_alignment}`,
      `\n## 3. Methodological Rigor & Baseline Critique\n${critique.methodology_critique}`,
      `\n## 4. Recommended Benchmark Datasets & Metrics\n${critique.benchmark_suggestions.map((b) => `* ${b}`).join("\n")}`,
      `\n## 5. Candidate Papers to Contrast & Cite\n${critique.missing_citations.map((c) => `* **${c.title}**: ${c.relevance_reason}`).join("\n")}`,
      `\n## 6. Actionable Pre-Submission Revision Checklist\n${critique.actionable_recommendations.map((r) => `- [ ] ${r}`).join("\n")}`,
      `\n---\n`,
      `\n${critique.suggested_changes_markdown}`,
    ].join("\n");

    const blob = new Blob([markdownContent], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Manuscript_Critique_${title.slice(0, 30).replace(/[^a-zA-Z0-9]/g, "_")}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-8 animate-fade-in">
      {/* ── Header Spotlight ── */}
      <div className="p-6 sm:p-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-gradient-to-br from-indigo-50/70 via-white to-purple-50/40 dark:from-[#0c101a] dark:via-[#101524] dark:to-[#161c32] shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-xs font-mono font-bold uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5" />
              Manuscript Optimizer & Peer Review Critic
            </div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white">
              Evaluate Your Paper Against Synthesized Literature
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 max-w-2xl leading-relaxed">
              Input your manuscript title and draft, abstract, or methodology. Our AI peer reviewer benchmarks your paper directly against the{" "}
              <strong className="text-slate-800 dark:text-slate-200">{papers.length} harvested peer-reviewed papers</strong> and{" "}
              <strong className="text-slate-800 dark:text-slate-200">{gaps.length} synthesized research gaps</strong> from this investigation to recommend concrete revisions.
            </p>
          </div>

          <button
            type="button"
            onClick={handleLoadSample}
            className="self-start sm:self-center inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-white dark:bg-[#131826] border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-indigo-500 hover:text-indigo-600 transition-all shadow-xs shrink-0"
          >
            <Lightbulb className="w-3.5 h-3.5 text-amber-500" />
            Load Sample Draft
          </button>
        </div>
      </div>

      {/* ── Submission Form ── */}
      <form
        onSubmit={handleSubmit}
        className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0c101a] shadow-sm space-y-5"
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Paper Title */}
          <div className="sm:col-span-2 space-y-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide">
              Paper Title
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Adaptive Snapshot Isolation for Distributed Transactional Engines"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-[#131826] text-slate-900 dark:text-white placeholder:text-slate-400 text-xs sm:text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
            />
          </div>

          {/* Focus Area */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide">
              Review Focus Area
            </label>
            <select
              value={focusArea}
              onChange={(e) => setFocusArea(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-[#131826] text-slate-900 dark:text-white text-xs sm:text-sm outline-none focus:border-indigo-500 transition-all"
            >
              <option value="comprehensive">Comprehensive Review (All)</option>
              <option value="methodology">Methodology & Baselines</option>
              <option value="gaps">Literature Gap Alignment</option>
              <option value="benchmarks">Datasets & Experimental Rigor</option>
            </select>
          </div>
        </div>

        {/* Input Mode Toggle */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-[#131826] border border-slate-200 dark:border-slate-800 w-fit">
          <button
            type="button"
            onClick={() => { setInputMode("text"); setPdfFile(null); }}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              inputMode === "text"
                ? "bg-white dark:bg-[#1e2438] text-indigo-600 dark:text-indigo-400 shadow-sm"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-700"
            }`}
          >
            <FileText className="w-3.5 h-3.5 inline mr-1.5" />
            Paste Text
          </button>
          <button
            type="button"
            onClick={() => { setInputMode("pdf"); setDraftText(""); }}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              inputMode === "pdf"
                ? "bg-white dark:bg-[#1e2438] text-indigo-600 dark:text-indigo-400 shadow-sm"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-700"
            }`}
          >
            <Upload className="w-3.5 h-3.5 inline mr-1.5" />
            Upload PDF
          </button>
        </div>

        {/* Draft Text / Abstract — shown in text mode */}
        {inputMode === "text" && (
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide">
                Manuscript Draft / Abstract / Methodology
              </label>
              <span className="text-[11px] font-mono text-slate-400">
                {draftText.length} characters • {draftText.trim().split(/\s+/).filter(Boolean).length} words
              </span>
            </div>
            <textarea
              required={inputMode === "text"}
              rows={7}
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
              placeholder="Paste your paper's abstract, problem formulation, methodology section, or experimental results here..."
              className="w-full px-3.5 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-[#131826] text-slate-900 dark:text-white placeholder:text-slate-400 text-xs sm:text-sm font-sans leading-relaxed outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
            />
          </div>
        )}

        {/* PDF Upload Zone — shown in pdf mode */}
        {inputMode === "pdf" && (
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide">
              Upload Research Paper (PDF)
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileSelect(file);
              }}
            />

            {!pdfFile ? (
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`cursor-pointer flex flex-col items-center justify-center gap-3 py-10 rounded-xl border-2 border-dashed transition-all ${
                  isDragOver
                    ? "border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/20"
                    : "border-slate-300 dark:border-slate-700 bg-slate-50/30 dark:bg-[#131826] hover:border-indigo-400 hover:bg-indigo-50/20 dark:hover:bg-indigo-950/10"
                }`}
              >
                <div className="w-12 h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center">
                  <Upload className="w-6 h-6 text-indigo-500" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                    Drop your PDF here or click to browse
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Maximum file size: 50MB • PDF format only
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between p-4 rounded-xl border border-emerald-300 dark:border-emerald-800/60 bg-emerald-50/50 dark:bg-emerald-950/20">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                    <FileText className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900 dark:text-white truncate max-w-[300px]">
                      {pdfFile.name}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {(pdfFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => { setPdfFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                  className="p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-950/30 text-red-500 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="p-3 rounded-xl border border-rose-300 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/30 text-rose-800 dark:text-rose-300 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Submit Button */}
        <div className="flex items-center justify-between pt-2">
          <p className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:block">
            Cross-referenced with {papers.length} peer-reviewed references in this investigation.
          </p>

          <button
            type="submit"
            disabled={isLoading || !title.trim() || (inputMode === "text" ? !draftText.trim() : !pdfFile)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm text-white bg-gradient-to-r from-indigo-600 via-indigo-700 to-purple-600 hover:from-indigo-500 hover:to-purple-500 shadow-md shadow-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Evaluating Manuscript…</span>
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                <span>Analyze & Suggest Improvements</span>
              </>
            )}
          </button>
        </div>
      </form>

      {/* ── Critique Results View ── */}
      {critique && (
        <div className="space-y-6 animate-fade-in">
          {/* Top Score Banner */}
          <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0c101a] shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-center gap-5">
              {/* Score circle */}
              <div className="w-18 h-18 sm:w-20 sm:h-20 rounded-2xl flex flex-col items-center justify-center bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border border-indigo-200 dark:border-indigo-800/60 shrink-0">
                <span className="text-2xl sm:text-3xl font-extrabold text-indigo-600 dark:text-indigo-400">
                  {critique.overall_score}
                </span>
                <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider">
                  / 100
                </span>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Manuscript Readiness
                  </span>
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400">
                    <Award className="w-3.5 h-3.5" />
                    {critique.readiness_level}
                  </span>
                </div>
                <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-snug">
                  {title}
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 max-w-xl leading-relaxed">
                  {critique.executive_summary}
                </p>
              </div>
            </div>

            {/* Actions: Copy & Download */}
            <div className="flex items-center gap-2 self-start md:self-center shrink-0">
              <button
                type="button"
                onClick={handleCopyReview}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors"
                title="Copy Review to Clipboard"
              >
                {copiedReview ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                    <span className="text-emerald-600 dark:text-emerald-400 font-bold">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleDownloadMarkdown}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white transition-colors shadow-xs"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Report (.md)</span>
              </button>
            </div>
          </div>

          {/* Grid: Gap Alignment & Methodology Critique */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Gap Alignment */}
            <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0c101a] shadow-xs space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-fuchsia-600 dark:text-fuchsia-400">
                <Sparkles className="w-4 h-4" />
                <span>Positioning Against Literature Gaps</span>
              </div>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                {critique.gap_alignment}
              </p>
            </div>

            {/* Methodology Critique */}
            <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0c101a] shadow-xs space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                <Cpu className="w-4 h-4" />
                <span>Methodological Rigor & Baselines</span>
              </div>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                {critique.methodology_critique}
              </p>
            </div>
          </div>

          {/* Benchmark Suggestions & Actionable Recommendations */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Recommended Benchmarks */}
            <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0c101a] shadow-xs space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-sky-600 dark:text-sky-400">
                <Database className="w-4 h-4" />
                <span>Suggested Benchmarks & Datasets</span>
              </div>
              <ul className="space-y-2">
                {critique.benchmark_suggestions.map((bench, idx) => (
                  <li key={idx} className="flex items-start gap-2.5 text-xs text-slate-700 dark:text-slate-300">
                    <span className="w-1.5 h-1.5 rounded-full bg-sky-500 mt-1.5 shrink-0" />
                    <span className="leading-relaxed">{bench}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Actionable Recommendations */}
            <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0c101a] shadow-xs space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                <ListCheck className="w-4 h-4" />
                <span>Pre-Submission Action Checklist</span>
              </div>
              <ul className="space-y-2">
                {critique.actionable_recommendations.map((rec, idx) => (
                  <li key={idx} className="flex items-start gap-2.5 text-xs text-slate-700 dark:text-slate-300">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                    <span className="leading-relaxed">{rec}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Missing Citations from this Project Corpus */}
          {critique.missing_citations && critique.missing_citations.length > 0 && (
            <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0c101a] shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                  <BookOpen className="w-4 h-4 text-indigo-500" />
                  <span>Key Literature from this Investigation to Cite & Contrast</span>
                </div>
                <span className="text-[11px] font-mono text-slate-400">
                  {critique.missing_citations.length} recommended reference{critique.missing_citations.length === 1 ? "" : "s"}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                {critique.missing_citations.map((cite, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800/80 bg-slate-50/50 dark:bg-[#131826] space-y-1.5"
                  >
                    <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 line-clamp-2">
                      {cite.title}
                    </h4>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-snug">
                      {cite.relevance_reason}
                    </p>
                    {cite.paper_id && onNavigateToPaper && (
                      <button
                        type="button"
                        onClick={() => onNavigateToPaper(cite.paper_id)}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline pt-1"
                      >
                        <span>Inspect in Papers tab</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Detailed Suggestions Section */}
          <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0c101a] shadow-xs space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
              Detailed Section-by-Section Editorial Advice
            </h4>
            <div className="prose prose-sm dark:prose-invert max-w-none text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-line font-sans">
              {critique.suggested_changes_markdown}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
