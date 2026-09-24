// ─── ResearchMate — Typed API Client ─────────────────────────────────────────
// Fully typed functions matching the exact backend API contract.
// All functions call the real backend — no mock data, no fallbacks.
// ─────────────────────────────────────────────────────────────────────────────

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ─── Type Definitions ────────────────────────────────────────────────────────

export interface PaperAnalysis {
  problem: string;
  methodology: string;
  dataset: string;
  results: string;
  limitations: string;
  future_work: string;
}

export interface PaperWithAnalysis {
  id: string;
  title: string;
  authors: string[];
  year: number;
  oa_status: boolean;
  source: string;
  pdf_url?: string | null;
  doi?: string | null;
  analysis: PaperAnalysis;
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

export interface ResearchGap {
  id: string;
  title: string;
  description: string;
  suggested_direction: string;
  supporting_papers: Array<{ id: string; title: string }>;
}

export interface ResearchStatus {
  status: string;
  current_step: string;
  papers_found: number;
  papers_analyzed: number;
  topic?: string;
  created_at?: string;
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
  papers_count: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function apiFetch<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
    ...options,
  });

  if (!res.ok) {
    const errorBody = await res.text().catch(() => "Unknown error");
    throw new Error(
      `API Error [${res.status}] ${res.statusText}: ${errorBody}`
    );
  }

  // Handle 204 No Content or empty response bodies safely
  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return undefined as unknown as T;
  }

  const text = await res.text();
  if (!text || !text.trim()) {
    return undefined as unknown as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

// ─── Exported API Functions ──────────────────────────────────────────────────

/**
 * Create a new research project by submitting a topic string.
 * The backend will start the autonomous multi-agent pipeline.
 */
export async function createResearch(
  topic: string
): Promise<{ project_id: string }> {
  return apiFetch<{ project_id: string }>("/api/research", {
    method: "POST",
    body: JSON.stringify({ topic }),
  });
}

/**
 * Poll the current status of a research project.
 * Used for the live progress tracker UI.
 */
export async function getResearchStatus(id: string): Promise<ResearchStatus> {
  return apiFetch<ResearchStatus>(`/api/research/${id}/status`);
}

/**
 * Retry or re-dispatch the multi-agent research pipeline for a stuck, interrupted, or failed project.
 */
export async function retryResearch(
  id: string
): Promise<{ status: string; project_id: string }> {
  return apiFetch<{ status: string; project_id: string }>(
    `/api/research/${id}/retry`,
    { method: "POST" }
  );
}

/**
 * Retrieve all papers found for a project, including their structured analysis.
 */
export async function getResearchPapers(
  id: string
): Promise<PaperWithAnalysis[]> {
  return apiFetch<PaperWithAnalysis[]>(`/api/research/${id}/papers`);
}

/**
 * Retrieve the cross-paper comparative synthesis across methodology, dataset, and results dimensions.
 */
export async function getResearchComparison(
  id: string
): Promise<ComparisonDimension[]> {
  return apiFetch<ComparisonDimension[]>(`/api/research/${id}/comparison`);
}

/**
 * Retrieve identified research gaps with supporting paper evidence trails.
 */
export async function getResearchGaps(id: string): Promise<ResearchGap[]> {
  return apiFetch<ResearchGap[]>(`/api/research/${id}/gaps`);
}

/**
 * Retrieve the final synthesized report in Markdown format.
 */
export async function getResearchReport(
  id: string
): Promise<ResearchReport> {
  return apiFetch<ResearchReport>(`/api/research/${id}/report`);
}

/**
 * Retrieve all past research projects.
 */
export async function listResearchProjects(): Promise<ProjectSummary[]> {
  return apiFetch<ProjectSummary[]>("/api/research");
}

/**
 * Delete a research project and all its associated artifacts from history.
 */
export async function deleteResearchProject(id: string): Promise<void> {
  await apiFetch<void>(`/api/research/${id}`, {
    method: "DELETE",
  });
}

/**
 * Generate a download URL for a reference paper.
 */
export function getPaperDownloadUrl(
  projectId: string,
  paperId: string,
  format: "text" | "pdf" = "text"
): string {
  return `${BASE_URL}/api/research/${projectId}/papers/${paperId}/download?format=${format}`;
}

/**
 * Evaluate a user's draft paper against project's synthesized literature and gaps.
 * Accepts either plain text or an uploaded PDF file.
 */
export async function critiqueUserPaper(
  projectId: string,
  params: { title: string; draft_text: string; focus_area?: string; pdf_file?: File }
): Promise<PaperCritique> {
  // If a PDF file is provided, use multipart form data
  if (params.pdf_file) {
    const formData = new FormData();
    formData.append("title", params.title);
    formData.append("focus_area", params.focus_area || "comprehensive");
    formData.append("pdf_file", params.pdf_file);

    const response = await fetch(`${BASE_URL}/api/research/${projectId}/critique-paper-upload`, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      let msg = `Failed to critique paper (${response.status})`;
      try {
        const errorJson = await response.json();
        if (errorJson.detail) msg = errorJson.detail;
      } catch {
        // fallback to default
      }
      throw new Error(msg);
    }

    return response.json();
  }

  // Otherwise send plain text as JSON
  const response = await fetch(`${BASE_URL}/api/research/${projectId}/critique-paper`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title: params.title,
      draft_text: params.draft_text,
      focus_area: params.focus_area,
    }),
  });

  if (!response.ok) {
    let msg = `Failed to critique paper (${response.status})`;
    try {
      const errorJson = await response.json();
      if (errorJson.detail) msg = errorJson.detail;
    } catch {
      // fallback to default
    }
    throw new Error(msg);
  }

  return response.json();
}
