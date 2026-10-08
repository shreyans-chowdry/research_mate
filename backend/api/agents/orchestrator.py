import os
import re
import json
import uuid
import asyncio
import logging
import datetime
from typing import TypedDict, List, Dict, Any, Optional
from uuid import UUID

from sqlalchemy import update, delete
from langgraph.graph import StateGraph, START, END

from backend.db.database import (
    AsyncSessionLocal,
    Project,
    Paper,
    PaperAnalysis,
    Comparison,
    Gap,
    Report,
    ProjectEvent,
)
from backend.pipeline.search_service import search_papers, rank_papers
from backend.pipeline.pdf_service import download_and_extract_pdf
from backend.api.agents.llm_client import call_llm, extract_json_string

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

# ---------------------------------------------------------------------------
# Tunables (env-overridable)
# ---------------------------------------------------------------------------

MAX_PAPERS = int(os.getenv("RESEARCHMATE_MAX_PAPERS", "6"))
MAX_PDF_DOWNLOADS = int(os.getenv("RESEARCHMATE_MAX_PDFS", "4"))
ANALYSIS_CONCURRENCY = int(os.getenv("RESEARCHMATE_LLM_CONCURRENCY", "2"))
PAPER_CONTEXT_CHARS = 12000

NOT_REPORTED = "Not reported in the available text."


# ---------------------------------------------------------------------------
# State Definition
# ---------------------------------------------------------------------------

class ResearchGraphState(TypedDict):
    project_id: str
    topic: str
    queries: List[str]
    papers: List[Dict[str, Any]]
    analyses: List[Dict[str, Any]]
    comparisons: List[Dict[str, Any]]
    gaps: List[Dict[str, Any]]
    report: str
    error: Optional[str]


# ---------------------------------------------------------------------------
# Persistence helpers
# ---------------------------------------------------------------------------

async def update_project_status(
    project_id: str,
    status: str,
    current_step: str,
    error_message: Optional[str] = None,
) -> None:
    """Updates the project record with the current progress."""
    try:
        values: Dict[str, Any] = {
            "status": status,
            "current_step": current_step,
            "error_message": error_message,
        }
        if status == "done":
            values["completed_at"] = datetime.datetime.now(datetime.timezone.utc)
        async with AsyncSessionLocal() as session:
            await session.execute(update(Project).where(Project.id == UUID(str(project_id))).values(**values))
            await session.commit()
    except Exception as e:
        logger.error(f"Failed to update project status in DB: {e}")


async def log_event(project_id: str, agent: str, message: str, level: str = "info") -> None:
    """Appends one line to the project's live activity log (shown in the tracker console)."""
    try:
        async with AsyncSessionLocal() as session:
            session.add(ProjectEvent(project_id=UUID(str(project_id)), agent=agent, level=level, message=message[:2000]))
            await session.commit()
    except Exception as e:
        logger.error(f"Failed to write project event: {e}")


async def fail(project_id: str, agent: str, step: str, err: Exception) -> None:
    await log_event(project_id, agent, f"{step}: {err}", level="error")
    await update_project_status(project_id, status="error", current_step=step, error_message=str(err))


async def reset_project_artifacts(project_id: str) -> None:
    """Removes everything a previous run produced, so a retry starts clean instead of duplicating rows."""
    p_uuid = UUID(str(project_id))
    async with AsyncSessionLocal() as session:
        # paper_analysis rows cascade from papers
        for model in (Paper, Comparison, Gap, Report, ProjectEvent):
            await session.execute(delete(model).where(model.project_id == p_uuid))
        await session.execute(
            update(Project).where(Project.id == p_uuid).values(completed_at=None, error_message=None)
        )
        await session.commit()


def paper_label(idx: int) -> str:
    return f"P{idx + 1}"


def _clean(text: Any) -> str:
    return str(text or "").replace("\x00", "").strip()


def _parse_json(raw: str) -> Any:
    return json.loads(extract_json_string(raw))


# ---------------------------------------------------------------------------
# Agent Nodes
# ---------------------------------------------------------------------------

async def query_generation_agent(state: ResearchGraphState) -> Dict[str, Any]:
    """Node A: Generates 3-5 distinct academic search queries for the topic."""
    project_id, topic = state["project_id"], state["topic"]
    await update_project_status(project_id, "pending", "Generating targeted academic search queries...")
    await log_event(project_id, "Query", f'Breaking "{topic}" into search angles')

    prompt = (
        f"You are an expert academic research strategist.\n"
        f'The research topic is: "{topic}"\n\n'
        f"Generate between 3 and 5 distinct, highly targeted academic search queries that retrieve relevant "
        f"peer-reviewed literature across different facets of this topic (core methods, datasets and benchmarks, "
        f"evaluation, known failure modes, applications). Keep each query short (3-8 words), the way a researcher "
        f"would type it into Google Scholar.\n"
        f'Return strictly a JSON array of strings, for example: ["query 1", "query 2", "query 3"].'
    )

    try:
        raw, model = await asyncio.to_thread(call_llm, prompt, True)
        queries = _parse_json(raw)
        if isinstance(queries, dict):
            queries = next((v for v in queries.values() if isinstance(v, list)), [])
        queries = [str(q).strip() for q in (queries or []) if str(q).strip()][:5]
        # The bare topic is always a useful query, and guarantees at least one.
        if topic.lower() not in [q.lower() for q in queries]:
            queries.insert(0, topic)
        queries = list(dict.fromkeys(queries))[:5]

        for q in queries:
            await log_event(project_id, "Query", f"→ {q}")
        logger.info(f"[{project_id}] Node A complete with {model}: {queries}")
        return {"queries": queries}
    except Exception as e:
        logger.exception(f"[{project_id}] Error in query_generation_agent")
        await fail(project_id, "Query", "Failed during query generation", e)
        raise


async def retrieval_node(state: ResearchGraphState) -> Dict[str, Any]:
    """Node B: Searches four academic indexes, ranks results, fetches open-access full text, stores papers."""
    project_id, topic, queries = state["project_id"], state["topic"], state["queries"]
    await update_project_status(project_id, "searching", f"Searching literature across {len(queries)} queries...")
    await log_event(project_id, "Retrieval", "Querying OpenAlex, Semantic Scholar, Europe PMC and arXiv")

    try:
        raw_papers = await asyncio.to_thread(search_papers, queries, year_min=2018, limit_per_query=6)
        if not raw_papers:
            raise RuntimeError(
                f"No academic papers found for '{topic}'. All search APIs returned 0 results — this is usually a "
                "temporary rate limit or a very narrow topic. Try again in a minute or broaden the wording."
            )
        await log_event(project_id, "Retrieval", f"{len(raw_papers)} unique candidates after de-duplication")

        ranked = rank_papers(raw_papers, topic, queries)
        # Only papers we can actually read: an abstract or an open-access PDF. Never invent content.
        readable = [p for p in ranked if (p.get("abstract") or "").strip() or (p.get("oa_status") and p.get("pdf_url"))]
        selected = readable[:MAX_PAPERS]
        # Strictly decreasing scores give the API a stable order that matches the [P#] labels used by the agents.
        for i, p in enumerate(selected):
            p["relevance"] = float(p.get("relevance") or 0.0) - i * 1e-6
        if not selected:
            raise RuntimeError("Search returned papers, but none had an abstract or open-access PDF to analyze.")

        await log_event(
            project_id,
            "Retrieval",
            f"Ranked by topic relevance; keeping top {len(selected)} "
            f"(best match {selected[0]['relevance']:.0%}: {selected[0]['title'][:80]})",
        )
        await update_project_status(project_id, "searching", f"Fetching full text for the top {len(selected)} papers...")

        # Download PDFs concurrently; arXiv first because it's fast and reliable.
        pdf_candidates = sorted(
            [p for p in selected if p.get("oa_status") and (p.get("pdf_url") or "").startswith("http")],
            key=lambda x: "arxiv.org" not in (x.get("pdf_url") or ""),
        )[:MAX_PDF_DOWNLOADS]

        async def fetch(p: Dict[str, Any]) -> None:
            try:
                text = await asyncio.wait_for(asyncio.to_thread(download_and_extract_pdf, p["pdf_url"]), timeout=25)
            except Exception as dl_err:
                logger.warning(f"PDF download failed for {p.get('pdf_url')}: {dl_err}")
                text = ""
            if text and len(text) > 1500:
                p["raw_text"] = text
                p["text_source"] = "pdf"

        await asyncio.gather(*(fetch(p) for p in pdf_candidates))
        n_pdf = sum(1 for p in selected if p.get("text_source") == "pdf")
        await log_event(project_id, "Retrieval", f"Full text extracted for {n_pdf}/{len(selected)} papers; using abstracts for the rest",
                        level="success" if n_pdf else "info")

        p_uuid = UUID(str(project_id))
        async with AsyncSessionLocal() as session:
            for p in selected:
                if not p.get("raw_text"):
                    p["raw_text"] = (
                        f"Title: {p['title']}\nAuthors: {', '.join(p.get('authors') or [])}\n"
                        f"Publication Year: {p.get('year')}\nAbstract:\n{(p.get('abstract') or '').strip()}"
                    )
                    p["text_source"] = "abstract" if (p.get("abstract") or "").strip() else "metadata"
                p["id"] = str(uuid.uuid4())
                session.add(Paper(
                    id=UUID(p["id"]),
                    project_id=p_uuid,
                    title=_clean(p["title"]),
                    authors=[_clean(a) for a in (p.get("authors") or [])],
                    year=p.get("year"),
                    source=p.get("source"),
                    doi=p.get("doi") or None,
                    pdf_url=p.get("pdf_url") or None,
                    oa_status=bool(p.get("oa_status", False)),
                    raw_text=_clean(p["raw_text"]),
                    relevance_score=p.get("relevance"),
                    text_source=p.get("text_source"),
                ))
            await session.commit()

        await update_project_status(project_id, "analyzing", f"Stored {len(selected)} papers. Beginning structured extraction...")
        return {"papers": selected}

    except Exception as e:
        logger.exception(f"[{project_id}] Error in retrieval_node")
        await fail(project_id, "Retrieval", "Failed during paper retrieval", e)
        raise


ANALYSIS_KEYS = ["problem", "methodology", "dataset", "results", "limitations", "future_work"]


async def paper_analysis_agent(state: ResearchGraphState) -> Dict[str, Any]:
    """Node C: Extracts six dimensions per paper, concurrently, tolerating individual failures."""
    project_id, papers = state["project_id"], state["papers"]
    await update_project_status(project_id, "analyzing", f"Analyzing {len(papers)} papers...")
    await log_event(project_id, "Extraction", f"Reading {len(papers)} papers, {ANALYSIS_CONCURRENCY} at a time")

    sem = asyncio.Semaphore(ANALYSIS_CONCURRENCY)
    done_count = 0

    async def analyze(p: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        nonlocal done_count
        prompt = (
            f"You are a rigorous academic reviewer extracting structured facts from ONE research paper.\n"
            f'Paper title: "{p["title"]}"\nYear: {p.get("year")}\n'
            f"Text available: {'full text' if p.get('text_source') == 'pdf' else 'abstract only'}\n\n"
            f"--- PAPER TEXT ---\n{(p.get('raw_text') or '')[:PAPER_CONTEXT_CHARS]}\n--- END ---\n\n"
            f"Return strictly a JSON object with exactly these keys, each a concise string (1-3 sentences):\n"
            f'{{"problem": "...", "methodology": "...", "dataset": "...", "results": "...", "limitations": "...", "future_work": "..."}}\n'
            f"Rules: only use information present in the text. Include concrete numbers and dataset names when given. "
            f'If something is not stated, write exactly "{NOT_REPORTED}" — never guess.'
        )
        async with sem:
            try:
                raw, model = await asyncio.to_thread(call_llm, prompt, True)
                data = _parse_json(raw)
                if isinstance(data, list):
                    data = data[0] if data and isinstance(data[0], dict) else {}
                if not isinstance(data, dict):
                    raise ValueError("model did not return a JSON object")
            except Exception as err:
                logger.warning(f"[{project_id}] analysis failed for {p['title'][:60]}: {err}")
                await log_event(project_id, "Extraction", f"Skipped “{p['title'][:70]}” — {str(err)[:140]}", level="warn")
                return None

        record = {k: (_clean(data.get(k)) or NOT_REPORTED) for k in ANALYSIS_KEYS}
        record.update({"id": str(uuid.uuid4()), "paper_id": p["id"], "model_used": model})
        # Save each analysis as soon as it exists so the live progress counter is real.
        async with AsyncSessionLocal() as session:
            session.add(PaperAnalysis(
                id=UUID(record["id"]), paper_id=UUID(record["paper_id"]), model_used=model,
                **{k: record[k] for k in ANALYSIS_KEYS},
            ))
            await session.commit()

        done_count += 1
        await update_project_status(project_id, "analyzing", f"Analyzed {done_count}/{len(papers)}: {p['title'][:60]}...")
        await log_event(project_id, "Extraction", f"✓ {p['title'][:90]}", level="success")
        return record

    try:
        results = await asyncio.gather(*(analyze(p) for p in papers))
        pairs = [(p, a) for p, a in zip(papers, results) if a]
        if not pairs:
            raise RuntimeError("Every paper analysis failed. This is almost always a Gemini rate limit — wait a minute and retry.")

        failed_ids = [UUID(p["id"]) for p, a in zip(papers, results) if not a]
        if failed_ids:
            # Drop unreadable papers so citation labels stay aligned with what the dashboard shows.
            async with AsyncSessionLocal() as session:
                await session.execute(delete(Paper).where(Paper.id.in_(failed_ids)))
                await session.commit()

        kept_papers = [p for p, _ in pairs]
        await update_project_status(project_id, "comparing", f"Analyzed {len(pairs)} papers. Comparing them...")
        return {"papers": kept_papers, "analyses": [a for _, a in pairs]}

    except Exception as e:
        logger.exception(f"[{project_id}] Error in paper_analysis_agent")
        await fail(project_id, "Extraction", "Failed during paper extraction", e)
        raise


def _corpus_block(papers: List[Dict[str, Any]], analyses: List[Dict[str, Any]], fields: List[str]) -> str:
    lines = []
    for i, (p, a) in enumerate(zip(papers, analyses)):
        body = "\n".join(f"  - {f.replace('_', ' ').title()}: {a.get(f)}" for f in fields)
        lines.append(f"[{paper_label(i)}] \"{p['title']}\" ({p.get('year')})\n{body}")
    return "\n\n".join(lines)


async def comparison_agent(state: ResearchGraphState) -> Dict[str, Any]:
    """Node D: Writes a comparative synthesis for methodology, dataset and results."""
    project_id, topic = state["project_id"], state["topic"]
    papers, analyses = state["papers"], state["analyses"]
    await update_project_status(project_id, "comparing", "Comparing methodologies, datasets, and results...")

    corpus = _corpus_block(papers, analyses, ["methodology", "dataset", "results", "limitations"])
    dimensions = ["methodology", "dataset", "results"]

    async def compare(dim: str) -> Dict[str, Any]:
        await log_event(project_id, "Comparison", f"Contrasting papers on {dim}")
        prompt = (
            f'You are an academic synthesis expert comparing papers on: "{topic}".\n\n'
            f"Papers (cite them by their bracketed label, e.g. [P2]):\n{corpus}\n\n"
            f"Write 2 short paragraphs comparing the papers strictly on the '{dim}' dimension: where they agree, "
            f"where they diverge, and the trade-offs. Cite labels inline. Plain prose, no headings, no bullet lists."
        )
        text, _ = await asyncio.to_thread(call_llm, prompt, False)
        return {"id": str(uuid.uuid4()), "dimension": dim, "summary": text.strip()}

    try:
        sem = asyncio.Semaphore(ANALYSIS_CONCURRENCY)

        async def guarded(dim: str):
            async with sem:
                return await compare(dim)

        comparisons = await asyncio.gather(*(guarded(d) for d in dimensions))
        async with AsyncSessionLocal() as session:
            for c in comparisons:
                session.add(Comparison(id=UUID(c["id"]), project_id=UUID(str(project_id)), dimension=c["dimension"], summary=c["summary"]))
            await session.commit()

        await log_event(project_id, "Comparison", "Comparative synthesis written for 3 dimensions", level="success")
        await update_project_status(project_id, "gap_finding", "Comparison complete. Looking for research gaps...")
        return {"comparisons": comparisons}
    except Exception as e:
        logger.exception(f"[{project_id}] Error in comparison_agent")
        await fail(project_id, "Comparison", "Failed during comparative synthesis", e)
        raise


async def gap_identification_agent(state: ResearchGraphState) -> Dict[str, Any]:
    """Node E: Identifies 2-5 research gaps, each tied to the papers that evidence it."""
    project_id, topic = state["project_id"], state["topic"]
    papers, analyses = state["papers"], state["analyses"]
    await update_project_status(project_id, "gap_finding", "Deriving research gaps backed by citation evidence...")
    await log_event(project_id, "Gaps", "Clustering recurring limitations and stated future work")

    corpus = _corpus_block(papers, analyses, ["problem", "methodology", "limitations", "future_work"])
    label_to_id = {paper_label(i): p["id"] for i, p in enumerate(papers)}

    prompt = (
        f'You are a principal investigator looking for open research gaps on: "{topic}".\n\n'
        f"Evidence from the analysed papers:\n{corpus}\n\n"
        f"Identify 2 to 5 research gaps — problems that recur across these papers' limitations or that none of them "
        f"address. Each gap must be supported by at least one paper label from the list above.\n"
        f"Return strictly a JSON array of objects with this schema:\n"
        f'[{{"title": "short gap title", "description": "why this gap exists and why current work falls short", '
        f'"suggested_direction": "a concrete study or method that would address it", '
        f'"severity": "high | medium | low (how much it blocks progress in the field)", '
        f'"supporting_papers": ["P1", "P3"]}}]'
    )

    try:
        raw, _ = await asyncio.to_thread(call_llm, prompt, True)
        raw_gaps = _parse_json(raw)
        if isinstance(raw_gaps, dict):
            raw_gaps = next((v for v in raw_gaps.values() if isinstance(v, list)), [raw_gaps])
        if not isinstance(raw_gaps, list) or not raw_gaps:
            raise ValueError(f"Expected a list of research gaps, got: {str(raw_gaps)[:200]}")

        gaps: List[Dict[str, Any]] = []
        async with AsyncSessionLocal() as session:
            for g in raw_gaps[:5]:
                if not isinstance(g, dict) or not _clean(g.get("title")):
                    continue
                refs = g.get("supporting_papers") or g.get("supporting_paper_ids") or []
                ids: List[str] = []
                for r in refs if isinstance(refs, list) else [refs]:
                    m = re.search(r"P\s*(\d+)", str(r), re.IGNORECASE)
                    pid = label_to_id.get(f"P{m.group(1)}") if m else (str(r) if str(r) in label_to_id.values() else None)
                    if pid and pid not in ids:
                        ids.append(pid)
                severity = _clean(g.get("severity")).lower().split()[0] if _clean(g.get("severity")) else "medium"
                if severity not in ("high", "medium", "low"):
                    severity = "medium"
                gap = {
                    "id": str(uuid.uuid4()),
                    "title": _clean(g.get("title")),
                    "description": _clean(g.get("description")),
                    "suggested_direction": _clean(g.get("suggested_direction")),
                    "severity": severity,
                    "supporting_paper_ids": ids,  # may be empty: we never invent evidence
                }
                session.add(Gap(
                    id=UUID(gap["id"]), project_id=UUID(str(project_id)), title=gap["title"],
                    description=gap["description"], suggested_direction=gap["suggested_direction"],
                    severity=severity, supporting_paper_ids=[UUID(i) for i in ids],
                ))
                gaps.append(gap)
                await log_event(project_id, "Gaps", f"{severity.capitalize()}-impact gap: {gap['title']} ({len(ids)} supporting papers)")
            await session.commit()

        if not gaps:
            raise ValueError("The model returned no usable gaps.")
        await update_project_status(project_id, "reporting", "Writing the final report...")
        return {"gaps": gaps}

    except Exception as e:
        logger.exception(f"[{project_id}] Error in gap_identification_agent")
        await fail(project_id, "Gaps", "Failed during gap identification", e)
        raise


async def report_generation_agent(state: ResearchGraphState) -> Dict[str, Any]:
    """Node F: Assembles the literature review report in Markdown."""
    project_id, topic = state["project_id"], state["topic"]
    papers, comparisons, gaps = state["papers"], state["comparisons"], state["gaps"]
    await update_project_status(project_id, "reporting", "Writing the final report...")
    await log_event(project_id, "Report", "Drafting the literature review")

    id_to_label = {p["id"]: paper_label(i) for i, p in enumerate(papers)}
    paper_list = "\n".join(
        f"[{paper_label(i)}] {p['title']} ({p.get('year', 'n.d.')}) — {', '.join((p.get('authors') or [])[:3])}"
        for i, p in enumerate(papers)
    )
    comp_text = "\n\n".join(f"### {c['dimension'].capitalize()}\n{c['summary']}" for c in comparisons)
    gaps_text = "\n\n".join(
        f"### {g['title']} (severity: {g['severity']}; evidence: {', '.join(id_to_label.get(i, '?') for i in g['supporting_paper_ids']) or 'none'})\n"
        f"{g['description']}\nSuggested direction: {g['suggested_direction']}"
        for g in gaps
    )

    prompt = (
        f"You are writing a literature review and gap analysis report.\n\n"
        f'Topic: "{topic}"\n\nPapers (cite as [P1], [P2], ...):\n{paper_list}\n\n'
        f"Comparative synthesis:\n{comp_text}\n\nResearch gaps:\n{gaps_text}\n\n"
        f"Write the report in GitHub-flavoured Markdown with this structure:\n"
        f"# Literature Review: {topic}\n"
        f"## Executive summary\n## Methods and benchmarks in use\n## How the approaches compare\n"
        f"## Open research gaps\n## Suggested research roadmap\n## References\n\n"
        f"Cite papers inline with their labels. Use a table where it genuinely helps comparison. "
        f"The References section lists every paper with its label. Be precise, avoid filler."
    )

    try:
        report_markdown, _ = await asyncio.to_thread(call_llm, prompt, False)
        async with AsyncSessionLocal() as session:
            session.add(Report(id=uuid.uuid4(), project_id=UUID(str(project_id)), content_markdown=report_markdown))
            await session.commit()

        await log_event(project_id, "Report", f"Report ready — {len(report_markdown.split()):,} words", level="success")
        await update_project_status(project_id, "done", "Research synthesis complete!")
        return {"report": report_markdown}
    except Exception as e:
        logger.exception(f"[{project_id}] Error in report_generation_agent")
        await fail(project_id, "Report", "Failed during report generation", e)
        raise


# ---------------------------------------------------------------------------
# LangGraph Workflow Construction
# ---------------------------------------------------------------------------

def build_research_graph():
    """Builds and compiles the LangGraph multi-agent pipeline."""
    workflow = StateGraph(ResearchGraphState)

    workflow.add_node("query_generation", query_generation_agent)
    workflow.add_node("retrieval", retrieval_node)
    workflow.add_node("paper_analysis", paper_analysis_agent)
    workflow.add_node("comparison", comparison_agent)
    workflow.add_node("gap_identification", gap_identification_agent)
    workflow.add_node("report_generation", report_generation_agent)

    workflow.add_edge(START, "query_generation")
    workflow.add_edge("query_generation", "retrieval")
    workflow.add_edge("retrieval", "paper_analysis")
    workflow.add_edge("paper_analysis", "comparison")
    workflow.add_edge("comparison", "gap_identification")
    workflow.add_edge("gap_identification", "report_generation")
    workflow.add_edge("report_generation", END)

    return workflow.compile()


research_orchestrator = build_research_graph()


async def run_orchestrator(project_id: str, topic: str, reset: bool = False) -> Optional[Dict[str, Any]]:
    """
    Entry point to launch the multi-agent graph for a project.
    With reset=True, artifacts from a previous run are removed first (used by /retry).
    Errors are already recorded on the project by the failing node, so they are not re-raised.
    """
    if reset:
        await reset_project_artifacts(project_id)
    initial_state: ResearchGraphState = {
        "project_id": str(project_id), "topic": topic, "queries": [], "papers": [],
        "analyses": [], "comparisons": [], "gaps": [], "report": "", "error": None,
    }
    logger.info(f"Starting ResearchMate orchestrator for project {project_id} (topic: '{topic}')")
    await log_event(project_id, "System", "Pipeline started")
    try:
        return await research_orchestrator.ainvoke(initial_state)
    except Exception as e:
        logger.error(f"Pipeline for {project_id} stopped: {e}")
        return None
