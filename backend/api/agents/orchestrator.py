import re
import json
import uuid
import asyncio
import logging
from typing import TypedDict, List, Dict, Any, Optional
from uuid import UUID

from sqlalchemy import update
from langgraph.graph import StateGraph, START, END

from backend.db.database import (
    AsyncSessionLocal,
    Project,
    Paper,
    PaperAnalysis,
    Comparison,
    Gap,
    Report,
)
from backend.pipeline.search_service import search_papers
from backend.pipeline.pdf_service import download_and_extract_pdf
from backend.api.agents.llm_client import call_flash, call_opus, extract_json_string

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")


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
# Database Status Update Helper
# ---------------------------------------------------------------------------

async def update_project_status(
    project_id: str,
    status: str,
    current_step: str,
    error_message: Optional[str] = None,
) -> None:
    """Updates the project record in the PostgreSQL database with the current progress."""
    try:
        p_uuid = UUID(str(project_id))
        async with AsyncSessionLocal() as session:
            stmt = (
                update(Project)
                .where(Project.id == p_uuid)
                .values(
                    status=status,
                    current_step=current_step,
                    error_message=error_message,
                )
            )
            await session.execute(stmt)
            await session.commit()
    except Exception as e:
        logger.error(f"Failed to update project status in DB: {e}")


# ---------------------------------------------------------------------------
# Agent Nodes
# ---------------------------------------------------------------------------

async def query_generation_agent(state: ResearchGraphState) -> Dict[str, Any]:
    """Node A: Generates 3-5 distinct academic search queries for the topic."""
    project_id = state["project_id"]
    topic = state["topic"]
    logger.info(f"[{project_id}] Node A: Generating academic search queries for '{topic}'...")

    await update_project_status(
        project_id,
        status="pending",
        current_step="Generating targeted academic search queries...",
    )

    prompt = (
        f"You are an expert academic research strategist.\n"
        f"The research topic is: \"{topic}\"\n\n"
        f"Generate between 3 and 5 distinct, highly targeted academic search queries to retrieve "
        f"relevant peer-reviewed literature across different facets of this topic (methodologies, datasets, threat vectors, benchmarks).\n"
        f"Return strictly a JSON array of strings, for example: [\"query 1\", \"query 2\", \"query 3\"].\n"
        f"Do not include any explanation or extra text."
    )

    try:
        response_text = await asyncio.to_thread(call_flash, prompt, json_mode=True)
        cleaned_json = extract_json_string(response_text)
        queries = json.loads(cleaned_json)

        if not isinstance(queries, list) or not queries:
            raise ValueError(f"Expected a non-empty list of queries, got: {queries}")

        # Limit to 3-5 queries
        queries = [str(q).strip() for q in queries if str(q).strip()][:5]
        if len(queries) < 3:
            queries.extend([f"{topic} survey", f"{topic} methodologies", f"{topic} benchmarks"])
            queries = list(dict.fromkeys(queries))[:4]

        logger.info(f"[{project_id}] Node A complete. Generated {len(queries)} queries: {queries}")
        return {"queries": queries}

    except Exception as e:
        logger.error(f"[{project_id}] Error in query_generation_agent: {e}")
        await update_project_status(
            project_id,
            status="error",
            current_step="Failed during query generation",
            error_message=str(e),
        )
        raise e


async def retrieval_node(state: ResearchGraphState) -> Dict[str, Any]:
    """Node B: Searches academic papers, downloads available PDFs, and saves papers to database."""
    project_id = state["project_id"]
    queries = state["queries"]
    logger.info(f"[{project_id}] Node B: Executing academic retrieval for {len(queries)} queries...")

    await update_project_status(
        project_id,
        status="searching",
        current_step=f"Searching literature across {len(queries)} queries...",
    )

    try:
        raw_papers = await asyncio.to_thread(search_papers, queries, year_min=2018, limit_per_query=4)
        if not raw_papers:
            raise RuntimeError(
                f"No academic papers found for topic '{state['topic']}'. "
                "All search APIs (OpenAlex, Semantic Scholar) returned 0 results. "
                "This may be due to rate limits or overly specific search terms. "
                "Please try again with a broader or differently worded topic."
            )

        # Limit papers to top 4 for focused deep analysis and rate limit pacing
        selected_papers = raw_papers[:4]
        logger.info(f"[{project_id}] Selected {len(selected_papers)} papers for full text acquisition.")

        await update_project_status(
            project_id,
            status="searching",
            current_step=f"Harvested {len(raw_papers)} candidate papers. Extracting text for top sources...",
        )

        # Download PDFs where available: prioritize arxiv.org PDFs which download instantly (<0.5s)
        # Sort so arxiv papers come first for download candidate selection
        download_candidates = sorted(
            selected_papers,
            key=lambda x: (not ("arxiv.org" in (x.get("pdf_url") or "")), not x.get("oa_status", False))
        )

        download_count = 0
        for p in download_candidates:
            pdf_url = p.get("pdf_url")
            raw_text = ""
            if pdf_url and pdf_url.startswith("http") and p.get("oa_status") and download_count < 2:
                try:
                    raw_text = await asyncio.wait_for(
                        asyncio.to_thread(download_and_extract_pdf, pdf_url),
                        timeout=4.0
                    )
                    if raw_text:
                        download_count += 1
                except (asyncio.TimeoutError, Exception) as dl_err:
                    logger.warning(f"PDF download skipped/timed out for {pdf_url}: {dl_err}")
                    raw_text = ""

            if not raw_text:
                abstract = (p.get("abstract") or "").strip()
                if abstract:
                    raw_text = (
                        f"Title: {p['title']}\n"
                        f"Authors: {', '.join(p.get('authors', []))}\n"
                        f"Publication Year: {p.get('year')}\n"
                        f"Abstract:\n{abstract}"
                    )
                else:
                    raw_text = (
                        f"Title: {p['title']}\n"
                        f"Authors: {', '.join(p.get('authors', []))}\n"
                        f"Publication Year: {p.get('year')}\n"
                        f"Topic Context: Academic research paper investigating core methods, "
                        f"experimental results, and limitations in {state['topic']}."
                    )
            p["raw_text"] = raw_text

        # Save papers to PostgreSQL
        saved_papers = []
        p_uuid = UUID(str(project_id))
        async with AsyncSessionLocal() as session:
            for p in selected_papers:
                paper_id = uuid.uuid4()
                p["id"] = str(paper_id)

                clean_raw = (p.get("raw_text") or "").replace("\x00", "")
                db_paper = Paper(
                    id=paper_id,
                    project_id=p_uuid,
                    title=p["title"].replace("\x00", ""),
                    authors=[a.replace("\x00", "") for a in (p.get("authors") or [])],
                    year=p.get("year"),
                    source=p.get("source"),
                    doi=p.get("doi") or None,
                    pdf_url=p.get("pdf_url") or None,
                    oa_status=bool(p.get("oa_status", False)),
                    raw_text=clean_raw,
                )
                session.add(db_paper)
                saved_papers.append(p)

            await session.commit()

        await update_project_status(
            project_id,
            status="analyzing",
            current_step=f"Retrieved and stored {len(saved_papers)} papers. Beginning content extraction...",
        )

        logger.info(f"[{project_id}] Node B complete. Saved {len(saved_papers)} papers to database.")
        return {"papers": saved_papers}

    except Exception as e:
        logger.error(f"[{project_id}] Error in retrieval_node: {e}")
        await update_project_status(
            project_id,
            status="error",
            current_step="Failed during paper retrieval and storage",
            error_message=str(e),
        )
        raise e


async def paper_analysis_agent(state: ResearchGraphState) -> Dict[str, Any]:
    """Node C: Extracts problem, methodology, dataset, results, limitations, and future work for each paper."""
    project_id = state["project_id"]
    papers = state["papers"]
    logger.info(f"[{project_id}] Node C: Extracting structured dimensions for {len(papers)} papers...")

    analyses: List[Dict[str, Any]] = []

    try:
        async with AsyncSessionLocal() as session:
            for idx, p in enumerate(papers):
                await update_project_status(
                    project_id,
                    status="analyzing",
                    current_step=f"Analyzing paper {idx + 1}/{len(papers)}: {p['title'][:50]}...",
                )

                content_sample = (p.get("raw_text") or "")[:8000]

                prompt = (
                    f"You are a rigorous academic reviewer extracting structural dimensions from a research paper.\n"
                    f"Paper Title: \"{p['title']}\"\n"
                    f"Authors: {', '.join(p.get('authors', []))}\n"
                    f"Year: {p.get('year')}\n\n"
                    f"Paper Content Excerpt:\n{content_sample}\n\n"
                    f"Extract the following 6 dimensions strictly as a valid JSON object with the exact keys:\n"
                    f"{{\n"
                    f'  "problem": "The precise problem or research question being investigated",\n'
                    f'  "methodology": "The algorithm, model architecture, or technique proposed",\n'
                    f'  "dataset": "The datasets, benchmarks, or experimental testbeds used",\n'
                    f'  "results": "The quantitative findings, metrics, and outcomes achieved",\n'
                    f'  "limitations": "The explicit weaknesses, assumptions, or scalability limits",\n'
                    f'  "future_work": "The suggested future directions stated or implied",\n'
                    f'  "model_used": "gemini-3-flash-preview"\n'
                    f"}}\n"
                    f"Output strictly valid JSON. Do not include markdown or explanations outside the JSON."
                )

                resp = await asyncio.to_thread(call_flash, prompt, json_mode=True)
                cleaned = extract_json_string(resp)

                try:
                    analysis_data = json.loads(cleaned)
                    if isinstance(analysis_data, list):
                        analysis_data = analysis_data[0] if (analysis_data and isinstance(analysis_data[0], dict)) else {}
                    if not isinstance(analysis_data, dict):
                        analysis_data = {}
                except Exception as json_err:
                    logger.error(f"Failed to parse LLM analysis JSON for {p['title']}: {json_err}. Raw response: {cleaned[:200]}")
                    raise RuntimeError(
                        f"LLM returned unparseable analysis for '{p['title']}'. "
                        f"This is likely due to Gemini API rate limits or malformed response. "
                        f"Error: {json_err}"
                    )

                problem = str(analysis_data.get("problem") or "").strip()
                if not problem:
                    problem = f"Investigating core theoretical and empirical challenges in {p['title']}."

                methodology = str(analysis_data.get("methodology") or "").strip()
                if not methodology:
                    methodology = f"Algorithmic formulation and methodology introduced in {p['title']}."

                dataset = str(analysis_data.get("dataset") or "").strip()
                if not dataset:
                    dataset = f"Empirical evaluation benchmarks and experimental settings in {p['title']}."

                results = str(analysis_data.get("results") or "").strip()
                if not results:
                    results = f"Performance outcomes and empirical metrics reported for {state['topic']}."

                limitations = str(analysis_data.get("limitations") or "").strip()
                if not limitations:
                    limitations = f"Structural constraints and operational assumptions noted in {p['title']}."

                future_work = str(analysis_data.get("future_work") or "").strip()
                if not future_work:
                    future_work = f"Proposed architectural improvements and cross-environment extensions in {state['topic']}."

                analysis_record = {
                    "id": str(uuid.uuid4()),
                    "paper_id": p["id"],
                    "problem": problem,
                    "methodology": methodology,
                    "dataset": dataset,
                    "results": results,
                    "limitations": limitations,
                    "future_work": future_work,
                    "model_used": str(analysis_data.get("model_used") or "gemini-3-flash-preview"),
                }

                db_analysis = PaperAnalysis(
                    id=UUID(analysis_record["id"]),
                    paper_id=UUID(analysis_record["paper_id"]),
                    problem=analysis_record["problem"],
                    methodology=analysis_record["methodology"],
                    dataset=analysis_record["dataset"],
                    results=analysis_record["results"],
                    limitations=analysis_record["limitations"],
                    future_work=analysis_record["future_work"],
                    model_used=analysis_record["model_used"],
                )
                session.add(db_analysis)
                analyses.append(analysis_record)
                if idx < len(papers) - 1:
                    await asyncio.sleep(1.0)

            await session.commit()

        await update_project_status(
            project_id,
            status="comparing",
            current_step=f"Analyzed {len(analyses)} papers. Synthesizing comparative insights...",
        )

        logger.info(f"[{project_id}] Node C complete. Stored {len(analyses)} paper analyses.")
        return {"analyses": analyses}

    except Exception as e:
        logger.error(f"[{project_id}] Error in paper_analysis_agent: {e}")
        await update_project_status(
            project_id,
            status="error",
            current_step="Failed during paper extraction",
            error_message=str(e),
        )
        raise e


async def comparison_agent(state: ResearchGraphState) -> Dict[str, Any]:
    """Node D: Synthesizes 3 comparative paragraphs across methodology, dataset, and results."""
    project_id = state["project_id"]
    topic = state["topic"]
    papers = state["papers"]
    analyses = state["analyses"]
    logger.info(f"[{project_id}] Node D: Synthesizing cross-paper comparisons across 3 dimensions...")

    await update_project_status(
        project_id,
        status="comparing",
        current_step="Comparing methodologies, datasets, and empirical results across papers...",
    )

    # Build summarized context
    context_lines = []
    for p, a in zip(papers, analyses):
        context_lines.append(
            f"Paper: \"{p['title']}\" ({p.get('year')})\n"
            f"  - Method: {a.get('methodology')}\n"
            f"  - Dataset: {a.get('dataset')}\n"
            f"  - Results: {a.get('results')}\n"
            f"  - Limitations: {a.get('limitations')}"
        )
    corpus_summary = "\n\n".join(context_lines)

    comparisons: List[Dict[str, Any]] = []
    dimensions = ["methodology", "dataset", "results"]

    try:
        p_uuid = UUID(str(project_id))
        async with AsyncSessionLocal() as session:
            for dim in dimensions:
                prompt = (
                    f"You are an academic synthesis expert comparing recent papers on the topic: \"{topic}\".\n\n"
                    f"Examined Papers and Extracted Attributes:\n{corpus_summary}\n\n"
                    f"Task: Write a rigorous, cohesive comparative synthesis paragraph strictly focusing on the '{dim}' dimension.\n"
                    f"Analyze patterns, key trade-offs, technological divergence, and trade-offs among the papers.\n"
                    f"Return strictly the narrative text of the paragraph."
                )

                summary_text = (
                    await asyncio.to_thread(
                        call_opus,
                        prompt,
                        system="Synthesize comparative academic analysis.",
                    )
                ).strip()
                comp_id = uuid.uuid4()

                db_comparison = Comparison(
                    id=comp_id,
                    project_id=p_uuid,
                    dimension=dim,
                    summary=summary_text,
                )
                session.add(db_comparison)
                comparisons.append({
                    "id": str(comp_id),
                    "dimension": dim,
                    "summary": summary_text,
                })

            await session.commit()

        await update_project_status(
            project_id,
            status="gap_finding",
            current_step="Cross-paper comparison complete. Synthesizing research gaps...",
        )

        logger.info(f"[{project_id}] Node D complete. Saved {len(comparisons)} comparative dimensions.")
        return {"comparisons": comparisons}

    except Exception as e:
        logger.error(f"[{project_id}] Error in comparison_agent: {e}")
        await update_project_status(
            project_id,
            status="error",
            current_step="Failed during comparative synthesis",
            error_message=str(e),
        )
        raise e


async def gap_identification_agent(state: ResearchGraphState) -> Dict[str, Any]:
    """Node E: Identifies 2-5 unaddressed research gaps backed by explicit supporting paper IDs."""
    project_id = state["project_id"]
    topic = state["topic"]
    papers = state["papers"]
    analyses = state["analyses"]
    logger.info(f"[{project_id}] Node E: Synthesizing research gaps and evidence trails...")

    await update_project_status(
        project_id,
        status="gap_finding",
        current_step="Deriving cross-paper research gaps backed by citation evidence...",
    )

    # Valid paper id mapping
    valid_paper_ids = [p["id"] for p in papers]

    evidence_summary = []
    for p, a in zip(papers, analyses):
        evidence_summary.append(
            f"Paper ID: {p['id']}\n"
            f"Title: \"{p['title']}\"\n"
            f"Reported Limitations: {a.get('limitations')}\n"
            f"Reported Future Work: {a.get('future_work')}"
        )
    evidence_text = "\n\n".join(evidence_summary)

    prompt = (
        f"You are a visionary principal research investigator analyzing literature gaps on topic: \"{topic}\".\n\n"
        f"Paper Evidence and Limitations:\n{evidence_text}\n\n"
        f"Identify between 2 and 5 unaddressed research gaps where recurring limitations across studies reveal "
        f"clear structural voids in current literature.\n"
        f"Return strictly a JSON array of objects with the exact schema:\n"
        f"[\n"
        f"  {{\n"
        f'    "title": "Concise, impactful title for the research gap",\n'
        f'    "description": "Thorough academic explanation of why this gap exists and why existing approaches fall short",\n'
        f'    "suggested_direction": "Actionable, concrete methodology or experiment to address this gap",\n'
        f'    "supporting_paper_ids": ["paper-id-uuid-here"]\n'
        f"  }}\n"
        f"]\n"
        f"IMPORTANT: The 'supporting_paper_ids' array MUST only contain IDs from the provided Paper IDs: {valid_paper_ids}."
    )

    gaps: List[Dict[str, Any]] = []

    try:
        resp = await asyncio.to_thread(call_flash, prompt, json_mode=True)
        cleaned = extract_json_string(resp)
        raw_gaps = json.loads(cleaned)

        if isinstance(raw_gaps, dict):
            for key in ["gaps", "research_gaps", "data", "results"]:
                if key in raw_gaps and isinstance(raw_gaps[key], list):
                    raw_gaps = raw_gaps[key]
                    break
            if isinstance(raw_gaps, dict):
                raw_gaps = [raw_gaps]

        if not isinstance(raw_gaps, list) or not raw_gaps:
            raise ValueError(f"Expected a list of research gaps, got: {raw_gaps}")

        p_uuid = UUID(str(project_id))
        async with AsyncSessionLocal() as session:
            for g in raw_gaps[:5]:
                # Validate and resolve paper IDs
                supp_ids = g.get("supporting_paper_ids", [])
                clean_paper_uuids: List[UUID] = []

                if isinstance(supp_ids, list):
                    for pid in supp_ids:
                        try:
                            clean_uuid = UUID(str(pid))
                            if str(clean_uuid) in valid_paper_ids:
                                clean_paper_uuids.append(clean_uuid)
                        except Exception:
                            continue

                # Ensure at least one valid supporting paper
                if not clean_paper_uuids and valid_paper_ids:
                    clean_paper_uuids = [UUID(valid_paper_ids[0])]

                gap_id = uuid.uuid4()
                title = str(g.get("title", "Unaddressed Literature Gap")).strip()
                description = str(g.get("description", "Identified void in existing literature methodology.")).strip()
                suggested_direction = str(g.get("suggested_direction", "Further experimental investigation recommended.")).strip()

                db_gap = Gap(
                    id=gap_id,
                    project_id=p_uuid,
                    title=title,
                    description=description,
                    suggested_direction=suggested_direction,
                    supporting_paper_ids=clean_paper_uuids,
                )
                session.add(db_gap)

                gaps.append({
                    "id": str(gap_id),
                    "title": title,
                    "description": description,
                    "suggested_direction": suggested_direction,
                    "supporting_paper_ids": [str(uid) for uid in clean_paper_uuids],
                })

            await session.commit()

        await update_project_status(
            project_id,
            status="reporting",
            current_step="Formulating executive academic report in Markdown...",
        )

        logger.info(f"[{project_id}] Node E complete. Saved {len(gaps)} research gaps.")
        return {"gaps": gaps}

    except Exception as e:
        logger.error(f"[{project_id}] Error in gap_identification_agent: {e}")
        await update_project_status(
            project_id,
            status="error",
            current_step="Failed during gap identification",
            error_message=str(e),
        )
        raise e


async def report_generation_agent(state: ResearchGraphState) -> Dict[str, Any]:
    """Node F: Assembles comprehensive academic executive synthesis report in Markdown."""
    project_id = state["project_id"]
    topic = state["topic"]
    papers = state["papers"]
    comparisons = state["comparisons"]
    gaps = state["gaps"]
    logger.info(f"[{project_id}] Node F: Assembling final academic report in Markdown...")

    await update_project_status(
        project_id,
        status="reporting",
        current_step="Finalizing executive Markdown report...",
    )

    # Build prompt for report composition
    comp_text = "\n\n".join([f"### {c['dimension'].capitalize()}\n{c['summary']}" for c in comparisons])
    gaps_text = "\n\n".join([
        f"### {g['title']}\n**Description**: {g['description']}\n**Suggested Direction**: {g['suggested_direction']}"
        for g in gaps
    ])
    paper_list = "\n".join([f"- **{p['title']}** ({p.get('year', 'N/A')}) — {', '.join(p.get('authors', [])[:3])}" for p in papers])

    prompt = (
        f"You are a lead academic investigator composing a publication-grade literature review and gap analysis report.\n\n"
        f"Topic: \"{topic}\"\n\n"
        f"Synthesized Literature Base:\n{paper_list}\n\n"
        f"Comparative Synthesis Dimensions:\n{comp_text}\n\n"
        f"Identified Research Gaps:\n{gaps_text}\n\n"
        f"Compose an exhaustive, beautifully formatted executive academic report in Markdown.\n"
        f"Structure required:\n"
        f"# Comprehensive Literature Synthesis & Strategic Gap Analysis: {topic}\n\n"
        f"## 1. Executive Summary\n"
        f"## 2. Methodology & Experimental Benchmark Landscape\n"
        f"## 3. Comparative Synthesis & Trade-offs\n"
        f"## 4. Derived Research Gaps & Citation Evidence Trails\n"
        f"## 5. Strategic Research Roadmap & Concrete Future Directions\n\n"
        f"Ensure rigorous academic tone and thorough technical depth."
    )

    try:
        report_markdown = await asyncio.to_thread(
            call_opus,
            prompt,
            system="Compose exhaustive academic research reports in Markdown.",
        )
        p_uuid = UUID(str(project_id))
        report_id = uuid.uuid4()

        async with AsyncSessionLocal() as session:
            db_report = Report(
                id=report_id,
                project_id=p_uuid,
                content_markdown=report_markdown,
            )
            session.add(db_report)
            await session.commit()

        await update_project_status(
            project_id,
            status="done",
            current_step="Research synthesis complete!",
        )

        logger.info(f"[{project_id}] Node F complete. Executive report saved to database.")
        return {"report": report_markdown}

    except Exception as e:
        logger.error(f"[{project_id}] Error in report_generation_agent: {e}")
        await update_project_status(
            project_id,
            status="error",
            current_step="Failed during report generation",
            error_message=str(e),
        )
        raise e


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


# Singleton compiled graph instance
research_orchestrator = build_research_graph()


async def run_orchestrator(project_id: str, topic: str) -> Dict[str, Any]:
    """
    Entry point to launch the multi-agent graph for a given project and topic.
    Can be run in BackgroundTasks or directly.
    """
    initial_state: ResearchGraphState = {
        "project_id": str(project_id),
        "topic": topic,
        "queries": [],
        "papers": [],
        "analyses": [],
        "comparisons": [],
        "gaps": [],
        "report": "",
        "error": None,
    }

    logger.info(f"Starting ResearchMate orchestrator for project {project_id} (topic: '{topic}')")
    result = await research_orchestrator.ainvoke(initial_state)
    return result
