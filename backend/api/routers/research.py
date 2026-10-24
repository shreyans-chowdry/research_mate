import re
import json
import uuid
import asyncio
import logging
from typing import List, Optional, Tuple
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, status, Response, UploadFile, File, Form
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.db.database import (
    get_db,
    Project,
    Paper,
    PaperAnalysis,
    Comparison,
    Gap,
    Report,
    ProjectEvent,
)
from backend.api.agents.orchestrator import run_orchestrator, reset_project_artifacts, log_event
from backend.api.agents.llm_client import call_llm, extract_json_string

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/research", tags=["Research"])

ACTIVE_STATUSES = {"pending", "searching", "analyzing", "comparing", "gap_finding", "verifying", "reporting"}


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class CreateResearchRequest(BaseModel):
    topic: str = Field(..., min_length=2, max_length=300, description="The research topic to analyze")


class CreateResearchResponse(BaseModel):
    project_id: str


class EventResponse(BaseModel):
    id: int
    agent: str
    level: str
    message: str
    at: Optional[str] = None


class ResearchStatusResponse(BaseModel):
    status: str
    current_step: str
    papers_found: int
    papers_analyzed: int
    topic: Optional[str] = None
    created_at: Optional[str] = None
    completed_at: Optional[str] = None
    error_message: Optional[str] = None
    events: List[EventResponse] = []


class AnalysisResponse(BaseModel):
    id: str
    problem: Optional[str] = None
    methodology: Optional[str] = None
    dataset: Optional[str] = None
    results: Optional[str] = None
    limitations: Optional[str] = None
    future_work: Optional[str] = None
    model_used: Optional[str] = None


class PaperWithAnalysisResponse(BaseModel):
    id: str
    label: str
    title: str
    authors: List[str] = []
    year: Optional[int] = None
    source: Optional[str] = None
    oa_status: bool = False
    pdf_url: Optional[str] = None
    doi: Optional[str] = None
    relevance: Optional[float] = None
    text_source: Optional[str] = None
    analysis: Optional[AnalysisResponse] = None


class ComparisonResponse(BaseModel):
    dimension: str
    summary: str


class SupportingPaperRef(BaseModel):
    id: str
    title: str


class GapResponse(BaseModel):
    id: str
    title: str
    description: str
    suggested_direction: str
    severity: str = "medium"
    supporting_papers: List[SupportingPaperRef] = []


class ReportResponse(BaseModel):
    content_markdown: str
    created_at: str


class ProjectSummaryResponse(BaseModel):
    id: str
    topic: str
    status: str
    current_step: Optional[str] = None
    created_at: Optional[str] = None
    completed_at: Optional[str] = None
    papers_count: int = 0
    gaps_count: int = 0


class PaperCritiqueRequest(BaseModel):
    title: str = Field(..., min_length=2, description="Draft paper title")
    draft_text: str = Field(..., min_length=10, description="Abstract, methodology, or draft content")
    focus_area: Optional[str] = "comprehensive"


class CitationSuggestion(BaseModel):
    paper_id: str
    title: str
    relevance_reason: str


class PaperCritiqueResponse(BaseModel):
    overall_score: int
    readiness_level: str
    executive_summary: str
    gap_alignment: str
    methodology_critique: str
    benchmark_suggestions: List[str]
    missing_citations: List[CitationSuggestion]
    actionable_recommendations: List[str]
    suggested_changes_markdown: str


class AskTurn(BaseModel):
    role: str  # 'user' | 'assistant'
    content: str


class AskRequest(BaseModel):
    question: str = Field(..., min_length=2, max_length=2000)
    history: List[AskTurn] = []


class AskCitation(BaseModel):
    label: str
    paper_id: str
    title: str


class AskResponse(BaseModel):
    answer_markdown: str
    citations: List[AskCitation]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _uuid(value: str) -> UUID:
    try:
        return UUID(value)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project UUID format.")


async def _get_project(db: AsyncSession, project_id: str) -> Project:
    project = await db.get(Project, _uuid(project_id))
    if not project:
        raise HTTPException(status_code=404, detail="Project not found.")
    return project


async def _ordered_papers(db: AsyncSession, p_uuid: UUID) -> List[Paper]:
    """Papers in the same order the agents labelled them (P1, P2, ...)."""
    stmt = (
        select(Paper)
        .where(Paper.project_id == p_uuid)
        .options(selectinload(Paper.analysis))
        .order_by(Paper.relevance_score.desc().nullslast(), Paper.year.desc().nullslast(), Paper.title)
    )
    return list((await db.execute(stmt)).scalars().all())


def _iso(dt) -> Optional[str]:
    return dt.isoformat() if dt else None


async def _run_llm(prompt: str, json_mode: bool) -> str:
    """LLM calls are blocking; run them off the event loop so one request can't freeze the API."""
    try:
        text, _model = await asyncio.to_thread(call_llm, prompt, json_mode)
        return text
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))


# ---------------------------------------------------------------------------
# Projects
# ---------------------------------------------------------------------------

@router.get("", response_model=List[ProjectSummaryResponse])
async def list_recent_projects(db: AsyncSession = Depends(get_db), limit: int = 50):
    """Returns past research projects ordered by creation date."""
    papers_sq = select(Paper.project_id, func.count(Paper.id).label("n")).group_by(Paper.project_id).subquery()
    gaps_sq = select(Gap.project_id, func.count(Gap.id).label("n")).group_by(Gap.project_id).subquery()
    stmt = (
        select(Project, papers_sq.c.n, gaps_sq.c.n)
        .outerjoin(papers_sq, papers_sq.c.project_id == Project.id)
        .outerjoin(gaps_sq, gaps_sq.c.project_id == Project.id)
        .order_by(Project.created_at.desc())
        .limit(min(limit, 200))
    )
    rows = (await db.execute(stmt)).all()
    return [
        ProjectSummaryResponse(
            id=str(p.id), topic=p.topic, status=p.status, current_step=p.current_step,
            created_at=_iso(p.created_at), completed_at=_iso(p.completed_at),
            papers_count=n_papers or 0, gaps_count=n_gaps or 0,
        )
        for p, n_papers, n_gaps in rows
    ]


@router.post("", response_model=CreateResearchResponse, status_code=status.HTTP_201_CREATED)
async def create_research(payload: CreateResearchRequest, background_tasks: BackgroundTasks, db: AsyncSession = Depends(get_db)):
    """Creates a project and starts the multi-agent pipeline in the background."""
    clean_topic = re.sub(r"\s+", " ", payload.topic).strip()
    if len(clean_topic) < 2:
        raise HTTPException(status_code=400, detail="Research topic cannot be empty.")

    project_id = uuid.uuid4()
    db.add(Project(id=project_id, topic=clean_topic, status="pending", current_step="Initializing research pipeline..."))
    await db.commit()

    background_tasks.add_task(run_orchestrator, str(project_id), clean_topic)
    logger.info(f"Created research project {project_id} for topic: '{clean_topic}'")
    return CreateResearchResponse(project_id=str(project_id))


@router.get("/{project_id}/status", response_model=ResearchStatusResponse)
async def get_research_status(project_id: str, since_event: int = 0, db: AsyncSession = Depends(get_db)):
    """Live status, progress counters, and agent activity events newer than `since_event`."""
    project = await _get_project(db, project_id)
    p_uuid = project.id

    papers_count = (await db.execute(select(func.count(Paper.id)).where(Paper.project_id == p_uuid))).scalar() or 0
    analyzed_count = (await db.execute(
        select(func.count(PaperAnalysis.id)).join(Paper, PaperAnalysis.paper_id == Paper.id).where(Paper.project_id == p_uuid)
    )).scalar() or 0
    events = (await db.execute(
        select(ProjectEvent).where(ProjectEvent.project_id == p_uuid, ProjectEvent.id > since_event)
        .order_by(ProjectEvent.id).limit(300)
    )).scalars().all()

    return ResearchStatusResponse(
        status=project.status,
        current_step=project.current_step or "Processing...",
        papers_found=papers_count,
        papers_analyzed=analyzed_count,
        topic=project.topic,
        created_at=_iso(project.created_at),
        completed_at=_iso(project.completed_at),
        error_message=project.error_message,
        events=[EventResponse(id=e.id, agent=e.agent, level=e.level, message=e.message, at=_iso(e.created_at)) for e in events],
    )


@router.post("/{project_id}/retry")
async def retry_research_project(project_id: str, background_tasks: BackgroundTasks, db: AsyncSession = Depends(get_db)):
    """Clears the previous run's artifacts and re-runs the pipeline from the start."""
    project = await _get_project(db, project_id)
    if project.status in ACTIVE_STATUSES and project.current_step and not project.current_step.startswith("Restarting"):
        # Allow restarting a stuck run, but say so in the log.
        logger.info(f"Retry requested while project {project_id} reports '{project.status}'")

    await reset_project_artifacts(str(project.id))
    project.status = "pending"
    project.current_step = "Restarting research pipeline..."
    project.error_message = None
    project.completed_at = None
    await db.commit()

    background_tasks.add_task(run_orchestrator, str(project.id), project.topic)
    return {"status": "restarted", "project_id": str(project.id)}


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_research_project(project_id: str, db: AsyncSession = Depends(get_db)):
    """Deletes a research project and everything attached to it."""
    project = await _get_project(db, project_id)
    await db.delete(project)
    await db.commit()
    return None


# ---------------------------------------------------------------------------
# Artifacts
# ---------------------------------------------------------------------------

@router.get("/{project_id}/papers", response_model=List[PaperWithAnalysisResponse])
async def get_research_papers(project_id: str, db: AsyncSession = Depends(get_db)):
    """Papers (in citation-label order) with their structured analysis."""
    project = await _get_project(db, project_id)
    papers = await _ordered_papers(db, project.id)

    out: List[PaperWithAnalysisResponse] = []
    for i, p in enumerate(papers):
        a = p.analysis
        out.append(PaperWithAnalysisResponse(
            id=str(p.id), label=f"P{i + 1}", title=p.title, authors=p.authors or [], year=p.year,
            source=p.source, oa_status=bool(p.oa_status), pdf_url=p.pdf_url, doi=p.doi,
            relevance=round(p.relevance_score, 3) if p.relevance_score is not None else None,
            text_source=p.text_source,
            analysis=AnalysisResponse(
                id=str(a.id), problem=a.problem, methodology=a.methodology, dataset=a.dataset, results=a.results,
                limitations=a.limitations, future_work=a.future_work, model_used=a.model_used,
            ) if a else None,
        ))
    return out


@router.get("/{project_id}/comparison", response_model=List[ComparisonResponse])
async def get_research_comparison(project_id: str, db: AsyncSession = Depends(get_db)):
    project = await _get_project(db, project_id)
    order = {"methodology": 0, "dataset": 1, "results": 2}
    comparisons = (await db.execute(select(Comparison).where(Comparison.project_id == project.id))).scalars().all()
    comparisons = sorted(comparisons, key=lambda c: order.get(c.dimension or "", 9))
    return [ComparisonResponse(dimension=c.dimension or "", summary=c.summary or "") for c in comparisons]


@router.get("/{project_id}/gaps", response_model=List[GapResponse])
async def get_research_gaps(project_id: str, db: AsyncSession = Depends(get_db)):
    project = await _get_project(db, project_id)
    paper_map = {pid: title for pid, title in (await db.execute(
        select(Paper.id, Paper.title).where(Paper.project_id == project.id)
    )).all()}
    gaps = (await db.execute(select(Gap).where(Gap.project_id == project.id))).scalars().all()
    rank = {"high": 0, "medium": 1, "low": 2}
    gaps = sorted(gaps, key=lambda g: rank.get(g.severity or "medium", 1))

    return [
        GapResponse(
            id=str(g.id), title=g.title, description=g.description, suggested_direction=g.suggested_direction,
            severity=g.severity or "medium",
            supporting_papers=[SupportingPaperRef(id=str(pid), title=paper_map[pid]) for pid in (g.supporting_paper_ids or []) if pid in paper_map],
        )
        for g in gaps
    ]


@router.get("/{project_id}/report", response_model=ReportResponse)
async def get_research_report(project_id: str, db: AsyncSession = Depends(get_db)):
    project = await _get_project(db, project_id)
    report = (await db.execute(
        select(Report).where(Report.project_id == project.id).order_by(Report.created_at.desc())
    )).scalars().first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not generated yet. Please wait for the research pipeline to complete.")
    return ReportResponse(content_markdown=report.content_markdown, created_at=_iso(report.created_at) or "")


@router.get("/{project_id}/papers/{paper_id}/download")
async def download_paper_endpoint(project_id: str, paper_id: str, format: str = "text", db: AsyncSession = Depends(get_db)):
    """Download a paper's extracted text, or redirect to its open-access PDF."""
    p_uuid = _uuid(project_id)
    paper = await db.get(Paper, _uuid(paper_id))
    if not paper or paper.project_id != p_uuid:
        raise HTTPException(status_code=404, detail="Paper not found.")

    if format == "pdf" and paper.pdf_url:
        return RedirectResponse(url=paper.pdf_url)

    content = (
        f"TITLE: {paper.title}\nAUTHORS: {', '.join(paper.authors or [])}\nYEAR: {paper.year or 'N/A'}\n"
        f"SOURCE: {paper.source or 'N/A'}\nDOI: {paper.doi or 'N/A'}\nPDF URL: {paper.pdf_url or 'N/A'}\n"
        f"TEXT EXTRACTED FROM: {paper.text_source or 'N/A'}\n\n{'=' * 60}\n\n{paper.raw_text or 'No text available.'}\n"
    )
    filename = re.sub(r"[^a-zA-Z0-9_\-]", "_", paper.title[:50]) + ".txt"
    return Response(content=content, media_type="text/plain; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="{filename}"'})


# ---------------------------------------------------------------------------
# Ask the corpus (grounded Q&A)
# ---------------------------------------------------------------------------

@router.post("/{project_id}/ask", response_model=AskResponse)
async def ask_corpus(project_id: str, req: AskRequest, db: AsyncSession = Depends(get_db)):
    """Answers a question using only this project's papers, gaps and comparisons, with [P#] citations."""
    project = await _get_project(db, project_id)
    papers = await _ordered_papers(db, project.id)
    if not papers:
        raise HTTPException(status_code=409, detail="This project has no analysed papers yet.")
    gaps = (await db.execute(select(Gap).where(Gap.project_id == project.id))).scalars().all()

    blocks = []
    for i, p in enumerate(papers):
        a = p.analysis
        excerpt = (p.raw_text or "")[:1800]
        analysis = (
            f"Problem: {a.problem}\nMethod: {a.methodology}\nData: {a.dataset}\nResults: {a.results}\n"
            f"Limitations: {a.limitations}\nFuture work: {a.future_work}\n" if a else ""
        )
        blocks.append(f"[P{i + 1}] {p.title} ({p.year or 'n.d.'})\n{analysis}Excerpt: {excerpt}")
    gap_text = "\n".join(f"- {g.title}: {g.description}" for g in gaps)
    history = "\n".join(f"{t.role.upper()}: {t.content[:1500]}" for t in req.history[-6:])

    prompt = (
        f'You are a research assistant answering questions about a literature corpus on "{project.topic}".\n'
        f"Answer ONLY from the sources below. Cite every claim with the paper label in square brackets, e.g. [P2]. "
        f"If the sources do not contain the answer, say so plainly and suggest what to search for instead. "
        f"Use concise Markdown (short paragraphs, bullets or a small table when useful).\n\n"
        f"SOURCES:\n" + "\n\n".join(blocks) +
        (f"\n\nRESEARCH GAPS ALREADY IDENTIFIED:\n{gap_text}" if gap_text else "") +
        (f"\n\nCONVERSATION SO FAR:\n{history}" if history else "") +
        f"\n\nQUESTION: {req.question}"
    )
    answer = await _run_llm(prompt, json_mode=False)

    cited = sorted({int(n) for n in re.findall(r"\bP(\d+)\b", answer) if 1 <= int(n) <= len(papers)})
    return AskResponse(
        answer_markdown=answer.strip(),
        citations=[AskCitation(label=f"P{n}", paper_id=str(papers[n - 1].id), title=papers[n - 1].title) for n in cited],
    )


# ---------------------------------------------------------------------------
# Paper critic
# ---------------------------------------------------------------------------

async def _critique(db: AsyncSession, project: Project, title: str, draft_text: str, focus_area: str, source_kind: str) -> PaperCritiqueResponse:
    papers = await _ordered_papers(db, project.id)
    gaps = (await db.execute(select(Gap).where(Gap.project_id == project.id))).scalars().all()

    papers_context = "\n".join(
        f"[P{i + 1}] \"{p.title}\" ({p.year or 'n.d.'})\n"
        f"  Method: {p.analysis.methodology if p.analysis else 'n/a'}\n"
        f"  Dataset: {p.analysis.dataset if p.analysis else 'n/a'}\n"
        f"  Limitations: {p.analysis.limitations if p.analysis else 'n/a'}"
        for i, p in enumerate(papers[:10])
    )
    gaps_context = "\n".join(f"- {g.title}: {g.description} (Direction: {g.suggested_direction})" for g in gaps)

    prompt = (
        f"You are a demanding but constructive peer reviewer.\n\n"
        f'Research area: "{project.topic}"\n\nOpen research gaps found in the literature:\n{gaps_context or "none recorded"}\n\n'
        f"Related papers (refer to them by label):\n{papers_context or 'none'}\n\n"
        f"Manuscript ({source_kind}):\nTitle: \"{title}\"\n{draft_text}\n\n"
        f"Review focus: {focus_area}.\n"
        f"Evaluate the manuscript against the related work and gaps. Be specific; quote the manuscript where useful.\n"
        f"Return ONLY a JSON object with this schema:\n"
        f'{{"overall_score": <integer 0-100>, "readiness_level": "short verdict", "executive_summary": "...", '
        f'"gap_alignment": "how well it addresses the listed gaps", "methodology_critique": "...", '
        f'"benchmark_suggestions": ["..."], '
        f'"missing_citations": [{{"paper": "P2", "relevance_reason": "why it should be cited"}}], '
        f'"actionable_recommendations": ["..."], "suggested_changes_markdown": "markdown with concrete rewrites"}}'
    )

    raw = await _run_llm(prompt, json_mode=True)
    try:
        data = json.loads(extract_json_string(raw))
        if not isinstance(data, dict):
            raise ValueError("expected a JSON object")
    except Exception as e:
        logger.error(f"Unparseable critique JSON: {e}; raw={raw[:300]}")
        raise HTTPException(status_code=502, detail="The reviewer model returned an unreadable answer. Please try again.")

    cites: List[CitationSuggestion] = []
    for c in data.get("missing_citations") or []:
        if not isinstance(c, dict):
            continue
        ref = str(c.get("paper") or c.get("paper_id") or c.get("title") or "")
        m = re.search(r"P\s*(\d+)", ref, re.IGNORECASE)
        if m and 1 <= int(m.group(1)) <= len(papers):
            p = papers[int(m.group(1)) - 1]
            cites.append(CitationSuggestion(paper_id=str(p.id), title=p.title, relevance_reason=str(c.get("relevance_reason") or "")))

    def as_list(v) -> List[str]:
        return [str(x) for x in v] if isinstance(v, list) else ([str(v)] if v else [])

    try:
        score = max(0, min(100, int(float(data.get("overall_score")))))
    except (TypeError, ValueError):
        raise HTTPException(status_code=502, detail="The reviewer model did not return a score. Please try again.")

    return PaperCritiqueResponse(
        overall_score=score,
        readiness_level=str(data.get("readiness_level") or ""),
        executive_summary=str(data.get("executive_summary") or ""),
        gap_alignment=str(data.get("gap_alignment") or ""),
        methodology_critique=str(data.get("methodology_critique") or ""),
        benchmark_suggestions=as_list(data.get("benchmark_suggestions")),
        missing_citations=cites,
        actionable_recommendations=as_list(data.get("actionable_recommendations")),
        suggested_changes_markdown=str(data.get("suggested_changes_markdown") or ""),
    )


@router.post("/{project_id}/critique-paper", response_model=PaperCritiqueResponse)
async def critique_paper_endpoint(project_id: str, req: PaperCritiqueRequest, db: AsyncSession = Depends(get_db)):
    """Reviews a pasted draft against the project's literature and gaps."""
    project = await _get_project(db, project_id)
    return await _critique(db, project, req.title, req.draft_text[:15000], req.focus_area or "comprehensive", "pasted text")


def _extract_pdf_text(pdf_bytes: bytes) -> str:
    import pymupdf as fitz
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        pages = [doc.load_page(i).get_text("text").strip() for i in range(min(doc.page_count, 60))]
    finally:
        doc.close()
    return "\n\n".join(p for p in pages if p)


@router.post("/{project_id}/critique-paper-upload", response_model=PaperCritiqueResponse)
async def critique_paper_upload(
    project_id: str,
    title: str = Form(...),
    focus_area: str = Form("comprehensive"),
    pdf_file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    """Reviews an uploaded PDF manuscript."""
    project = await _get_project(db, project_id)
    if not pdf_file.filename or not pdf_file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted. Please upload a .pdf file.")

    pdf_bytes = await pdf_file.read()
    if len(pdf_bytes) > 50 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="PDF file is too large. Maximum size is 50MB.")
    try:
        draft_text = await asyncio.to_thread(_extract_pdf_text, pdf_bytes)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read that PDF: {e}")
    if len(draft_text.strip()) < 50:
        raise HTTPException(status_code=400, detail="No selectable text found in the PDF. It may be a scanned image; paste the text instead.")

    return await _critique(db, project, title, draft_text[:15000], focus_area, "extracted from PDF")
