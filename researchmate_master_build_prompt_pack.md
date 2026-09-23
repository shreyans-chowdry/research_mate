# ResearchMate — Master Build Prompt Pack

**Project:** ResearchMate — Autonomous Agentic AI Research Assistant  
**Team (2 Members):**
- **Shreyans Chowdry:** Backend Architecture, Search/PDF Pipelines, Database, & LangGraph Multi-Agent System
- **Swapnil:** Frontend Dashboard, Real-time Pipeline Visualizer, Gaps UI, & Report Presentation  
**Deliverable:** Working full-stack demo for faculty presentation  

---

# 1. Project Overview & Differentiation

**Core Concept:** ResearchMate accepts a single research topic string, dispatches autonomous agents to retrieve, parse, and analyze academic literature, compares methodologies, and synthesizes cross-paper research gaps backed by explicit citation evidence trails.

### Competitive Differentiation

| Existing Tool | Core Strength | Where It Falls Short | ResearchMate Advantage |
|---|---|---|---|
| **scite.ai** | Smart citation sentiment analysis | Does not synthesize unaddressed research gaps across multiple papers | Automatically clusters recurring limitations across papers into explicit gap statements |
| **Elicit** | Systematic extraction tables | Gap identification is manual; user must deduce omissions themselves | Synthesizes methodology and dataset trade-offs automatically |
| **Consensus** | Claim consensus checking | Answers narrow questions rather than analyzing methodological frontiers | End-to-end literature synthesis with linked evidence |
| **ResearchRabbit** | Citation graph visualization | No deep content extraction or gap derivation | Full text extraction, cross-paper comparison, and synthesis |

---

# 2. Shared Contracts & Specifications

### 2.1 Repository Structure

```
researchmate/
├── frontend/                  # Next.js App Router (Swapnil)
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx           # Topic search input
│   │   └── project/[id]/
│   │       └── page.tsx       # Live status tracker & tabbed views
│   ├── components/            # UI components (shadcn/ui)
│   ├── lib/
│   │   └── api.ts             # Typed API client
│   └── .env.example
├── backend/                   # FastAPI + LangGraph + Pipelines (Shreyans)
│   ├── api/
│   │   ├── main.py            # FastAPI entry point & CORS
│   │   ├── routers/           # Endpoint handlers
│   │   └── agents/            # LangGraph multi-agent graph & LLM clients
│   ├── pipeline/
│   │   ├── search_service.py  # OpenAlex & Semantic Scholar integrations
│   │   └── pdf_service.py     # PDF download & PyMuPDF extraction
│   ├── db/
│   │   ├── schema.sql         # Base PostgreSQL schema
│   │   └── database.py        # Connection & session management
│   ├── requirements.txt
│   └── .env.example
├── docker-compose.yml
└── README.md
```

### 2.2 PostgreSQL Database Schema

```sql
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  topic text not null,
  status text not null default 'pending', -- pending | searching | analyzing | comparing | gap_finding | reporting | done | error
  current_step text default 'Initializing...',
  error_message text,
  created_at timestamptz default now()
);

create table if not exists papers (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  title text not null,
  authors text[],
  year int,
  source text,                          -- 'openalex' | 'semanticscholar'
  doi text,
  pdf_url text,
  oa_status boolean default false,
  raw_text text
);

create table if not exists paper_analysis (
  id uuid primary key default gen_random_uuid(),
  paper_id uuid references papers(id) on delete cascade,
  problem text,
  methodology text,
  dataset text,
  results text,
  limitations text,
  future_work text,
  model_used text
);

create table if not exists comparisons (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  dimension text,                       -- 'methodology' | 'dataset' | 'results'
  summary text
);

create table if not exists gaps (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  title text not null,
  description text not null,
  suggested_direction text not null,
  supporting_paper_ids uuid[]
);

create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  content_markdown text not null,
  created_at timestamptz default now()
);
```

### 2.3 REST API Endpoints

| Method | Endpoint | Request Body | Response Body |
|---|---|---|---|
| `POST` | `/api/research` | `{"topic": string}` | `{"project_id": string}` |
| `GET` | `/api/research/{id}/status` | — | `{"status": string, "current_step": string, "papers_found": int, "papers_analyzed": int}` |
| `GET` | `/api/research/{id}/papers` | — | `[{"id": uuid, "title": string, "authors": string[], "year": int, "oa_status": bool, "analysis": {...}}]` |
| `GET` | `/api/research/{id}/comparison` | — | `[{"dimension": string, "summary": string}]` |
| `GET` | `/api/research/{id}/gaps` | — | `[{"id": uuid, "title": string, "description": string, "suggested_direction": string, "supporting_papers": [{"id": uuid, "title": string}]}]` |
| `GET` | `/api/research/{id}/report` | — | `{"content_markdown": string, "created_at": string}` |

---

# 3. Model Routing Strategy

| Pipeline Stage | Target Model | Rationale |
|---|---|---|
| Query Generation (Topic $\to$ 3–6 queries) | **Gemini 2.5 Flash** | Fast, inexpensive, structured JSON output |
| Per-Paper Extraction (Problem, Method, Dataset, Limitations) | **Gemini 2.5 Flash** | High repetition ($N$ times per run); cost and speed prioritized |
| Cross-Paper Comparative Synthesis | **Claude Opus 4.6 / Claude Sonnet** | High-context comparative reasoning across heterogeneous studies |
| Gap Synthesis & Evidence Correlation | **Claude Opus 4.6 / Claude Sonnet** | Flagship analytical task; requires deep synthesis and zero hallucination |
| Final Executive Report Composition | **Claude Opus 4.6 / Claude Sonnet** | Long-form academic narrative quality |

---

# 4. Team Git Workflow

- `main`: Protected production branch, verified demo state.
- `develop`: Shared integration branch where both teammates merge verified steps.
- `feature/<name>`: Short-lived feature branches branched off `develop`.

```bash
# Branch creation workflow
git checkout develop
git pull origin develop
git checkout -b feature/<feature-name>

# Commit & Push
git add .
git commit -m "feat: implement <feature-description>"
git push origin feature/<feature-name>

# PR feature/<feature-name> into develop, review, merge, then clean up
git checkout develop
git pull origin develop
git branch -d feature/<feature-name>
```

---

# 5. Shreyans — Step-by-Step Prompts (Backend, Pipelines & Agents)

Execute these prompts sequentially in your AI IDE workspace. Only move to the next step once the current step compiles and tests successfully.

```
════════════════════════════════════════════════════════════════════════════════
STEP 1: DATABASE SETUP & CONNECTION MANAGEMENT
════════════════════════════════════════════════════════════════════════════════
You are building Step 1 of the ResearchMate backend.
Context: We are building a FastAPI backend backed by PostgreSQL / Supabase.

TASKS:
1. Create `backend/db/schema.sql` containing the exact DDL provided in Section 2.2 of the project contract (projects, papers, paper_analysis, comparisons, gaps, reports).
2. Create `backend/db/database.py` using SQLAlchemy (async engine preferred, or synchronous psycopg2 / SQLModel).
   - Read `DATABASE_URL` from environment variables.
   - Provide helper connection functions and tables initialization check (`init_db()`).
3. Create `backend/.env.example` containing:
   - DATABASE_URL=postgresql://postgres:password@localhost:5432/researchmate
   - ANTHROPIC_API_KEY=
   - GOOGLE_API_KEY=
   - PORT=8000
4. Create a lightweight test script `backend/db/test_db.py` that verifies the connection and creates tables if they do not exist.

CONSTRAINTS:
- Do not modify table or field names.
- Do not write any agent or API code in this step.
```

```
════════════════════════════════════════════════════════════════════════════════
STEP 2: ACADEMIC SEARCH & PDF RETRIEVAL PIPELINE
════════════════════════════════════════════════════════════════════════════════
You are building Step 2 of the ResearchMate backend: the data acquisition pipeline.

TASKS:
1. Implement `backend/pipeline/search_service.py`:
   - Function: `search_papers(queries: list[str], year_min: int = 2017, limit_per_query: int = 6) -> list[dict]`
   - Query both OpenAlex API (https://api.openalex.org/works) and Semantic Scholar API (https://api.semanticscholar.org/graph/v1/paper/search). Neither requires a mandatory paid key.
   - De-duplicate papers across queries using normalized DOIs and lowercased titles.
   - Output normalized dictionaries:
     `{"title": str, "authors": list[str], "year": int, "source": str, "doi": str, "pdf_url": str, "oa_status": bool}`
   - Implement exponential backoff for HTTP rate limits (429 handling).

2. Implement `backend/pipeline/pdf_service.py`:
   - Function: `download_and_extract_pdf(pdf_url: str) -> str`
   - Use `httpx` with realistic browser User-Agent headers and a 15-second timeout.
   - Use `PyMuPDF` (`fitz`) to extract text from byte streams.
   - Heuristically strip reference lists (e.g., cut off after "References" or "Bibliography" headings) to conserve LLM token context.
   - If download or extraction fails, catch exceptions gracefully and return an empty string (do not crash).

3. Create `backend/pipeline/test_pipeline.py` testing queries with topic "AI ransomware detection" and verify paper deduplication and extraction.

CONSTRAINTS:
- Keep plain Python with explicit typing. Do not include agent or route logic yet.
```

```
════════════════════════════════════════════════════════════════════════════════
STEP 3: MULTI-AGENT SYSTEM & MODEL CLIENTS
════════════════════════════════════════════════════════════════════════════════
You are building Step 3 of the ResearchMate backend: the multi-agent reasoning graph.

TASKS:
1. Implement `backend/api/agents/llm_client.py`:
   - Provide `call_flash(prompt: str, json_mode: bool = False) -> str` using Google Gemini (`gemini-2.5-flash`).
   - Provide `call_opus(prompt: str, system: str = "") -> str` using Anthropic API (`claude-opus-4-6` or `claude-3-7-sonnet`).
   - Read keys strictly from `GOOGLE_API_KEY` and `ANTHROPIC_API_KEY`.

2. Implement `backend/api/agents/orchestrator.py` using LangGraph (or an explicit functional state graph):
   - State dictionary: `{"project_id": str, "topic": str, "queries": list, "papers": list, "analyses": list, "comparisons": list, "gaps": list, "report": str}`
   - Node A: `query_generation_agent` (Gemini Flash) -> Generates 3-5 academic search queries.
   - Node B: `retrieval_node` -> Calls `search_papers` and `download_and_extract_pdf`. Saves papers to database.
   - Node C: `paper_analysis_agent` (Gemini Flash) -> Iterates over extracted texts. Produces JSON with:
     `{problem, methodology, dataset, results, limitations, future_work}`. Writes to `paper_analysis` table.
   - Node D: `comparison_agent` (Claude) -> Synthesizes 3 comparative paragraphs across all analyses:
     `dimension='methodology'`, `dimension='dataset'`, and `dimension='results'`.
   - Node E: `gap_identification_agent` (Claude) -> Analyzes recurring limitations from all papers. Produces 2-5 structured gaps:
     `{title, description, suggested_direction, supporting_paper_ids}`. Ensure IDs reference real paper rows.
   - Node F: `report_generation_agent` (Claude) -> Assembles an executive academic report in Markdown.
   - Ensure the state updates `projects.status` and `projects.current_step` after each node.

CONSTRAINTS:
- Guard all agent steps with error handling that sets `projects.status = 'error'` on failure.
- Extraction must strictly output valid JSON.
```

```
════════════════════════════════════════════════════════════════════════════════
STEP 4: FASTAPI APPLICATION & REST API ENDPOINTS
════════════════════════════════════════════════════════════════════════════════
You are building Step 4 of the ResearchMate backend: FastAPI endpoints and background task integration.

TASKS:
1. Create `backend/api/main.py`:
   - Configure FastAPI with CORS middleware enabled for `http://localhost:3000` (Next.js default).
   - Include router mounted at `/api`.

2. Implement routers matching the exact API contract:
   - `POST /api/research` -> Accepts `{"topic": str}`, inserts a new project row (`status='pending'`), launches the orchestrator graph via `BackgroundTasks`, returns `{"project_id": str}`.
   - `GET /api/research/{id}/status` -> Returns `{"status": str, "current_step": str, "papers_found": int, "papers_analyzed": int}`.
   - `GET /api/research/{id}/papers` -> Returns papers list with joined `paper_analysis` records.
   - `GET /api/research/{id}/comparison` -> Returns list of comparison rows.
   - `GET /api/research/{id}/gaps` -> Returns gaps with resolved paper details:
     `[{"id": uuid, "title": str, "description": str, "suggested_direction": str, "supporting_papers": [{"id": uuid, "title": str}]}]`.
   - `GET /api/research/{id}/report` -> Returns `{"content_markdown": str, "created_at": str}`.

3. Add health check endpoint `GET /api/health` returning `{"status": "ok"}`.

CONSTRAINTS:
- Do not alter route paths or field names.
- Ensure all DB connections in background tasks clean up sessions properly.
```

```
════════════════════════════════════════════════════════════════════════════════
STEP 5: DOCKER COMPOSE & FULL PIPELINE VERIFICATION
════════════════════════════════════════════════════════════════════════════════
You are building Step 5 of the ResearchMate backend: deployment packaging and verification.

TASKS:
1. Create `backend/Dockerfile` using `python:3.11-slim`.
2. Create root `docker-compose.yml` spinning up:
   - `postgres`: image `postgres:16-alpine`, ports `5432:5432`, volume for persistence.
   - `backend`: builds `./backend`, mounts environment variables from `.env`, depends on `postgres`.
3. Provide a test verification script `backend/test_run.py` that submits a POST request to `/api/research` with `"adversarial robustness in machine learning"`, polls the status endpoint until done, and prints the generated gaps.
4. Output terminal commands to commit and push this completed work to `feature/backend-api` targeting `develop`.
```

---

# 6. Swapnil — Step-by-Step Prompts (Frontend & UI/UX)

Execute these prompts sequentially in your Next.js AI workspace. Test and verify each step in browser before advancing.

```
════════════════════════════════════════════════════════════════════════════════
STEP 1: NEXT.JS SCAFFOLDING & TYPED API CLIENT
════════════════════════════════════════════════════════════════════════════════
You are building Step 1 of the ResearchMate frontend.

TECH STACK:
- Next.js 14+ (App Router) with TypeScript
- Tailwind CSS
- Lucide React & shadcn/ui components

TASKS:
1. Initialize the layout in `frontend/app/layout.tsx` with a modern dark-first design, navbar showing "ResearchMate" branding, and status indicators.
2. Implement `frontend/lib/api.ts`:
   - Read base URL from `process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"`.
   - Include a fallback `MOCK_MODE = false` toggle with realistic mock fixtures for local testing when backend is offline.
   - Export typed functions matching the exact API contract:
     - `createResearch(topic: string): Promise<{ project_id: string }>`
     - `getResearchStatus(id: string): Promise<{ status: string, current_step: string, papers_found: number, papers_analyzed: number }>`
     - `getResearchPapers(id: string): Promise<Array<PaperWithAnalysis>>`
     - `getResearchComparison(id: string): Promise<Array<{ dimension: string, summary: string }>>`
     - `getResearchGaps(id: string): Promise<Array<ResearchGap>>`
     - `getResearchReport(id: string): Promise<{ content_markdown: string, created_at: string }>`
3. Create `frontend/.env.example` containing `NEXT_PUBLIC_API_URL=http://localhost:8000`.

CONSTRAINTS:
- Strict TypeScript typing throughout. No `any` types for API contract payloads.
```

```
════════════════════════════════════════════════════════════════════════════════
STEP 2: RESEARCH TOPIC INPUT & HERO INTERFACE
════════════════════════════════════════════════════════════════════════════════
You are building Step 2 of the ResearchMate frontend: the landing page (`frontend/app/page.tsx`).

TASKS:
1. Design a clean, academic hero view:
   - Main headline: "Autonomous Literature Gap Synthesis"
   - Subhead explaining the autonomous multi-agent pipeline.
2. Prominent topic search bar:
   - Placeholder example: "AI-based ransomware detection in SCADA systems"
   - Suggested topic chips below the input (e.g., "Transformer model compression", "Zero-day vulnerability prediction", "Quantum key distribution").
   - Clickable chips prefill the search input.
3. Loading and submission handling:
   - On submit, call `createResearch(topic)`.
   - Show spinner/progress button state.
   - On receipt of `project_id`, redirect to `/project/${project_id}`.
4. Error banner handling if backend is unavailable or returns an error.
```

```
════════════════════════════════════════════════════════════════════════════════
STEP 3: LIVE AGENT EXECUTION TRACKER
════════════════════════════════════════════════════════════════════════════════
You are building Step 3 of the ResearchMate frontend: real-time status tracker on `/project/[id]/page.tsx`.

TASKS:
1. Setup polling hook using `setInterval` or React Query:
   - Poll `getResearchStatus(id)` every 2.5 seconds while status is in `pending`, `searching`, `analyzing`, `comparing`, `gap_finding`, or `reporting`.
   - Terminate polling when status is `done` or `error`.
2. Build the visual multi-agent step progress tracker:
   - Steps:
     1. Search Query Generation
     2. Paper Retrieval (OpenAlex & Semantic Scholar)
     3. Deep Content Extraction & Parsing
     4. Cross-Paper Comparative Analysis
     5. Research Gap Synthesis & Evidence Correlation
     6. Executive Report Compilation
   - Visual states for each step: `Pending` (muted), `Active` (animated pulse/spinner), `Completed` (green checkmark).
   - Display dynamic paper counter during extraction: e.g., "Analyzed 6 of 12 candidate papers".
3. Display clear error alert if `status === 'error'` with retry action.
```

```
════════════════════════════════════════════════════════════════════════════════
STEP 4: PAPERS LIST & METHODOLOGY COMPARISON TABS
════════════════════════════════════════════════════════════════════════════════
You are building Step 4 of the ResearchMate frontend: the Papers and Comparison views on `/project/[id]/page.tsx`.

TASKS:
1. Tab navigation container with 4 tabs:
   - `Papers`
   - `Comparative Synthesis`
   - `Identified Gaps` (flagship view)
   - `Full Report`
2. Build `Papers` tab component:
   - Render grid/list of paper cards showing: Title, Authors, Year, Source badge, Open-Access status indicator.
   - Accordion / expandable card drawer displaying structured extraction:
     - Problem Statement
     - Methodology
     - Dataset & Benchmarks
     - Key Results
     - Known Limitations & Future Work
3. Build `Comparative Synthesis` tab component:
   - Displays 3 distinct synthesis sections: Methodology, Datasets, and Results.
   - Present as clean side-by-side comparative cards with high-contrast pull-out points rather than an unstyled table dump.
```

```
════════════════════════════════════════════════════════════════════════════════
STEP 5: EVIDENCE-BACKED GAPS TAB & REPORT VIEWER
════════════════════════════════════════════════════════════════════════════════
You are building Step 5 of the ResearchMate frontend: the flagship Gaps and Report presentation interfaces.

TASKS:
1. Build the `Identified Gaps` tab (Primary faculty evaluation screen):
   - Highlight each gap with:
     - Gap Title & Severity / Novelty badge
     - Problem Description & Context
     - Suggested Future Research Direction (callout card)
     - "Evidence Trail" section: List of tags/cards for supporting papers that substantiate this gap.
     - Clicking a supporting paper badge scrolls to or opens that specific paper in the Papers tab.
2. Build the `Full Report` tab:
   - Render `content_markdown` with styled typography (headings, blockquotes, lists, tables).
   - Top action bar with:
     - "Copy Markdown" button (with copied feedback toast)
     - "Download Report" button (exports markdown file or browser-print formatted PDF)
3. Ensure responsive layout and smooth tab transitions.
4. Output terminal commands to commit and push changes to `feature/frontend-dashboard` targeting `develop`.
```

---

# 7. Integration & Demo Day Checklist

Conduct this end-to-end verification 24 hours prior to presentation:

1. **Local Sync:** Both members checkout `develop` and execute `git pull origin develop`.
2. **Environment Configuration:**
   - Confirm `.env` files contain valid `GOOGLE_API_KEY` and `ANTHROPIC_API_KEY`.
   - Verify local PostgreSQL or Supabase connection string.
3. **End-to-End Validation Run:**
   - Input test topic: `"AI-based ransomware detection in cyber-physical systems"`.
   - Verify step transitions in frontend UI from query generation through final report.
   - Confirm papers extracted reflect real titles and valid DOIs.
   - Inspect the `Identified Gaps` tab: Confirm each gap explicitly references at least one extracted paper.
4. **Fallback Safeguard:**
   - Pre-run one complete project run in advance and note its `project_id`. If live conference Wi-Fi experiences latency or API rate limits, navigate directly to `/project/<cached-id>`.
5. **Release Tagging:**
   ```bash
   git checkout main
   git merge develop
   git tag -a v1.0-demo -m "Faculty presentation demo release"
   git push origin main --tags
   ```