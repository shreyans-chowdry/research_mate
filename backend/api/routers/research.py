import re
import json
import uuid
import logging
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, status, Response, UploadFile, File, Form
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
)
from backend.api.agents.orchestrator import run_orchestrator
from backend.api.agents.llm_client import call_opus, extract_json_string

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/research", tags=["Research"])


# ---------------------------------------------------------------------------
# Request & Response Pydantic Schemas (Exact Contract from Section 2.3)
# ---------------------------------------------------------------------------

class CreateResearchRequest(BaseModel):
    topic: str = Field(..., min_length=2, description="The research topic to analyze")


class CreateResearchResponse(BaseModel):
    project_id: str


class ResearchStatusResponse(BaseModel):
    status: str
    current_step: str
    papers_found: int
    papers_analyzed: int
    topic: Optional[str] = None
    created_at: Optional[str] = None


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
    title: str
    authors: List[str] = []
    year: Optional[int] = None
    oa_status: bool = False
    pdf_url: Optional[str] = None
    doi: Optional[str] = None
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
    papers_count: int = 0


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


# ---------------------------------------------------------------------------
# Endpoint Handlers
# ---------------------------------------------------------------------------

@router.get("", response_model=List[ProjectSummaryResponse])
async def list_recent_projects(
    db: AsyncSession = Depends(get_db),
    limit: int = 20,
):
    """Returns past research projects ordered by creation date."""
    stmt = (
        select(
            Project.id,
            Project.topic,
            Project.status,
            Project.current_step,
            Project.created_at,
            func.count(Paper.id).label("papers_count"),
        )
        .outerjoin(Paper, Paper.project_id == Project.id)
        .group_by(Project.id)
        .order_by(Project.created_at.desc())
        .limit(limit)
    )
    result = await db.execute(stmt)
    rows = result.all()
    return [
        ProjectSummaryResponse(
            id=str(r.id),
            topic=r.topic,
            status=r.status,
            current_step=r.current_step,
            created_at=r.created_at.isoformat() if r.created_at else None,
            papers_count=r.papers_count or 0,
        )
        for r in rows
    ]


@router.post("", response_model=CreateResearchResponse, status_code=status.HTTP_201_CREATED)
async def create_research(
    payload: CreateResearchRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """
    Initiates a new research project, persists initial project row,
    and dispatches the autonomous LangGraph multi-agent pipeline in the background.
    """
    clean_topic = payload.topic.strip()
    if not clean_topic:
        raise HTTPException(status_code=400, detail="Research topic cannot be empty.")

    project_id = uuid.uuid4()
    project = Project(
        id=project_id,
        topic=clean_topic,
        status="pending",
        current_step="Initializing research pipeline...",
    )
    db.add(project)
    await db.commit()

    # Launch multi-agent orchestrator in background task
    background_tasks.add_task(run_orchestrator, str(project_id), clean_topic)

    logger.info(f"Created research project {project_id} for topic: '{clean_topic}'")
    return CreateResearchResponse(project_id=str(project_id))


@router.get("/{project_id}/status", response_model=ResearchStatusResponse)
async def get_research_status(
    project_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Returns the live execution status and pipeline progress counters."""
    try:
        p_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project UUID format.")

    project = await db.get(Project, p_uuid)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found.")

    # Count papers found
    papers_count_stmt = select(func.count(Paper.id)).where(Paper.project_id == p_uuid)
    papers_count = (await db.execute(papers_count_stmt)).scalar() or 0

    # Count papers analyzed
    analyzed_count_stmt = (
        select(func.count(PaperAnalysis.id))
        .join(Paper, PaperAnalysis.paper_id == Paper.id)
        .where(Paper.project_id == p_uuid)
    )
    analyzed_count = (await db.execute(analyzed_count_stmt)).scalar() or 0

    return ResearchStatusResponse(
        status=project.status,
        current_step=project.current_step or "Processing...",
        papers_found=papers_count,
        papers_analyzed=analyzed_count,
        topic=project.topic,
        created_at=project.created_at.isoformat() if project.created_at else None,
    )


@router.post("/{project_id}/retry")
async def retry_research_project(
    project_id: str,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """Re-dispatches the multi-agent research pipeline for a stuck, interrupted, or failed project."""
    try:
        p_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project UUID format.")

    project = await db.get(Project, p_uuid)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found.")

    # Reset project status
    project.status = "pending"
    project.current_step = "Restarting research pipeline..."
    project.error_message = None
    await db.commit()

    background_tasks.add_task(run_orchestrator, str(p_uuid), project.topic)
    logger.info(f"Re-dispatched multi-agent research pipeline for project {project_id}")
    return {"status": "restarted", "project_id": str(project_id)}


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_research_project(
    project_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Deletes a research project and all associated cascade artifacts."""
    try:
        p_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project UUID format.")

    project = await db.get(Project, p_uuid)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found.")

    await db.delete(project)
    await db.commit()
    logger.info(f"Deleted research project {project_id}")
    return None


@router.get("/{project_id}/papers", response_model=List[PaperWithAnalysisResponse])
async def get_research_papers(
    project_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Returns retrieved papers joined with their structured analysis dimensions."""
    try:
        p_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project UUID format.")

    project = await db.get(Project, p_uuid)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found.")

    stmt = (
        select(Paper)
        .where(Paper.project_id == p_uuid)
        .options(selectinload(Paper.analysis))
        .order_by(Paper.year.desc().nullslast())
    )
    result = await db.execute(stmt)
    papers = result.scalars().all()

    response: List[PaperWithAnalysisResponse] = []
    for p in papers:
        analysis_dto = None
        if p.analysis:
            analysis_dto = AnalysisResponse(
                id=str(p.analysis.id),
                problem=p.analysis.problem,
                methodology=p.analysis.methodology,
                dataset=p.analysis.dataset,
                results=p.analysis.results,
                limitations=p.analysis.limitations,
                future_work=p.analysis.future_work,
                model_used=p.analysis.model_used,
            )

        response.append(
            PaperWithAnalysisResponse(
                id=str(p.id),
                title=p.title,
                authors=p.authors or [],
                year=p.year,
                oa_status=bool(p.oa_status),
                pdf_url=p.pdf_url,
                doi=p.doi,
                analysis=analysis_dto,
            )
        )

    return response


@router.get("/{project_id}/comparison", response_model=List[ComparisonResponse])
async def get_research_comparison(
    project_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Returns synthesized comparative summaries across methodology, dataset, and results."""
    try:
        p_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project UUID format.")

    project = await db.get(Project, p_uuid)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found.")

    stmt = select(Comparison).where(Comparison.project_id == p_uuid)
    result = await db.execute(stmt)
    comparisons = result.scalars().all()

    return [
        ComparisonResponse(
            dimension=c.dimension or "",
            summary=c.summary or "",
        )
        for c in comparisons
    ]


@router.get("/{project_id}/gaps", response_model=List[GapResponse])
async def get_research_gaps(
    project_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Returns derived research gaps with resolved supporting paper references."""
    try:
        p_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project UUID format.")

    project = await db.get(Project, p_uuid)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found.")

    # Retrieve all papers for project for quick title lookup
    papers_stmt = select(Paper.id, Paper.title).where(Paper.project_id == p_uuid)
    papers_res = await db.execute(papers_stmt)
    paper_map = {p_id: title for p_id, title in papers_res.all()}

    gaps_stmt = select(Gap).where(Gap.project_id == p_uuid)
    gaps_res = await db.execute(gaps_stmt)
    gaps = gaps_res.scalars().all()

    response: List[GapResponse] = []
    for g in gaps:
        supporting_refs: List[SupportingPaperRef] = []
        if g.supporting_paper_ids:
            for pid in g.supporting_paper_ids:
                if pid in paper_map:
                    supporting_refs.append(
                        SupportingPaperRef(id=str(pid), title=paper_map[pid])
                    )

        response.append(
            GapResponse(
                id=str(g.id),
                title=g.title,
                description=g.description,
                suggested_direction=g.suggested_direction,
                supporting_papers=supporting_refs,
            )
        )

    return response


@router.get("/{project_id}/report", response_model=ReportResponse)
async def get_research_report(
    project_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Returns the final executive academic synthesis report in Markdown."""
    try:
        p_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project UUID format.")

    project = await db.get(Project, p_uuid)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found.")

    stmt = select(Report).where(Report.project_id == p_uuid).order_by(Report.created_at.desc())
    result = await db.execute(stmt)
    report = result.scalars().first()

    if not report:
        raise HTTPException(
            status_code=404,
            detail="Report not generated yet. Please wait for the research pipeline to complete.",
        )

    return ReportResponse(
        content_markdown=report.content_markdown,
        created_at=report.created_at.isoformat() if report.created_at else "",
    )


@router.get("/{project_id}/papers/{paper_id}/download")
async def download_paper_endpoint(
    project_id: str,
    paper_id: str,
    format: str = "text",
    db: AsyncSession = Depends(get_db),
):
    """Allows downloading the paper's full text, metadata, or redirecting to the PDF."""
    try:
        p_uuid = UUID(project_id)
        paper_uuid = UUID(paper_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid UUID format.")

    paper = await db.get(Paper, paper_uuid)
    if not paper or paper.project_id != p_uuid:
        raise HTTPException(status_code=404, detail="Paper not found.")

    if format == "pdf" and paper.pdf_url:
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url=paper.pdf_url)

    # Provide structured text download
    content = (
        f"TITLE: {paper.title}\n"
        f"AUTHORS: {', '.join(paper.authors or [])}\n"
        f"YEAR: {paper.year or 'N/A'}\n"
        f"SOURCE: {paper.source or 'Academic Literature Repository'}\n"
        f"DOI: {paper.doi or 'N/A'}\n"
        f"PDF URL: {paper.pdf_url or 'N/A'}\n"
        f"OPEN ACCESS: {paper.oa_status}\n\n"
        f"{'='*60}\n"
        f"EXTRACTED CONTENT & LITERATURE ANALYSIS\n"
        f"{'='*60}\n\n"
        f"{paper.raw_text or 'No raw text available.'}\n"
    )

    clean_filename = re.sub(r'[^a-zA-Z0-9_\-]', '_', paper.title[:50]) + ".txt"
    return Response(
        content=content,
        media_type="text/plain; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{clean_filename}"'
        }
    )


@router.post("/{project_id}/critique-paper", response_model=PaperCritiqueResponse)
async def critique_paper_endpoint(
    project_id: str,
    req: PaperCritiqueRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Evaluates a researcher's draft paper against the synthesized research gaps,
    comparative insights, and harvested literature for this project.
    Suggests concrete improvements, missing citations, benchmark datasets, and actionable revisions.
    """
    try:
        p_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project UUID format.")

    project = await db.get(Project, p_uuid)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found.")

    # Retrieve all papers and gaps for this project
    papers_stmt = select(Paper).options(selectinload(Paper.analysis)).where(Paper.project_id == p_uuid)
    papers_res = await db.execute(papers_stmt)
    papers = papers_res.scalars().all()

    gaps_stmt = select(Gap).where(Gap.project_id == p_uuid)
    gaps_res = await db.execute(gaps_stmt)
    gaps = gaps_res.scalars().all()

    papers_context = "\n".join([
        f"- Paper ID: {p.id} | \"{p.title}\" ({p.year or 'N/A'})\n"
        f"  Method: {p.analysis.methodology if p.analysis else 'N/A'}\n"
        f"  Dataset: {p.analysis.dataset if p.analysis else 'N/A'}\n"
        f"  Limitations: {p.analysis.limitations if p.analysis else 'N/A'}"
        for p in papers[:8]
    ])

    gaps_context = "\n".join([
        f"- Gap: {g.title}: {g.description} (Direction: {g.suggested_direction})"
        for g in gaps
    ])

    prompt = (
        f"You are a top-tier peer reviewer and academic editor reviewing a paper draft submitted by a researcher.\n\n"
        f"Project Research Topic: \"{project.topic}\"\n\n"
        f"Synthesized Research Gaps from State-of-the-Art Literature:\n{gaps_context}\n\n"
        f"Related Peer-Reviewed Papers in Corpus:\n{papers_context}\n\n"
        f"Researcher's Submitted Manuscript Details:\n"
        f"Paper Title: \"{req.title}\"\n"
        f"Draft Text / Abstract / Methodology:\n{req.draft_text}\n\n"
        f"Task: Evaluate this manuscript critically against the related literature and gaps. Suggest concrete changes.\n"
        f"Return ONLY valid JSON matching this schema:\n"
        f"{{\n"
        f'  "overall_score": 78,\n'
        f'  "readiness_level": "Solid Draft with Key Revisions Needed",\n'
        f'  "executive_summary": "string summary evaluating manuscript viability",\n'
        f'  "gap_alignment": "string describing how well paper addresses known gaps",\n'
        f'  "methodology_critique": "string critiquing methodology and baselines",\n'
        f'  "benchmark_suggestions": ["string suggestion 1", "string suggestion 2"],\n'
        f'  "missing_citations": [\n'
        f'     {{"paper_id": "{str(papers[0].id) if papers else ""}", "title": "{papers[0].title if papers else "Related Paper"}", "relevance_reason": "why to cite"}}\n'
        f'  ],\n'
        f'  "actionable_recommendations": ["recommendation 1", "recommendation 2"],\n'
        f'  "suggested_changes_markdown": "formatted markdown section with concrete advice"\n'
        f"}}"
    )

    llm_resp = call_opus(prompt, json_mode=True)
    cleaned = extract_json_string(llm_resp)

    try:
        data = json.loads(cleaned)
        missing_cites = []
        for c in data.get("missing_citations", []):
            if isinstance(c, dict) and "title" in c:
                missing_cites.append(CitationSuggestion(
                    paper_id=str(c.get("paper_id", "")),
                    title=str(c.get("title", "")),
                    relevance_reason=str(c.get("relevance_reason", "Foundational baseline in related literature."))
                ))
        if not missing_cites and papers:
            missing_cites.append(CitationSuggestion(
                paper_id=str(papers[0].id),
                title=papers[0].title,
                relevance_reason=f"Foundational literature in {project.topic} that should be contrasted in Related Work."
            ))

        return PaperCritiqueResponse(
            overall_score=int(data.get("overall_score", 76)),
            readiness_level=str(data.get("readiness_level", "Solid Draft with Revisions Needed")),
            executive_summary=str(data.get("executive_summary", "")),
            gap_alignment=str(data.get("gap_alignment", "")),
            methodology_critique=str(data.get("methodology_critique", "")),
            benchmark_suggestions=list(data.get("benchmark_suggestions", [])),
            missing_citations=missing_cites,
            actionable_recommendations=list(data.get("actionable_recommendations", [])),
            suggested_changes_markdown=str(data.get("suggested_changes_markdown", "")),
        )
    except Exception as e:
        logger.error(f"Error parsing critique JSON: {e}, raw text: {cleaned}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate critique analysis. The Gemini API may be unavailable or returned an invalid format: {e}"
        )


@router.post("/{project_id}/critique-paper-upload", response_model=PaperCritiqueResponse)
async def critique_paper_upload(
    project_id: str,
    title: str = Form(...),
    focus_area: str = Form("comprehensive"),
    pdf_file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    """
    Accepts a PDF file upload, extracts its text content using PyMuPDF,
    and runs the same critique pipeline as the text-based endpoint.
    """
    try:
        p_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project UUID format.")

    project = await db.get(Project, p_uuid)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found.")

    # Validate file type
    if not pdf_file.filename or not pdf_file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted. Please upload a .pdf file.")

    # Read and extract text from PDF using PyMuPDF
    try:
        import fitz  # PyMuPDF

        pdf_bytes = await pdf_file.read()
        if len(pdf_bytes) > 50 * 1024 * 1024:  # 50MB limit
            raise HTTPException(status_code=400, detail="PDF file is too large. Maximum size is 50MB.")

        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        extracted_pages = []
        for page_num in range(min(doc.page_count, 60)):  # Cap at 60 pages
            page = doc.load_page(page_num)
            text = page.get_text("text")
            if text and text.strip():
                extracted_pages.append(text.strip())
        doc.close()

        draft_text = "\n\n".join(extracted_pages)
        if not draft_text or len(draft_text.strip()) < 50:
            raise HTTPException(
                status_code=400,
                detail="Could not extract meaningful text from the PDF. The file may be scanned/image-based."
            )

        # Truncate to ~15000 chars for LLM context
        draft_text = draft_text[:15000]

    except ImportError:
        raise HTTPException(
            status_code=500,
            detail="PyMuPDF (fitz) is not installed. Run: pip install PyMuPDF"
        )
    except HTTPException:
        raise
    except Exception as pdf_err:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to read PDF file: {pdf_err}"
        )

    # Now run the same critique logic as the text-based endpoint
    # Retrieve all papers and gaps for this project
    papers_stmt = select(Paper).options(selectinload(Paper.analysis)).where(Paper.project_id == p_uuid)
    papers_res = await db.execute(papers_stmt)
    papers = papers_res.scalars().all()

    gaps_stmt = select(Gap).where(Gap.project_id == p_uuid)
    gaps_res = await db.execute(gaps_stmt)
    gaps = gaps_res.scalars().all()

    papers_context = "\n".join([
        f"- Paper ID: {p.id} | \"{p.title}\" ({p.year or 'N/A'})\n"
        f"  Method: {p.analysis.methodology if p.analysis else 'N/A'}\n"
        f"  Dataset: {p.analysis.dataset if p.analysis else 'N/A'}\n"
        f"  Limitations: {p.analysis.limitations if p.analysis else 'N/A'}"
        for p in papers[:8]
    ])

    gaps_context = "\n".join([
        f"- Gap: {g.title}: {g.description} (Direction: {g.suggested_direction})"
        for g in gaps
    ])

    prompt = (
        f"You are a top-tier peer reviewer and academic editor reviewing a paper submitted as a PDF.\n\n"
        f"Project Research Topic: \"{project.topic}\"\n\n"
        f"Synthesized Research Gaps from State-of-the-Art Literature:\n{gaps_context}\n\n"
        f"Related Peer-Reviewed Papers in Corpus:\n{papers_context}\n\n"
        f"Researcher's Submitted Manuscript Details:\n"
        f"Paper Title: \"{title}\"\n"
        f"Full Paper Text (extracted from PDF):\n{draft_text}\n\n"
        f"Task: Evaluate this manuscript critically against the related literature and gaps. Suggest concrete changes.\n"
        f"Return ONLY valid JSON matching this schema:\n"
        f"{{\n"
        f'  "overall_score": 78,\n'
        f'  "readiness_level": "Solid Draft with Key Revisions Needed",\n'
        f'  "executive_summary": "string summary evaluating manuscript viability",\n'
        f'  "gap_alignment": "string describing how well paper addresses known gaps",\n'
        f'  "methodology_critique": "string critiquing methodology and baselines",\n'
        f'  "benchmark_suggestions": ["string suggestion 1", "string suggestion 2"],\n'
        f'  "missing_citations": [\n'
        f'     {{"paper_id": "{str(papers[0].id) if papers else ""}", "title": "{papers[0].title if papers else "Related Paper"}", "relevance_reason": "why to cite"}}\n'
        f'  ],\n'
        f'  "actionable_recommendations": ["recommendation 1", "recommendation 2"],\n'
        f'  "suggested_changes_markdown": "formatted markdown section with concrete advice"\n'
        f"}}"
    )

    llm_resp = call_opus(prompt, json_mode=True)
    cleaned = extract_json_string(llm_resp)

    try:
        data = json.loads(cleaned)
        missing_cites = []
        for c in data.get("missing_citations", []):
            if isinstance(c, dict) and "title" in c:
                missing_cites.append(CitationSuggestion(
                    paper_id=str(c.get("paper_id", "")),
                    title=str(c.get("title", "")),
                    relevance_reason=str(c.get("relevance_reason", "Foundational baseline in related literature."))
                ))
        if not missing_cites and papers:
            missing_cites.append(CitationSuggestion(
                paper_id=str(papers[0].id),
                title=papers[0].title,
                relevance_reason=f"Foundational literature in {project.topic}."
            ))

        return PaperCritiqueResponse(
            overall_score=int(data.get("overall_score", 76)),
            readiness_level=str(data.get("readiness_level", "Solid Draft with Revisions Needed")),
            executive_summary=str(data.get("executive_summary", "")),
            gap_alignment=str(data.get("gap_alignment", "")),
            methodology_critique=str(data.get("methodology_critique", "")),
            benchmark_suggestions=list(data.get("benchmark_suggestions", [])),
            missing_citations=missing_cites,
            actionable_recommendations=list(data.get("actionable_recommendations", [])),
            suggested_changes_markdown=str(data.get("suggested_changes_markdown", "")),
        )
    except Exception as e:
        logger.error(f"Error parsing PDF critique JSON: {e}, raw text: {cleaned[:300]}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to parse AI critique response. The Gemini API may be rate-limited. Error: {e}"
        )
