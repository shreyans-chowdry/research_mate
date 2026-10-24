"""
Offline end-to-end tests for the ResearchMate agent pipeline.

The academic search APIs and the Gemini client are replaced with deterministic fakes, while the
real LangGraph graph, FastAPI routes and PostgreSQL database are exercised. No API keys or
network access are needed:

    DATABASE_URL=postgresql://postgres:password@localhost:5432/researchmate \
        python -m pytest backend/tests -q
"""
import asyncio
import json
import re
import sys
import threading
import time
from pathlib import Path

import httpx
import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from backend.db.database import init_db, engine  # noqa: E402
from backend.pipeline.search_service import rank_papers  # noqa: E402
import backend.api.agents.orchestrator as orch  # noqa: E402
import backend.api.routers.research as research  # noqa: E402
from backend.api.main import app  # noqa: E402


TOPIC = "LLM hallucination mitigation"

FAKE_PAPERS = [
    {"title": "Retrieval augmentation reduces hallucination in large language models", "abstract": "We study hallucination mitigation in LLM question answering with retrieval augmentation on TruthfulQA. " * 4, "year": 2024},
    {"title": "A survey of crop yield prediction", "abstract": "Agricultural forecasting with satellites.", "year": 2021},
    {"title": "Self-consistency decoding for factual LLM outputs", "abstract": "Sampling multiple reasoning paths lowers hallucination rates in LLM outputs by 12% on FEVER. " * 3, "year": 2023},
    {"title": "Untitled preprint with no abstract", "abstract": "", "year": 2022},
    {"title": "Chain-of-verification for LLM hallucination", "abstract": "LLM drafts are verified with planned questions to mitigate hallucination. " * 3, "year": 2023},
    {"title": "Calibrated uncertainty for hallucination detection in LLMs", "abstract": "Token-level entropy detects hallucination in LLM generations. " * 3, "year": 2025},
]


def fake_search(queries, **kw):
    return [
        {"authors": ["A. Author", "B. Author"], "source": "openalex", "doi": "", "pdf_url": "", "oa_status": False, **p}
        for p in FAKE_PAPERS
    ]


class FakeLLM:
    """Routes prompts to canned answers and records the calls it received."""

    def __init__(self, fail_titles=()):
        self.fail_titles = set(fail_titles)
        self.calls = []
        self.lock = threading.Lock()

    def __call__(self, prompt, json_mode=False):
        with self.lock:
            self.calls.append(prompt)
        if "search queries" in prompt:
            return json.dumps(["retrieval augmented generation hallucination", "LLM factuality benchmarks", "self-verification decoding"]), "fake-model"
        if "extracting structured facts" in prompt:
            title = re.search(r'Paper title: "(.+?)"', prompt).group(1)
            if title in self.fail_titles:
                raise RuntimeError("429 RESOURCE_EXHAUSTED (simulated)")
            return json.dumps({"problem": f"Problem of {title}", "methodology": "method", "dataset": "TruthfulQA",
                               "results": "+12%", "limitations": "English only", "future_work": ""}), "fake-model"
        if "comparing papers" in prompt:
            return "Paper [P1] retrieves while [P2] self-verifies.", "fake-model"
        if "open research gaps" in prompt:
            return json.dumps([
                {"title": "Multilingual hallucination", "description": "All work is English-only.", "suggested_direction": "Build a multilingual benchmark.",
                 "severity": "High", "supporting_papers": ["P1", "P2", "P99"]},
                {"title": "Unsupported gap", "description": "d", "suggested_direction": "s", "severity": "weird", "supporting_papers": ["not-a-paper"]},
            ]), "fake-model"
        if "independent evidence auditor" in prompt:
            # Every gap that reaches the auditor cites real papers; confirm the first, reject any others.
            n = len(re.findall(r"^\[G\d+\]", prompt, re.MULTILINE))
            out = [{"gap": "G1", "verdict": "supported", "confirmed_papers": ["P1", "P2"], "reason": "both cite English-only data"}]
            out += [{"gap": f"G{i + 1}", "verdict": "unsupported", "confirmed_papers": [], "reason": "not mentioned"} for i in range(1, n)]
            return json.dumps(out), "fake-model"
        if "literature review and gap analysis report" in prompt:
            return "# Literature Review\n\nSee [P1] and [P2].", "fake-model"
        if "answering questions about a literature corpus" in prompt:
            return "Retrieval helps [P1]; verification helps [P2]. Unknown [P42].", "fake-model"
        if "peer reviewer" in prompt:
            return json.dumps({"overall_score": "71", "readiness_level": "Major revisions", "executive_summary": "ok",
                               "gap_alignment": "partial", "methodology_critique": "weak baselines",
                               "benchmark_suggestions": ["TruthfulQA"], "missing_citations": [{"paper": "P1", "relevance_reason": "closest work"}, {"paper": "P77"}],
                               "actionable_recommendations": ["add baselines"], "suggested_changes_markdown": "- fix"}), "fake-model"
        raise AssertionError(f"Unexpected prompt: {prompt[:120]}")


@pytest.fixture(autouse=True)
def patch_pipeline(monkeypatch):
    llm = FakeLLM(fail_titles={"Calibrated uncertainty for hallucination detection in LLMs"})
    monkeypatch.setattr(orch, "search_papers", fake_search)
    monkeypatch.setattr(orch, "call_llm", llm)
    monkeypatch.setattr(research, "call_llm", llm)
    return llm


def run(coro_fn):
    """Each test gets a fresh event loop; pooled DB connections must not leak across loops."""
    async def wrapper():
        try:
            await coro_fn()
        finally:
            await engine.dispose()
    asyncio.run(wrapper())


async def _client():
    await init_db()
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test", timeout=60)


def test_ranking_prefers_on_topic_papers():
    ranked = rank_papers(fake_search([]), TOPIC, ["retrieval augmented generation hallucination"])
    assert "crop yield" not in ranked[0]["title"]
    assert ranked[-1]["title"] in {"A survey of crop yield prediction", "Untitled preprint with no abstract"}
    assert all(0 <= p["relevance"] <= 1 for p in ranked)


def test_full_pipeline_retry_ask_and_critique(patch_pipeline):
    async def scenario():
        client = await _client()
        async with client:
            r = await client.post("/api/research", json={"topic": TOPIC})
            assert r.status_code == 201
            pid = r.json()["project_id"]  # ASGITransport waits for the background pipeline

            status = (await client.get(f"/api/research/{pid}/status")).json()
            assert status["status"] == "done", status
            assert status["completed_at"]
            agents = {e["agent"] for e in status["events"]}
            assert {"Query", "Retrieval", "Extraction", "Comparison", "Gaps", "Verifier", "Report"} <= agents
            assert any(e["level"] == "warn" for e in status["events"]), "failed paper should be logged"

            papers = (await client.get(f"/api/research/{pid}/papers")).json()
            titles = [p["title"] for p in papers]
            # No-abstract paper is never analysed with invented context; the failed one is dropped
            assert "Untitled preprint with no abstract" not in titles
            assert "Calibrated uncertainty for hallucination detection in LLMs" not in titles
            assert [p["label"] for p in papers] == [f"P{i + 1}" for i in range(len(papers))]
            assert all(p["analysis"] for p in papers)
            assert papers[0]["analysis"]["future_work"] == orch.NOT_REPORTED
            assert papers[0]["analysis"]["model_used"] == "fake-model"
            relevances = [p["relevance"] for p in papers]
            assert relevances == sorted(relevances, reverse=True)

            gaps = (await client.get(f"/api/research/{pid}/gaps")).json()
            assert gaps[0]["severity"] == "high"
            assert [s["id"] for s in gaps[0]["supporting_papers"]] == [papers[0]["id"], papers[1]["id"]]
            # The uncited gap is rejected by the Verifier (never shown without evidence), which triggers one
            # revision round in the Gap agent; the re-proposed duplicate is not stored twice.
            assert len(gaps) == 1, gaps
            gap_prompts = [c for c in patch_pipeline.calls if "open research gaps" in c]
            assert len(gap_prompts) == 2 and "REJECTED" in gap_prompts[1] and "cites no paper" in gap_prompts[1]
            assert any(e["agent"] == "Verifier" and "Rejected" in e["message"] for e in status["events"])

            # Retry must replace, not duplicate
            before = (len(papers), len(gaps), len((await client.get(f"/api/research/{pid}/comparison")).json()))
            assert (await client.post(f"/api/research/{pid}/retry")).status_code == 200
            after_papers = (await client.get(f"/api/research/{pid}/papers")).json()
            after = (len(after_papers), len((await client.get(f"/api/research/{pid}/gaps")).json()),
                     len((await client.get(f"/api/research/{pid}/comparison")).json()))
            assert before == after, (before, after)

            ask = (await client.post(f"/api/research/{pid}/ask", json={"question": "What works best?"})).json()
            assert [c["label"] for c in ask["citations"]] == ["P1", "P2"]

            crit = (await client.post(f"/api/research/{pid}/critique-paper",
                                      json={"title": "My draft", "draft_text": "We propose a new decoding trick."})).json()
            assert crit["overall_score"] == 71
            assert [c["paper_id"] for c in crit["missing_citations"]] == [after_papers[0]["id"]]

            listing = (await client.get("/api/research")).json()
            mine = next(p for p in listing if p["id"] == pid)
            assert mine["gaps_count"] == 1 and mine["papers_count"] == len(after_papers)

            assert (await client.delete(f"/api/research/{pid}")).status_code == 204

    run(scenario)


def test_llm_calls_do_not_block_the_event_loop(monkeypatch, patch_pipeline):
    """A slow critique must not freeze other requests (the old code called the LLM synchronously)."""
    def slow_llm(prompt, json_mode=False):
        time.sleep(1.5)
        return patch_pipeline(prompt, json_mode)

    async def scenario():
        client = await _client()
        async with client:
            pid = (await client.post("/api/research", json={"topic": TOPIC})).json()["project_id"]
            monkeypatch.setattr(research, "call_llm", slow_llm)
            critique = asyncio.create_task(client.post(f"/api/research/{pid}/critique-paper",
                                                       json={"title": "Draft", "draft_text": "Some draft text here."}))
            await asyncio.sleep(0.1)
            t0 = time.perf_counter()
            assert (await client.get("/api/health")).status_code == 200
            assert time.perf_counter() - t0 < 0.5
            assert (await critique).status_code == 200
            await client.delete(f"/api/research/{pid}")

    run(scenario)


def test_coverage_loop_replans_queries_when_search_is_thin(monkeypatch, patch_pipeline):
    """If the first search round finds too little, Retrieval hands back to the Query agent with feedback."""
    rounds = []

    def thin_then_rich_search(queries, **kw):
        rounds.append(list(queries))
        return [] if len(rounds) == 1 else fake_search(queries)

    monkeypatch.setattr(orch, "search_papers", thin_then_rich_search)

    async def scenario():
        client = await _client()
        async with client:
            pid = (await client.post("/api/research", json={"topic": TOPIC})).json()["project_id"]
            status = (await client.get(f"/api/research/{pid}/status")).json()
            assert status["status"] == "done", status
            assert len(rounds) == 2
            replans = [c for c in patch_pipeline.calls if "already tried" in c]
            assert len(replans) == 1 and TOPIC in replans[0]
            assert any(e["agent"] == "Retrieval" and "Coverage insufficient" in e["message"] for e in status["events"])
            papers = (await client.get(f"/api/research/{pid}/papers")).json()
            assert len(papers) >= orch.MIN_PAPERS
            await client.delete(f"/api/research/{pid}")

    run(scenario)


def test_coverage_loop_gives_up_after_max_rounds(monkeypatch, patch_pipeline):
    monkeypatch.setattr(orch, "search_papers", lambda queries, **kw: [])

    async def scenario():
        client = await _client()
        async with client:
            pid = (await client.post("/api/research", json={"topic": TOPIC})).json()["project_id"]
            status = (await client.get(f"/api/research/{pid}/status")).json()
            assert status["status"] == "error"
            assert "after 2 search round" in (status["error_message"] or "")
            await client.delete(f"/api/research/{pid}")

    run(scenario)
