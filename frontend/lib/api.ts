// ─── ResearchMate — Typed API Client ─────────────────────────────────────────
// Fully typed functions matching the exact backend API contract.
// Toggle MOCK_MODE for local development when backend is offline.
// ─────────────────────────────────────────────────────────────────────────────

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/**
 * Toggle this to `true` (or set NEXT_PUBLIC_MOCK_MODE=true in .env.local)
 * when developing without the backend running.
 * All functions will return realistic mock data after simulated delays.
 */
export const MOCK_MODE =
  process.env.NEXT_PUBLIC_MOCK_MODE === "true" || false;

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

// ─── Mock Data Fixtures ──────────────────────────────────────────────────────

const MOCK_PROJECT_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

const MOCK_PAPERS: PaperWithAnalysis[] = [
  {
    id: "paper-001-uuid",
    title:
      "Deep Learning-Based Ransomware Detection in Industrial Control Systems",
    authors: ["Zhang, Wei", "Kumar, Anil", "Patel, Sneha"],
    year: 2023,
    oa_status: true,
    source: "openalex",
    analysis: {
      problem:
        "Existing signature-based ransomware detection methods fail to identify zero-day ransomware variants targeting SCADA and ICS networks, leaving critical infrastructure vulnerable to evolving threats.",
      methodology:
        "Proposed a hybrid CNN-LSTM architecture trained on API call sequences and network traffic flow features extracted from simulated ICS environments. Uses adversarial training to improve robustness against evasion attacks.",
      dataset:
        "Custom-built dataset comprising 15,000 ransomware samples and 20,000 benign samples collected from VirusTotal and ICS-CERT advisories (2019–2023). Supplemented with CICIDS2017 network traces.",
      results:
        "Achieved 97.3% detection accuracy with a false positive rate of 1.8%. Outperformed traditional ML baselines (Random Forest: 91.2%, SVM: 88.7%) and static analysis tools.",
      limitations:
        "Training data is biased toward Windows-based ransomware; limited representation of Linux/RTOS variants common in embedded ICS devices. Real-time inference latency (340ms) may be too slow for time-critical SCADA operations.",
      future_work:
        "Extend to cross-platform detection covering Linux and real-time operating systems. Investigate federated learning approaches to enable collaborative model training across distributed ICS facilities without sharing sensitive operational data.",
    },
  },
  {
    id: "paper-002-uuid",
    title:
      "Behavioral Analysis of Ransomware Propagation in Cyber-Physical Systems",
    authors: ["Martinez, Carlos", "Lee, Jiyoung", "Okonkwo, Chidi"],
    year: 2022,
    oa_status: true,
    source: "semanticscholar",
    analysis: {
      problem:
        "Current ransomware analysis frameworks focus on IT networks and neglect the unique propagation patterns in cyber-physical systems where operational technology (OT) protocols like Modbus and DNP3 are exploited.",
      methodology:
        "Developed a graph-based behavioral analysis framework that models ransomware propagation across IT/OT network boundaries. Uses temporal graph neural networks to capture lateral movement patterns.",
      dataset:
        "Testbed environment with 8 PLCs, 3 HMIs, and simulated SCADA network. Injected 12 ransomware families including WannaCry, Ryuk, and custom OT-targeted variants.",
      results:
        "Detected lateral movement with 94.6% accuracy and reduced mean time to detection from 47 minutes to 8.3 minutes compared to traditional IDS solutions.",
      limitations:
        "Testbed scale is limited; production ICS networks may have thousands of interconnected devices with heterogeneous protocols. Graph construction overhead increases quadratically with network size.",
      future_work:
        "Scale evaluation to larger, more realistic ICS environments. Integrate with existing SIEM platforms for deployment in production SOC workflows.",
    },
  },
  {
    id: "paper-003-uuid",
    title:
      "Federated Anomaly Detection for Ransomware in Distributed SCADA Networks",
    authors: ["Singh, Priya", "Hoffmann, Felix", "Al-Rashidi, Mohammed"],
    year: 2024,
    oa_status: false,
    source: "openalex",
    analysis: {
      problem:
        "Centralized anomaly detection models require sharing sensitive operational data from geographically distributed SCADA installations, creating privacy and regulatory compliance barriers (NERC CIP, IEC 62443).",
      methodology:
        "Implemented a federated learning framework using FedAvg and FedProx algorithms. Each SCADA site trains a local autoencoder-based anomaly detector; only model gradients are shared with a central aggregator.",
      dataset:
        "Data from 5 simulated power grid substations, each generating 72 hours of operational telemetry including normal operations and 6 ransomware attack scenarios.",
      results:
        "Federated model achieved 92.1% detection rate, only 3.2% lower than a centralized model trained on pooled data, while maintaining complete data privacy. Communication overhead reduced by 78% using gradient compression.",
      limitations:
        "Non-IID data distributions across sites led to convergence instability in some training rounds. The autoencoder architecture may miss sophisticated ransomware that closely mimics normal operational patterns.",
      future_work:
        "Explore personalized federated learning to handle non-IID heterogeneity. Investigate differential privacy mechanisms to provide formal privacy guarantees beyond the implicit privacy of federated aggregation.",
    },
  },
];

const MOCK_COMPARISONS: ComparisonDimension[] = [
  {
    dimension: "methodology",
    summary:
      "The surveyed approaches span three distinct methodological paradigms: (1) supervised deep learning with hybrid CNN-LSTM architectures for feature-level classification (Zhang et al., 2023), (2) graph-based behavioral analysis using temporal graph neural networks for propagation tracking (Martinez et al., 2022), and (3) federated anomaly detection with distributed autoencoders for privacy-preserving detection (Singh et al., 2024). While Zhang et al. focus on per-sample classification at the endpoint level, Martinez et al. take a network-wide perspective by modeling inter-device relationships. Singh et al. uniquely address the multi-site deployment challenge but sacrifice some detection accuracy for privacy guarantees. Notably, none of the approaches combine endpoint-level and network-level features in a unified detection framework.",
  },
  {
    dimension: "dataset",
    summary:
      "Dataset construction varies significantly across studies, revealing a critical gap in standardized benchmarks for ICS ransomware research. Zhang et al. (2023) rely on the largest sample pool (35,000 total samples) but source primarily from general-purpose malware repositories with limited ICS-specific context. Martinez et al. (2022) use a controlled testbed with only 12 ransomware families, providing higher ecological validity but limited diversity. Singh et al. (2024) generate synthetic operational telemetry from simulated substations, enabling privacy-compliant experimentation but raising questions about generalization to real-world conditions. No study uses a shared or publicly available ICS-focused ransomware dataset, hindering reproducibility and cross-study comparison.",
  },
  {
    dimension: "results",
    summary:
      "Detection accuracy ranges from 92.1% to 97.3%, with an inverse relationship between privacy preservation and raw performance. Zhang et al. (2023) achieve the highest accuracy (97.3%) with centralized training, but at the cost of requiring complete data access and significant inference latency (340ms). Martinez et al. (2022) prioritize detection speed, reducing mean time to detection by 82% compared to traditional IDS approaches, though their graph construction overhead limits scalability. Singh et al. (2024) demonstrate that federated approaches can achieve competitive performance (92.1%) with substantially lower communication costs, though convergence remains sensitive to data heterogeneity across sites. All studies report limited evaluation against adversarial evasion, leaving open the question of robustness under active countermeasures.",
  },
];

const MOCK_GAPS: ResearchGap[] = [
  {
    id: "gap-001-uuid",
    title:
      "Absence of Unified Endpoint-Network Detection Frameworks for ICS Ransomware",
    description:
      "Current approaches treat endpoint-level behavioral analysis and network-level propagation detection as orthogonal problems. Zhang et al. (2023) focus exclusively on host-level API calls, while Martinez et al. (2022) analyze network-level lateral movement. No existing work combines both perspectives into a unified detection pipeline that can correlate endpoint anomalies with network propagation indicators, which would significantly reduce both false positive rates and detection latency.",
    suggested_direction:
      "Develop a multi-layer detection architecture that fuses endpoint behavioral features (system calls, file system operations) with network graph features (lateral movement patterns, protocol anomalies) using attention-based feature fusion, enabling correlated detection across the IT/OT boundary.",
    supporting_papers: [
      {
        id: "paper-001-uuid",
        title:
          "Deep Learning-Based Ransomware Detection in Industrial Control Systems",
      },
      {
        id: "paper-002-uuid",
        title:
          "Behavioral Analysis of Ransomware Propagation in Cyber-Physical Systems",
      },
    ],
  },
  {
    id: "gap-002-uuid",
    title:
      "No Standardized Benchmark Dataset for ICS/SCADA Ransomware Research",
    description:
      "All three surveyed papers construct proprietary datasets with different collection methodologies, attack scenarios, and scale — making meaningful cross-study comparison impossible. The lack of a standardized, publicly available ICS ransomware benchmark (analogous to CICIDS or UNSW-NB15 for general network intrusion detection) remains a fundamental barrier to reproducible research in this domain.",
    suggested_direction:
      "Establish a community-driven open benchmark comprising diverse ransomware families across multiple ICS protocols (Modbus, DNP3, OPC-UA), incorporating both endpoint telemetry and network traffic captures from realistic testbed environments with standardized labeling conventions.",
    supporting_papers: [
      {
        id: "paper-001-uuid",
        title:
          "Deep Learning-Based Ransomware Detection in Industrial Control Systems",
      },
      {
        id: "paper-002-uuid",
        title:
          "Behavioral Analysis of Ransomware Propagation in Cyber-Physical Systems",
      },
      {
        id: "paper-003-uuid",
        title:
          "Federated Anomaly Detection for Ransomware in Distributed SCADA Networks",
      },
    ],
  },
  {
    id: "gap-003-uuid",
    title:
      "Limited Adversarial Robustness Evaluation for ICS Ransomware Detectors",
    description:
      "While Zhang et al. (2023) incorporate adversarial training, none of the surveyed works systematically evaluate detector robustness against sophisticated evasion techniques specifically crafted for ICS environments — such as slow-and-low attacks that mimic normal SCADA polling intervals, or polymorphic ransomware that adapts its behavior based on the detected OT environment.",
    suggested_direction:
      "Design a comprehensive adversarial evaluation framework for ICS ransomware detectors, including novel evasion strategies that exploit OT-specific characteristics (e.g., deterministic communication patterns, predictable polling cycles) and evaluate existing detectors under these threat models.",
    supporting_papers: [
      {
        id: "paper-001-uuid",
        title:
          "Deep Learning-Based Ransomware Detection in Industrial Control Systems",
      },
      {
        id: "paper-003-uuid",
        title:
          "Federated Anomaly Detection for Ransomware in Distributed SCADA Networks",
      },
    ],
  },
];

const MOCK_REPORT: ResearchReport = {
  content_markdown: `# Literature Review: AI-Based Ransomware Detection in Cyber-Physical Systems

## 1. Executive Summary

This report synthesizes findings from 3 peer-reviewed publications (2022–2024) on AI-based ransomware detection methods targeting industrial control systems (ICS) and SCADA networks. The analysis reveals three critical research gaps that present opportunities for novel contributions to this rapidly evolving field.

## 2. Background & Motivation

Ransomware attacks on critical infrastructure have increased by 87% since 2021, with notable incidents including the Colonial Pipeline attack and the Oldsmar water treatment facility breach. Traditional IT-focused detection methods prove insufficient for operational technology (OT) environments due to unique protocol stacks, real-time constraints, and the convergence of IT/OT networks.

## 3. Methodology Comparison

| Aspect | Zhang et al. (2023) | Martinez et al. (2022) | Singh et al. (2024) |
|--------|---------------------|----------------------|---------------------|
| **Approach** | Hybrid CNN-LSTM | Temporal GNN | Federated Autoencoders |
| **Scope** | Endpoint-level | Network-level | Multi-site |
| **Accuracy** | 97.3% | 94.6% | 92.1% |
| **Key Strength** | Highest accuracy | Fastest detection | Privacy-preserving |

## 4. Identified Research Gaps

### Gap 1: Unified Endpoint-Network Detection
No existing work combines host-level behavioral analysis with network-level propagation detection, missing correlated attack indicators that span the IT/OT boundary.

### Gap 2: Standardized Benchmarks
The absence of a public, standardized ICS ransomware dataset prevents reproducible comparison across detection methods and hinders community progress.

### Gap 3: Adversarial Robustness
Systematic evaluation against ICS-specific evasion strategies remains unexplored, leaving deployed detectors vulnerable to adaptive adversaries.

## 5. Recommended Future Directions

1. **Multi-layer fusion architectures** combining endpoint and network features with attention mechanisms
2. **Community-driven benchmark development** with standardized ICS attack scenarios
3. **Adversarial evaluation frameworks** targeting OT-specific evasion vectors
4. **Real-time deployment optimization** for latency-critical SCADA environments

## 6. References

1. Zhang, W., Kumar, A., & Patel, S. (2023). Deep Learning-Based Ransomware Detection in Industrial Control Systems.
2. Martinez, C., Lee, J., & Okonkwo, C. (2022). Behavioral Analysis of Ransomware Propagation in Cyber-Physical Systems.
3. Singh, P., Hoffmann, F., & Al-Rashidi, M. (2024). Federated Anomaly Detection for Ransomware in Distributed SCADA Networks.
`,
  created_at: "2024-11-15T14:30:00Z",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

const mockProjectStartTimes = new Map<string, number>();

/**
 * Create a new research project by submitting a topic string.
 * The backend will start the autonomous multi-agent pipeline.
 */
export async function createResearch(
  topic: string
): Promise<{ project_id: string }> {
  if (MOCK_MODE) {
    await delay(600);
    const id = `mock-${Date.now().toString(36)}`;
    mockProjectStartTimes.set(id, Date.now());
    return { project_id: id };
  }

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
  if (MOCK_MODE) {
    await delay(200);
    const startTime = mockProjectStartTimes.get(id) || Date.now() - 15000;
    const elapsedSec = (Date.now() - startTime) / 1000;

    if (elapsedSec < 3) {
      return {
        status: "pending",
        current_step: "Formulating multi-angle semantic search queries...",
        papers_found: 0,
        papers_analyzed: 0,
      };
    } else if (elapsedSec < 7) {
      return {
        status: "searching",
        current_step: "Retrieving candidate papers from OpenAlex and Semantic Scholar...",
        papers_found: 12,
        papers_analyzed: 0,
      };
    } else if (elapsedSec < 14) {
      const analyzed = Math.min(12, Math.max(1, Math.floor(((elapsedSec - 7) / 7) * 12)));
      return {
        status: "analyzing",
        current_step: `Extracting methodology, benchmarks, and limitations (${analyzed}/12)...`,
        papers_found: 12,
        papers_analyzed: analyzed,
      };
    } else if (elapsedSec < 18) {
      return {
        status: "comparing",
        current_step: "Cross-paper comparative synthesis across dimensions...",
        papers_found: 12,
        papers_analyzed: 12,
      };
    } else if (elapsedSec < 22) {
      return {
        status: "gap_finding",
        current_step: "Synthesizing unaddressed research gaps with citation evidence...",
        papers_found: 12,
        papers_analyzed: 12,
      };
    } else if (elapsedSec < 26) {
      return {
        status: "reporting",
        current_step: "Compiling executive academic synthesis report...",
        papers_found: 12,
        papers_analyzed: 12,
      };
    } else {
      return {
        status: "done",
        current_step: "Pipeline complete. Research gaps synthesized.",
        papers_found: 12,
        papers_analyzed: 12,
      };
    }
  }

  return apiFetch<ResearchStatus>(`/api/research/${id}/status`);
}

/**
 * Retry or re-dispatch the multi-agent research pipeline for a stuck, interrupted, or failed project.
 */
export async function retryResearch(
  id: string
): Promise<{ status: string; project_id: string }> {
  if (MOCK_MODE) {
    await delay(300);
    mockProjectStartTimes.set(id, Date.now());
    return { status: "restarted", project_id: id };
  }

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
  if (MOCK_MODE) {
    await delay(400);
    return MOCK_PAPERS;
  }

  return apiFetch<PaperWithAnalysis[]>(`/api/research/${id}/papers`);
}

/**
 * Retrieve the cross-paper comparative synthesis across methodology, dataset, and results dimensions.
 */
export async function getResearchComparison(
  id: string
): Promise<ComparisonDimension[]> {
  if (MOCK_MODE) {
    await delay(350);
    return MOCK_COMPARISONS;
  }

  return apiFetch<ComparisonDimension[]>(`/api/research/${id}/comparison`);
}

/**
 * Retrieve identified research gaps with supporting paper evidence trails.
 */
export async function getResearchGaps(id: string): Promise<ResearchGap[]> {
  if (MOCK_MODE) {
    await delay(400);
    return MOCK_GAPS;
  }

  return apiFetch<ResearchGap[]>(`/api/research/${id}/gaps`);
}

/**
 * Retrieve the final synthesized report in Markdown format.
 */
export async function getResearchReport(
  id: string
): Promise<ResearchReport> {
  if (MOCK_MODE) {
    await delay(500);
    return MOCK_REPORT;
  }

  return apiFetch<ResearchReport>(`/api/research/${id}/report`);
}

/**
 * Retrieve all past research projects.
 */
export async function listResearchProjects(): Promise<ProjectSummary[]> {
  if (MOCK_MODE) {
    return [];
  }

  return apiFetch<ProjectSummary[]>("/api/research");
}

/**
 * Delete a research project and all its associated artifacts from history.
 */
export async function deleteResearchProject(id: string): Promise<void> {
  if (MOCK_MODE) {
    return;
  }

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
 */
export async function critiqueUserPaper(
  projectId: string,
  params: { title: string; draft_text: string; focus_area?: string }
): Promise<PaperCritique> {
  if (MOCK_MODE) {
    await delay(1200);
    return {
      overall_score: 80,
      readiness_level: "Solid Draft with Key Revisions Needed",
      executive_summary: `The submitted manuscript presents an insightful angle on the research topic. Experimental baselines need anchoring against recently synthesized literature gaps.`,
      gap_alignment: "Partially aligns with identified literature gaps, particularly cross-environment robustness.",
      methodology_critique: "The core architecture is sound, but lacks formal ablation studies and runtime latency benchmarks.",
      benchmark_suggestions: [
        "Include standardized domain benchmark suites.",
        "Perform stress tests under distribution shifts.",
        "Provide 5-fold cross-validation with statistical significance tests."
      ],
      missing_citations: [
        {
          paper_id: "mock-1",
          title: "Related State-of-the-Art Baseline",
          relevance_reason: "Foundational baseline that should be contrasted in Related Work."
        }
      ],
      actionable_recommendations: [
        "Explicitly differentiate your contribution in the Introduction.",
        "Add a comparative baseline table.",
        "Discuss limitations and edge cases in the Discussion."
      ],
      suggested_changes_markdown: "### Priority Manuscript Enhancements\n\n1. **Abstract**: Quantify results.\n2. **Related Work**: Position against gaps.\n3. **Ablations**: Show component contributions."
    };
  }

  const response = await fetch(`${BASE_URL}/api/research/${projectId}/critique-paper`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Failed to critique paper: ${response.status} ${errorBody}`);
  }

  return response.json();
}

