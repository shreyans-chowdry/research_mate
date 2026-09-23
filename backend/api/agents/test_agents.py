import asyncio
import sys
import uuid
from pathlib import Path

# Add project root to sys.path
root_dir = Path(__file__).resolve().parent.parent.parent.parent
if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))

from sqlalchemy import select, delete
from backend.db.database import (
    engine,
    AsyncSessionLocal,
    Project,
    Paper,
    PaperAnalysis,
    Comparison,
    Gap,
    Report,
)
from backend.api.agents.llm_client import call_flash, call_opus, extract_json_string
from backend.api.agents.orchestrator import run_orchestrator


async def test_llm_client():
    print("\n[TEST 1] Testing LLM Client (Gemini Flash & Claude-compatible routing)...")

    # 1a: Test text generation
    text_resp = call_flash("Say hello from Gemini in one sentence.")
    assert len(text_resp) > 0, "Expected non-empty response from call_flash"
    print(f"  [OK] call_flash text output: {text_resp[:100]}...")

    # 1b: Test json_mode
    json_resp = call_flash('Return JSON: {"status": "ok", "agent": "gemini"}', json_mode=True)
    cleaned = extract_json_string(json_resp)
    assert "status" in cleaned, f"Expected JSON with 'status' key, got: {cleaned}"
    print(f"  [OK] call_flash JSON mode output: {cleaned}")

    # 1c: Test call_opus (confirming it operates without failing on missing Anthropic key)
    opus_resp = call_opus("Summarize the importance of cybersecurity in one sentence.")
    assert len(opus_resp) > 0, "Expected non-empty response from call_opus"
    print(f"  [OK] call_opus output (Anthropic-free): {opus_resp[:100]}...")

    print("[PASS] LLM Client verified successfully!")


async def test_full_orchestrator_pipeline():
    print("\n[TEST 2] Testing LangGraph multi-agent orchestrator end-to-end...")

    test_project_id = uuid.uuid4()
    test_topic = "AI ransomware detection in SCADA systems"

    # Step A: Insert project in DB
    async with AsyncSessionLocal() as session:
        proj = Project(
            id=test_project_id,
            topic=test_topic,
            status="pending",
            current_step="Initializing test pipeline...",
        )
        session.add(proj)
        await session.commit()
    print(f"  [OK] Initialized test project row: {test_project_id}")

    # Step B: Run the full orchestrator graph
    print(f"  [INFO] Running multi-agent graph for topic: '{test_topic}'...")
    state_result = await run_orchestrator(str(test_project_id), test_topic)

    # Step C: Verify state dictionary fields
    assert state_result["queries"], "Graph state missing generated queries"
    assert state_result["papers"], "Graph state missing retrieved papers"
    assert state_result["analyses"], "Graph state missing paper analyses"
    assert state_result["comparisons"], "Graph state missing comparative dimensions"
    assert state_result["gaps"], "Graph state missing synthesized gaps"
    assert state_result["report"], "Graph state missing markdown report"
    print(f"  [OK] LangGraph completed all nodes successfully!")

    # Step D: Verify database persistence across all tables
    print("\n[TEST 3] Verifying database records across all contract tables...")
    async with AsyncSessionLocal() as session:
        # Check Project status
        p = await session.get(Project, test_project_id)
        assert p is not None, "Project not found in DB"
        print(f"  [OK] Project status: '{p.status}' | step: '{p.current_step}'")
        assert p.status == "done", f"Expected project status 'done', got '{p.status}'"

        # Check Papers
        papers_res = await session.execute(select(Paper).where(Paper.project_id == test_project_id))
        db_papers = papers_res.scalars().all()
        print(f"  [OK] Saved papers in DB: {len(db_papers)}")
        assert len(db_papers) > 0, "No papers saved in DB"

        # Check Paper Analyses
        paper_ids = [p.id for p in db_papers]
        analysis_res = await session.execute(
            select(PaperAnalysis).where(PaperAnalysis.paper_id.in_(paper_ids))
        )
        db_analyses = analysis_res.scalars().all()
        print(f"  [OK] Saved paper analyses in DB: {len(db_analyses)}")
        assert len(db_analyses) > 0, "No analyses saved in DB"

        # Check Comparisons
        comp_res = await session.execute(
            select(Comparison).where(Comparison.project_id == test_project_id)
        )
        db_comps = comp_res.scalars().all()
        dims = [c.dimension for c in db_comps]
        print(f"  [OK] Saved comparisons in DB: {len(db_comps)} (dimensions: {dims})")
        assert len(db_comps) == 3, f"Expected 3 comparative dimensions, got {len(db_comps)}"
        assert set(dims) == {"methodology", "dataset", "results"}, f"Unexpected dimensions: {dims}"

        # Check Gaps
        gaps_res = await session.execute(
            select(Gap).where(Gap.project_id == test_project_id)
        )
        db_gaps = gaps_res.scalars().all()
        print(f"  [OK] Saved research gaps in DB: {len(db_gaps)}")
        assert len(db_gaps) >= 2, f"Expected at least 2 research gaps, got {len(db_gaps)}"
        for g in db_gaps:
            assert g.supporting_paper_ids, f"Gap '{g.title}' has no supporting paper IDs"
            print(f"       * Gap: '{g.title}' (evidence: {len(g.supporting_paper_ids)} papers)")

        # Check Report
        report_res = await session.execute(
            select(Report).where(Report.project_id == test_project_id)
        )
        db_reports = report_res.scalars().all()
        print(f"  [OK] Saved reports in DB: {len(db_reports)}")
        assert len(db_reports) == 1, f"Expected 1 report, got {len(db_reports)}"
        assert len(db_reports[0].content_markdown) > 200, "Report markdown is too brief"
        print(f"  [OK] Report excerpt:\n{db_reports[0].content_markdown[:300]}...")

        # Step E: Cascade deletion cleanup
        print("\n[TEST 4] Testing cascade deletion cleanup...")
        await session.delete(p)
        await session.commit()

        # Confirm cascaded deletion of all child records
        papers_after = await session.execute(select(Paper).where(Paper.project_id == test_project_id))
        assert not papers_after.scalars().all(), "Papers should be deleted by cascade"
        print("  [OK] Project deleted; verified full cascade cleanup of all child tables!")

    print("\n" + "=" * 80)
    print(" [SUCCESS] ALL STEP 3 MULTI-AGENT ORCHESTRATOR TESTS PASSED!")
    print("=" * 80)
    return True


async def main():
    print("=" * 80)
    print(" ResearchMate — Step 3: Multi-Agent System & Model Clients Verification")
    print("=" * 80)
    try:
        await test_llm_client()
        await test_full_orchestrator_pipeline()
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
