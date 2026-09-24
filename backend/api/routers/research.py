import uuid
import logging
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, status
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
    )


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
