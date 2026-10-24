// ─── ResearchMate — typed API client ─────────────────────────────────────────
// Every function talks to the real backend. No mock data, no silent fallbacks.

const BASE_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/+$/, "");

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PaperAnalysis {
  id?: string;
  problem: string;
  methodology: string;
  dataset: string;
  results: string;
  limitations: string;
  future_work: string;
  model_used?: string | null;
}

export interface PaperWithAnalysis {
  id: string;
  /** Citation label used by the agents in all generated text, e.g. "P2" */
  label: string;
  title: string;
  authors: string[];
  year: number | null;
  source?: string | null;
  oa_status: boolean;
  pdf_url?: string | null;
  doi?: string | null;
  /** 0–1 topic relevance computed during retrieval */
  relevance?: number | null;
  /** Where the analysed text came from */
  text_source?: "pdf" | "abstract" | "metadata" | null;
  analysis: PaperAnalysis | null;
}

export interface CitationSuggestion {
  paper_id: string;
  title: string;
  relevance_reason: string;
}

export interface PaperCritique {
  overall_score: number;
  readiness_level: string;
  executive_summary: string;
  gap_alignment: string;
  methodology_critique: string;
  benchmark_suggestions: string[];
  missing_citations: CitationSuggestion[];
  actionable_recommendations: string[];
  suggested_changes_markdown: string;
}

export type GapSeverity = "high" | "medium" | "low";

export interface ResearchGap {
  id: string;
  title: string;
  description: string;
  suggested_direction: string;
  severity: GapSeverity;
  supporting_papers: Array<{ id: string; title: string }>;
}

export interface AgentEvent {
  id: number;
  agent: string;
  level: "info" | "success" | "warn" | "error";
  message: string;
  at?: string | null;
}

export interface ResearchStatus {
  status: string;
  current_step: string;
  papers_found: number;
  papers_analyzed: number;
  topic?: string;
  created_at?: string;
  completed_at?: string | null;
  error_message?: string | null;
  events: AgentEvent[];
}

export interface ComparisonDimension {
  dimension: string;
  summary: string;
}

export interface ResearchReport {
  content_markdown: string;
  created_at: string;
}

export interface ProjectSummary {
  id: string;
  topic: string;
  status: string;
  current_step?: string;
  created_at?: string;
  completed_at?: string | null;
  papers_count: number;
  gaps_count: number;
}

export interface AskTurn {
  role: "user" | "assistant";
  content: string;
}

export interface AskAnswer {
  answer_markdown: string;
  citations: Array<{ label: string; paper_id: string; title: string }>;
}

export const ACTIVE_STATUSES = new Set(["pending", "searching", "analyzing", "comparing", "gap_finding", "verifying", "reporting"]);

// ─── Errors ──────────────────────────────────────────────────────────────────

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function readError(res: Response): Promise<string> {
  const body = await res.text().catch(() => "");
  try {
    const json = JSON.parse(body);
    if (typeof json?.detail === "string") return json.detail;
    if (Array.isArray(json?.detail)) return json.detail.map((d: { msg?: string }) => d.msg).join("; ");
  } catch {
    // not JSON
  }
  return body || `${res.status} ${res.statusText}`;
}

async function apiFetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        ...(options?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
        ...options?.headers,
      },
    });
  } catch {
    throw new ApiError(0, `Can't reach the ResearchMate server at ${BASE_URL}. Check that the backend is running.`);
  }

  if (!res.ok) throw new ApiError(res.status, await readError(res));
  if (res.status === 204) return undefined as T;

  const text = await res.text();
  if (!text.trim()) return undefined as T;
  return JSON.parse(text) as T;
}

// ─── Projects ────────────────────────────────────────────────────────────────

export function createResearch(topic: string) {
  return apiFetch<{ project_id: string }>("/api/research", { method: "POST", body: JSON.stringify({ topic }) });
}

/** Status plus agent events with id greater than `sinceEvent`. */
export function getResearchStatus(id: string, sinceEvent = 0) {
  return apiFetch<ResearchStatus>(`/api/research/${id}/status?since_event=${sinceEvent}`);
}

export function retryResearch(id: string) {
  return apiFetch<{ status: string; project_id: string }>(`/api/research/${id}/retry`, { method: "POST" });
}

export function listResearchProjects() {
  return apiFetch<ProjectSummary[]>("/api/research");
}

export async function deleteResearchProject(id: string): Promise<void> {
  await apiFetch<void>(`/api/research/${id}`, { method: "DELETE" });
}

// ─── Artifacts ───────────────────────────────────────────────────────────────

export function getResearchPapers(id: string) {
  return apiFetch<PaperWithAnalysis[]>(`/api/research/${id}/papers`);
}

export function getResearchComparison(id: string) {
  return apiFetch<ComparisonDimension[]>(`/api/research/${id}/comparison`);
}

export function getResearchGaps(id: string) {
  return apiFetch<ResearchGap[]>(`/api/research/${id}/gaps`);
}

export function getResearchReport(id: string) {
  return apiFetch<ResearchReport>(`/api/research/${id}/report`);
}

export function getPaperDownloadUrl(projectId: string, paperId: string, format: "text" | "pdf" = "text") {
  return `${BASE_URL}/api/research/${projectId}/papers/${paperId}/download?format=${format}`;
}

// ─── Ask & critique ──────────────────────────────────────────────────────────

export function askCorpus(projectId: string, question: string, history: AskTurn[]) {
  return apiFetch<AskAnswer>(`/api/research/${projectId}/ask`, {
    method: "POST",
    body: JSON.stringify({ question, history }),
  });
}

export function critiqueUserPaper(
  projectId: string,
  params: { title: string; draft_text: string; focus_area?: string; pdf_file?: File }
) {
  if (params.pdf_file) {
    const form = new FormData();
    form.append("title", params.title);
    form.append("focus_area", params.focus_area || "comprehensive");
    form.append("pdf_file", params.pdf_file);
    return apiFetch<PaperCritique>(`/api/research/${projectId}/critique-paper-upload`, { method: "POST", body: form });
  }
  return apiFetch<PaperCritique>(`/api/research/${projectId}/critique-paper`, {
    method: "POST",
    body: JSON.stringify({ title: params.title, draft_text: params.draft_text, focus_area: params.focus_area }),
  });
}
